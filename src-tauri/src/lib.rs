mod kermit;

use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
struct SerialState {
    port: Arc<Mutex<Option<Box<dyn serialport::SerialPort>>>>,
    stop: Mutex<Option<Arc<AtomicBool>>>,
    /// Set while a Kermit transfer owns the port, so the console reader parks.
    transferring: Arc<AtomicBool>,
    /// Requests an in-flight transfer to abort.
    cancel: Arc<AtomicBool>,
}

#[derive(Serialize)]
struct PortInfo {
    name: String,
    kind: String,
}

fn stop_reader(state: &SerialState) {
    if let Some(stop) = state.stop.lock().unwrap().take() {
        stop.store(true, Ordering::Relaxed);
    }
    *state.port.lock().unwrap() = None;
}

#[tauri::command]
fn list_ports() -> Result<Vec<PortInfo>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(ports
        .into_iter()
        .map(|p| PortInfo {
            name: p.port_name,
            kind: match p.port_type {
                serialport::SerialPortType::UsbPort(_) => "USB".into(),
                serialport::SerialPortType::BluetoothPort => "Bluetooth".into(),
                serialport::SerialPortType::PciPort => "PCI".into(),
                serialport::SerialPortType::Unknown => "Serial".into(),
            },
        })
        .collect())
}

#[tauri::command]
fn open_port(
    app: AppHandle,
    state: State<SerialState>,
    name: String,
    baud: u32,
) -> Result<(), String> {
    stop_reader(&state);

    // 8-N-1 with no flow control: an 8-bit clean, transparent path. This mirrors
    // the ckermit `set parity none` / `set flow-control none` settings the
    // rosco_m68k kermit receiver needs. Without it the high data bit or the
    // XON/XOFF bytes can be stripped, corrupting the binary mid-transfer (the
    // device then jumps into garbage and faults with an illegal instruction).
    let port = serialport::new(&name, baud)
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .flow_control(serialport::FlowControl::None)
        .timeout(Duration::from_millis(50))
        .open()
        .map_err(|e| e.to_string())?;

    let mut reader = port.try_clone().map_err(|e| e.to_string())?;
    let stop = Arc::new(AtomicBool::new(false));
    let transferring = state.transferring.clone();

    *state.port.lock().unwrap() = Some(port);
    *state.stop.lock().unwrap() = Some(stop.clone());

    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            // A Kermit transfer takes exclusive ownership of the port; stay idle.
            if transferring.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(20));
                continue;
            }
            match reader.read(&mut buf) {
                Ok(0) => {}
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit("serial:data", chunk);
                }
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(e) => {
                    // A manual close may interrupt a blocked read. It is not a
                    // connection failure, so do not show the recovery UI for it.
                    if !stop.load(Ordering::Relaxed) {
                        let _ = app.emit("serial:closed", e.to_string());
                    }
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn close_port(state: State<SerialState>) -> Result<(), String> {
    stop_reader(&state);
    Ok(())
}

#[tauri::command]
fn write_port(state: State<SerialState>, data: String) -> Result<(), String> {
    let mut guard = state.port.lock().unwrap();
    let port = guard.as_mut().ok_or("Port is not open")?;
    port.write_all(data.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
fn kermit_send(app: AppHandle, state: State<SerialState>, path: String) -> Result<(), String> {
    if state.port.lock().unwrap().is_none() {
        return Err("Port is not open".into());
    }
    if state.transferring.swap(true, Ordering::SeqCst) {
        return Err("A transfer is already in progress".into());
    }
    state.cancel.store(false, Ordering::SeqCst);

    let port = state.port.clone();
    let transferring = state.transferring.clone();
    let cancel = state.cancel.clone();

    std::thread::spawn(move || {
        // Let the console reader observe `transferring` and park (its read
        // timeout is 50ms) before we take the port lock and drain stale input.
        std::thread::sleep(Duration::from_millis(150));

        let result = {
            let mut guard = port.lock().unwrap();
            match guard.as_mut() {
                Some(p) => kermit::send_file(&mut **p, &path, &app, &cancel),
                None => Err("Port closed".into()),
            }
        };

        transferring.store(false, Ordering::SeqCst);
        match result {
            Ok(name) => {
                let _ = app.emit("kermit:done", name);
            }
            Err(message) => {
                let _ = app.emit("kermit:error", message);
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn kermit_cancel(state: State<SerialState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

// On Windows, listen for OS device-change notifications (WM_DEVICECHANGE) instead
// of polling. A hidden message-only window receives the broadcast and forwards a
// "serial:devices-changed" event to the frontend, which then re-enumerates ports.
#[cfg(windows)]
unsafe extern "system" fn device_wndproc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::LRESULT;
    use windows::Win32::UI::WindowsAndMessaging::{
        DefWindowProcW, GetWindowLongPtrW, GWLP_USERDATA, WM_DEVICECHANGE,
    };

    const DBT_DEVNODES_CHANGED: usize = 0x0007;

    if msg == WM_DEVICECHANGE && wparam.0 == DBT_DEVNODES_CHANGED {
        let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        if ptr != 0 {
            let app = &*(ptr as *const AppHandle);
            let _ = app.emit("serial:devices-changed", ());
        }
        return LRESULT(0);
    }

    DefWindowProcW(hwnd, msg, wparam, lparam)
}

#[cfg(windows)]
fn watch_devices(app: AppHandle) {
    use windows::core::w;
    use windows::Win32::Foundation::HINSTANCE;
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DispatchMessageW, GetMessageW, RegisterClassW, SetWindowLongPtrW,
        TranslateMessage, GWLP_USERDATA, HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE,
        WNDCLASSW,
    };

    std::thread::spawn(move || unsafe {
        let instance = match GetModuleHandleW(None) {
            Ok(h) => HINSTANCE(h.0),
            Err(_) => return,
        };

        let class_name = w!("SolderDemonDeviceWatcher");
        let wc = WNDCLASSW {
            lpfnWndProc: Some(device_wndproc),
            hInstance: instance,
            lpszClassName: class_name,
            ..Default::default()
        };
        RegisterClassW(&wc);

        let hwnd = match CreateWindowExW(
            WINDOW_EX_STYLE(0),
            class_name,
            w!("solderdemon-device-watcher"),
            WINDOW_STYLE(0),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE),
            None,
            Some(instance),
            None,
        ) {
            Ok(h) => h,
            Err(_) => return,
        };

        // Hand ownership of the AppHandle to the window so the wndproc can reach it.
        let boxed = Box::into_raw(Box::new(app)) as isize;
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, boxed);

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SerialState::default())
        .setup(|_app| {
            #[cfg(windows)]
            watch_devices(_app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_ports,
            open_port,
            close_port,
            write_port,
            kermit_send,
            kermit_cancel
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
