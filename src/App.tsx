import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Globe2, Settings2, SquareTerminal, Waypoints } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "./Dropdown";
import { queue } from "./translations";

type View = "session" | "transfer" | "profiles" | "settings";

type PortInfo = { name: string; kind: string };

const bauds = [9600, 19200, 38400, 57600, 115200];
const DEFAULT_BAUD = 38400;
const MAX_LOG = 100_000;

function App() {
  const { t, i18n } = useTranslation();
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

  const views: { id: View; label: string; iconOnly?: boolean }[] = [
    { id: "session", label: t("tabs.session") },
    { id: "transfer", label: t("tabs.transfer") },
    { id: "profiles", label: t("tabs.profiles") },
    { id: "settings", label: t("tabs.settings"), iconOnly: true },
  ];

  const languageOptions = [
    { value: "en", label: t("languages.en") },
    { value: "uk", label: t("languages.uk") },
  ];

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
      if (manual) appendStatus(t("status.portScanFailed", { message: String(e) }));
    }
  }

  useEffect(() => {
    scanPorts();

    const unlistenData = listen<string>("serial:data", (event) => {
      append(event.payload);
    });
    const unlistenClosed = listen<string>("serial:closed", (event) => {
      setConnected(false);
      appendStatus(t("status.connectionLost", { message: event.payload }));
    });
    const unlistenDevices = listen("serial:devices-changed", () => scanPorts());

    return () => {
      unlistenData.then((fn) => fn());
      unlistenClosed.then((fn) => fn());
      unlistenDevices.then((fn) => fn());
    };
  }, [t]);

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
        appendStatus(t("status.disconnectedFrom", { port: portName }));
      } else {
        await invoke("open_port", { name: portName, baud });
        setConnected(true);
        appendStatus(t("status.connectedTo", { port: portName, baud }));
        setView("session");
      }
    } catch (e) {
      appendStatus(t("status.error", { message: String(e) }));
    }
  }

  async function sendInput() {
    if (!input) return;
    try {
      await invoke("write_port", { data: input + "\r" });
      setInput("");
    } catch (e) {
      appendStatus(t("status.writeFailed", { message: String(e) }));
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <nav className="tabs">
          {views.map((v) => (
            <button
              key={v.id}
              className={`tab${v.iconOnly ? " tab-icon-only" : ""}${view === v.id ? " is-active" : ""}`}
              type="button"
              onClick={() => setView(v.id)}
              aria-label={v.label}
              title={v.label}
            >
              {v.id === "settings" ? <Settings2 className="tab-icon" aria-hidden="true" /> : v.label}
            </button>
          ))}
        </nav>

        <div className="topbar-controls">
          <Dropdown
            ariaLabel={t("controls.port")}
            placeholder={t("controls.noPorts")}
            emptyLabel={t("controls.noPorts")}
            icon={<SquareTerminal size={14} strokeWidth={1.8} />}
            value={portName}
            disabled={connected}
            onChange={setPortName}
            options={ports.map((p) => ({ value: p.name, label: p.name }))}
          />

          <Dropdown
            ariaLabel={t("controls.baudRate")}
            icon={<Waypoints size={14} strokeWidth={1.8} />}
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
            {connected ? t("controls.disconnect") : t("controls.connect")}
          </button>
        </div>
      </header>

      <main className="content">
        {view === "session" && (
          <div className="terminal">
            <pre className="terminal-log" ref={logRef}>
              {log || t("terminal.empty")}
            </pre>
            <div className="send-line">
              <span className="dim">&gt;</span>
              <input
                className="send-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendInput()}
                placeholder={
                  connected ? t("terminal.inputConnected") : t("terminal.inputDisconnected")
                }
                disabled={!connected}
                spellCheck={false}
              />
            </div>
          </div>
        )}

        {view === "transfer" && (
          <div className="column">
            <div className="dropzone">{t("transfer.dropzone")}</div>
            <ul className="list">
              {queue.map((item) => (
                <li className="row" key={item.file}>
                  <span>{item.file}</span>
                  <span className="dim">
                    {item.targetKey === "session"
                      ? t("tabs.session")
                      : t("transfer.flashStaging")}
                  </span>
                  <span className="state">
                    {item.stateKey === "queued" ? t("transfer.queued") : t("transfer.pending")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {view === "profiles" && (
          <div className="column">
            {ports.length === 0 && <p className="dim">{t("profiles.empty")}</p>}
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
              {t("profiles.scan")}
            </button>
          </div>
        )}

        {view === "settings" && (
          <div className="column settings-panel">
            <section className="settings-group">
              <div className="settings-group-label">{t("settings.title")}</div>
              <div className="settings-row">
                <div className="settings-row-copy">
                  <span className="settings-row-title">{t("settings.languageLabel")}</span>
                  <span className="dim settings-row-text">{t("settings.description")}</span>
                </div>

                <div className="settings-row-control">
                  <Dropdown
                    ariaLabel={t("controls.language")}
                    emptyLabel={t("controls.noOptions")}
                    icon={<Globe2 size={14} strokeWidth={1.8} />}
                    value={i18n.language.startsWith("uk") ? "uk" : "en"}
                    onChange={(language) => void i18n.changeLanguage(language)}
                    options={languageOptions}
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      <footer className="statusbar">
        <span>{portName || t("status.noPort")}</span>
        <span>{baud} 8N1</span>
        <span className={connected ? "status-connected" : undefined}>
          {connected ? t("status.connected") : t("status.disconnected")}
        </span>
        <span className="statusbar-end">{t("status.queuedCount", { count: queue.length })}</span>
      </footer>
    </div>
  );
}

export default App;
