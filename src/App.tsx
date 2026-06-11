import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Dropdown } from "./Dropdown";

type View = "session" | "transfer" | "profiles";

type PortInfo = { name: string; kind: string };

const bauds = [9600, 19200, 38400, 57600, 115200];
const DEFAULT_BAUD = 38400;
const MAX_LOG = 100_000;

const queue = [
  { file: "monitor.bin", target: "session", state: "Queued" },
  { file: "boot.hex", target: "flash staging", state: "Pending" },
];

const views: { id: View; label: string }[] = [
  { id: "session", label: "Session" },
  { id: "transfer", label: "Transfer" },
  { id: "profiles", label: "Profiles" },
];

function App() {
  const [view, setView] = useState<View>("session");
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [portName, setPortName] = useState(() => localStorage.getItem("sd.port") ?? "");
  const [baud, setBaud] = useState(() => {
    const saved = Number(localStorage.getItem("sd.baud"));
    return bauds.includes(saved) ? saved : DEFAULT_BAUD;
  });
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState("");
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (portName) localStorage.setItem("sd.port", portName);
  }, [portName]);

  useEffect(() => {
    localStorage.setItem("sd.baud", String(baud));
  }, [baud]);

  function append(text: string) {
    setLog((prev) => (prev + text).slice(-MAX_LOG));
  }

  function appendStatus(text: string) {
    append(`\n[${text}]\n`);
  }

  async function scanPorts(manual = false) {
    try {
      const found = await invoke<PortInfo[]>("list_ports");
      setPorts((prev) =>
        JSON.stringify(prev) === JSON.stringify(found) ? prev : found,
      );
      setPortName((current) =>
        found.some((p) => p.name === current) ? current : (found[0]?.name ?? ""),
      );
    } catch (e) {
      if (manual) appendStatus(`port scan failed: ${e}`);
    }
  }

  useEffect(() => {
    scanPorts();

    const unlistenData = listen<string>("serial:data", (event) => {
      append(event.payload);
    });
    const unlistenClosed = listen<string>("serial:closed", (event) => {
      setConnected(false);
      appendStatus(`connection lost: ${event.payload}`);
    });
    // Windows pushes this when a device is plugged in/out (WM_DEVICECHANGE).
    const unlistenDevices = listen("serial:devices-changed", () => scanPorts());

    return () => {
      unlistenData.then((fn) => fn());
      unlistenClosed.then((fn) => fn());
      unlistenDevices.then((fn) => fn());
    };
  }, []);

  // Fallback poll: covers non-Windows platforms and any missed device event.
  useEffect(() => {
    if (connected) return;
    const id = setInterval(scanPorts, 5000);
    return () => clearInterval(id);
  }, [connected]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, view]);

  async function toggleConnect() {
    try {
      if (connected) {
        await invoke("close_port");
        setConnected(false);
        appendStatus(`disconnected from ${portName}`);
      } else {
        await invoke("open_port", { name: portName, baud });
        setConnected(true);
        appendStatus(`connected to ${portName} @ ${baud}`);
        setView("session");
      }
    } catch (e) {
      appendStatus(`error: ${e}`);
    }
  }

  async function sendInput() {
    if (!input) return;
    try {
      await invoke("write_port", { data: input + "\r" });
      setInput("");
    } catch (e) {
      appendStatus(`write failed: ${e}`);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <nav className="tabs">
          {views.map((v) => (
            <button
              key={v.id}
              className={`tab${view === v.id ? " is-active" : ""}`}
              type="button"
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </nav>

        <div className="topbar-controls">
          <Dropdown
            ariaLabel="Port"
            placeholder="no ports"
            value={portName}
            disabled={connected}
            onChange={setPortName}
            options={ports.map((p) => ({ value: p.name, label: p.name }))}
          />

          <Dropdown
            ariaLabel="Baud rate"
            value={String(baud)}
            disabled={connected}
            onChange={(v) => setBaud(Number(v))}
            options={bauds.map((b) => ({ value: String(b), label: String(b) }))}
          />

          <button
            className={`connect${connected ? " is-connected" : ""}`}
            type="button"
            disabled={!connected && !portName}
            onClick={toggleConnect}
          >
            {connected ? "Disconnect" : "Connect"}
          </button>
        </div>
      </header>

      <main className="content">
        {view === "session" && (
          <div className="terminal">
            <pre className="terminal-log" ref={logRef}>
              {log || "Not connected. Pick a port and press Connect.\n"}
            </pre>
            <div className="send-line">
              <span className="dim">&gt;</span>
              <input
                className="send-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendInput()}
                placeholder={connected ? "type and press Enter" : "not connected"}
                disabled={!connected}
                spellCheck={false}
              />
            </div>
          </div>
        )}

        {view === "transfer" && (
          <div className="column">
            <div className="dropzone">Drop file for C-Kermit queue</div>
            <ul className="list">
              {queue.map((item) => (
                <li className="row" key={item.file}>
                  <span>{item.file}</span>
                  <span className="dim">{item.target}</span>
                  <span className="state">{item.state}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {view === "profiles" && (
          <div className="column">
            {ports.length === 0 && <p className="dim">No serial ports found.</p>}
            <ul className="list">
              {ports.map((p) => (
                <li key={p.name}>
                  <button
                    className={`row row-button${p.name === portName ? " is-active" : ""}`}
                    type="button"
                    disabled={connected}
                    onClick={() => setPortName(p.name)}
                  >
                    <span>{p.name}</span>
                    <span className="dim">{p.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button className="ghost" type="button" onClick={() => scanPorts(true)}>
              Scan ports
            </button>
          </div>
        )}
      </main>

      <footer className="statusbar">
        <span>{portName || "no port"}</span>
        <span>{baud} 8N1</span>
        <span className={connected ? "status-connected" : undefined}>
          {connected ? "connected" : "disconnected"}
        </span>
        <span className="statusbar-end">{queue.length} queued</span>
      </footer>
    </div>
  );
}

export default App;
