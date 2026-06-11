use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
struct SerialState {
    port: Mutex<Option<Box<dyn serialport::SerialPort>>>,
    stop: Mutex<Option<Arc<AtomicBool>>>,
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

    let port = serialport::new(&name, baud)
        .timeout(Duration::from_millis(50))
        .open()
        .map_err(|e| e.to_string())?;

    let mut reader = port.try_clone().map_err(|e| e.to_string())?;
    let stop = Arc::new(AtomicBool::new(false));

    *state.port.lock().unwrap() = Some(port);
    *state.stop.lock().unwrap() = Some(stop.clone());

    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            match reader.read(&mut buf) {
                Ok(0) => {}
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit("serial:data", chunk);
                }
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(e) => {
                    let _ = app.emit("serial:closed", e.to_string());
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
        .manage(SerialState::default())
        .setup(|_app| {
            #[cfg(windows)]
            watch_devices(_app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_ports, open_port, close_port, write_port
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
