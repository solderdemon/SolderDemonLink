import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { Globe2, Settings2, SquareTerminal, Upload, Waypoints, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Dropdown } from "./Dropdown";

type View = "session" | "transfer" | "settings";

type PortInfo = { name: string; kind: string };

const bauds = [9600, 19200, 38400, 57600, 115200];
const DEFAULT_BAUD = 38400;

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
  const [input, setInput] = useState("");
  const termHostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const [filePath, setFilePath] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [transferMsg, setTransferMsg] = useState("");

  const fileName = filePath ? (filePath.split(/[\\/]/).pop() ?? filePath) : null;

  function acceptFile(path: string) {
    if (!path.toLowerCase().endsWith(".bin")) {
      setFilePath(null);
      setTransferMsg(t("transfer.onlyBin"));
      return;
    }
    setFilePath(path);
    setTransferMsg("");
  }

  const views: { id: View; label: string; iconOnly?: boolean }[] = [
    { id: "session", label: t("tabs.session") },
    { id: "transfer", label: t("tabs.transfer") },
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

  function appendStatus(text: string) {
    // A dim, bracketed status line written into the terminal alongside the
    // device's own output. Force a fresh line in case the device left the
    // cursor mid-row (e.g. a progress line ending in a bare CR).
    termRef.current?.write(`\r\n\x1b[2m[${text}]\x1b[0m\r\n`);
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

  // Spin up the xterm.js emulator once and keep it for the app's lifetime so
  // the scrollback survives tab switches. It interprets CR/LF, cursor moves and
  // ANSI colour the way a real terminal does, so progress lines that end in a
  // bare CR overwrite in place instead of piling up row by row.
  useEffect(() => {
    if (termRef.current) return;
    let term: Terminal | null = null;
    let disposed = false;

    // Wait for the web font before measuring glyph cells. xterm latches the
    // character width at open() time; if it samples a fallback font the real
    // IBM Plex Mono renders at a different advance and box-drawing/ASCII art
    // drifts out of alignment. Build the terminal only once the font is ready.
    document.fonts.load('13px "IBM Plex Mono"').then(() => {
      if (disposed || !termHostRef.current || termRef.current) return;

      term = new Terminal({
        // Treat a bare LF as CR+LF (like a standard serial terminal's "implicit
        // CR on LF"). rosco ends some lines — notably the boot banner — with LF
        // only; without this each line starts where the previous ended and the
        // ASCII art walks diagonally off to the right. A bare CR still returns
        // to column 0 on its own, so in-place progress updates keep working.
        convertEol: true,
        cursorBlink: true,
        scrollback: 5000,
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 13,
        theme: {
          background: "#0e0f10",
          foreground: "#e8e6e1",
          cursor: "#ff7a00",
          selectionBackground: "rgba(255, 122, 0, 0.3)",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(termHostRef.current);
      fit.fit();

      // Echo keystrokes typed directly into the terminal out to the port.
      term.onData((d) => {
        invoke("write_port", { data: d }).catch(() => {});
      });

      termRef.current = term;
      fitRef.current = fit;
    });

    return () => {
      disposed = true;
      term?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Refit on window resize and whenever the session tab becomes visible again
  // (a hidden terminal has zero dimensions, so its layout must be recomputed).
  useEffect(() => {
    const refit = () => fitRef.current?.fit();
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, []);

  useEffect(() => {
    if (view === "session") requestAnimationFrame(() => fitRef.current?.fit());
  }, [view]);

  useEffect(() => {
    scanPorts();

    const unlistenData = listen<string>("serial:data", (event) => {
      termRef.current?.write(event.payload);
    });
    const unlistenClosed = listen<string>("serial:closed", (event) => {
      setConnected(false);
      appendStatus(t("status.connectionLost", { message: event.payload }));
    });
    const unlistenDevices = listen("serial:devices-changed", () => scanPorts());

    const unlistenKStart = listen<{ name: string; total: number }>("kermit:start", (e) => {
      setTransferring(true);
      setProgress({ sent: 0, total: e.payload.total });
      setTransferMsg(t("transfer.sending", { name: e.payload.name }));
    });
    const unlistenKProgress = listen<{ sent: number; total: number }>("kermit:progress", (e) => {
      setProgress({ sent: e.payload.sent, total: e.payload.total });
    });
    const unlistenKDone = listen<string>("kermit:done", (e) => {
      setTransferring(false);
      setProgress(null);
      setTransferMsg(t("transfer.done", { name: e.payload }));
    });
    const unlistenKError = listen<string>("kermit:error", (e) => {
      setTransferring(false);
      setProgress(null);
      setTransferMsg(t("transfer.failed", { message: e.payload }));
    });

    return () => {
      unlistenData.then((fn) => fn());
      unlistenClosed.then((fn) => fn());
      unlistenDevices.then((fn) => fn());
      unlistenKStart.then((fn) => fn());
      unlistenKProgress.then((fn) => fn());
      unlistenKDone.then((fn) => fn());
      unlistenKError.then((fn) => fn());
    };
  }, [t]);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop" && event.payload.paths.length > 0) {
        // One file at a time: take the first dropped path.
        acceptFile(event.payload.paths[0]);
        setView("transfer");
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (connected) return;
    const id = setInterval(scanPorts, 5000);
    return () => clearInterval(id);
  }, [connected]);

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

  async function chooseFile() {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Firmware", extensions: ["bin"] }],
    });
    if (typeof selected === "string") {
      acceptFile(selected);
    }
  }

  async function startSend() {
    if (!filePath) return;
    setTransferMsg("");
    setTransferring(true);
    try {
      await invoke("kermit_send", { path: filePath });
    } catch (e) {
      setTransferring(false);
      setTransferMsg(t("transfer.failed", { message: String(e) }));
    }
  }

  async function cancelSend() {
    try {
      await invoke("kermit_cancel");
    } catch {
      // ignore
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
        <div className={`terminal${view === "session" ? "" : " is-hidden"}`}>
          <div className="terminal-log" ref={termHostRef} />
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

        {view === "transfer" && (
          <div className="column">
            <div className="dropzone">
              <Upload size={20} strokeWidth={1.6} className="dim" />
              <p className="dim">
                {t("transfer.dropzone")}{" "}
                <button className="link" type="button" onClick={chooseFile}>
                  {t("transfer.browse")}
                </button>
              </p>
            </div>

            <div className="transfer-file">
              <span className={fileName ? undefined : "dim"}>
                {fileName ?? t("transfer.noFile")}
              </span>
              {fileName && !transferring && (
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setFilePath(null)}
                  aria-label={t("transfer.cancel")}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {progress && (
              <div className="progress">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${progress.total ? (progress.sent / progress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="dim progress-text">
                  {t("transfer.progress", { sent: progress.sent, total: progress.total })}
                </span>
              </div>
            )}

            {transferMsg && <p className="dim">{transferMsg}</p>}
            {!connected && <p className="dim">{t("transfer.connectFirst")}</p>}

            <div className="transfer-actions">
              {transferring ? (
                <button className="ghost" type="button" onClick={cancelSend}>
                  {t("transfer.cancel")}
                </button>
              ) : (
                <button
                  className="connect"
                  type="button"
                  disabled={!connected || !filePath}
                  onClick={startSend}
                >
                  {t("transfer.send")}
                </button>
              )}
            </div>
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
        <span className="statusbar-end">{transferMsg}</span>
      </footer>
    </div>
  );
}

export default App;
