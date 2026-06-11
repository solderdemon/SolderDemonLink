import { useState } from "react";

type View = "session" | "transfer" | "profiles";

const ports = [
  { name: "COM11", platform: "Windows", profile: "ROSCO Lab", settings: "115200 / 8N1" },
  { name: "/dev/ttyUSB0", platform: "Linux", profile: "Bench UART", settings: "57600 / 8N1" },
  { name: "/dev/cu.usbmodem2101", platform: "macOS", profile: "ROM Console", settings: "115200 / 8N1" },
];

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
  const [activePort, setActivePort] = useState(0);

  const port = ports[activePort];

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">SolderDemon Link</span>

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

        <button className="connect" type="button">
          Connect
        </button>
      </header>

      <main className="content">
        {view === "session" && (
          <div className="terminal">
            <p>&gt; open {port.name}</p>
            <p>&gt; wait for banner</p>
            <p className="dim">Drop a file here to queue a transfer.</p>
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
            <ul className="list">
              {ports.map((p, index) => (
                <li key={p.name}>
                  <button
                    className={`row row-button${index === activePort ? " is-active" : ""}`}
                    type="button"
                    onClick={() => setActivePort(index)}
                  >
                    <span>{p.name}</span>
                    <span className="dim">{p.profile}</span>
                    <span className="dim">{p.settings}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button className="ghost" type="button">
              Scan ports
            </button>
          </div>
        )}
      </main>

      <footer className="statusbar">
        <span>{port.name}</span>
        <span>{port.settings}</span>
        <span>disconnected</span>
        <span className="statusbar-end">{queue.length} queued</span>
      </footer>
    </div>
  );
}

export default App;
