import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import "@xterm/xterm/css/xterm.css";
import { AppHeader } from "./components/AppHeader";
import { SettingsPane } from "./components/SettingsPane";
import { TerminalPane } from "./components/TerminalPane";
import { TransferPane } from "./components/TransferPane";
import { useXtermTerminal } from "./hooks/useXtermTerminal";
import type { FirmwareInfo, PortInfo, TransferProgress, View } from "./types";

const BAUD_RATES: number[] = [9600, 19200, 38400, 57600, 115200];
const DEFAULT_BAUD = 38400;
type ConnectionState = "idle" | "connected" | "disconnected" | "lost";

function App() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<View>("session");
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [portName, setPortName] = useState(() => localStorage.getItem("sd.port") ?? "");
  const [baud, setBaud] = useState(() => {
    const saved = Number(localStorage.getItem("sd.baud"));
    return BAUD_RATES.includes(saved) ? saved : DEFAULT_BAUD;
  });
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [lostReason, setLostReason] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [firmwareInfo, setFirmwareInfo] = useState<FirmwareInfo | null>(null);
  const [inspectingFirmware, setInspectingFirmware] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [transferMessage, setTransferMessage] = useState("");
  const terminal = useXtermTerminal(view === "session", connected);

  const fileName = filePath ? (filePath.split(/[\\/]/).pop() ?? filePath) : null;
  const progressLabel = progress
    ? t("transfer.progress", { sent: progress.sent, total: progress.total })
    : null;

  async function acceptFile(path: string) {
    if (!path.toLowerCase().endsWith(".bin")) {
      setFilePath(null);
      setFirmwareInfo(null);
      setInspectingFirmware(false);
      setTransferMessage(t("transfer.onlyBin"));
      return;
    }

    setFilePath(path);
    setFirmwareInfo(null);
    setInspectingFirmware(true);
    setTransferMessage("");

    try {
      const info = await invoke<FirmwareInfo>("inspect_firmware", { path });
      setFirmwareInfo(info);
    } catch (error) {
      setFilePath(null);
      setTransferMessage(t("transfer.inspectionFailed", { message: String(error) }));
    } finally {
      setInspectingFirmware(false);
    }
  }

  async function scanPorts(manual = false) {
    try {
      const found = await invoke<PortInfo[]>("list_ports");
      setPorts((previous) =>
        JSON.stringify(previous) === JSON.stringify(found) ? previous : found,
      );
      setPortName((current) =>
        found.some((port) => port.name === current) ? current : (found[0]?.name ?? ""),
      );
    } catch (error) {
      if (manual) terminal.writeStatus(t("status.portScanFailed", { message: String(error) }));
    }
  }

  async function toggleConnect() {
    try {
      if (connected) {
        await invoke("close_port");
        setConnected(false);
        setConnectionState("disconnected");
        terminal.writeStatus(t("status.disconnectedFrom", { port: portName }));
        return;
      }

      await invoke("open_port", { name: portName, baud });
      setConnected(true);
      setConnectionState("connected");
      setLostReason("");
      terminal.writeStatus(t("status.connectedTo", { port: portName, baud }));
      setView("session");
    } catch (error) {
      terminal.writeStatus(t("status.error", { message: String(error) }));
    }
  }

  async function chooseFile() {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Firmware", extensions: ["bin"] }],
    });

    if (typeof selected === "string") await acceptFile(selected);
  }

  async function startSend() {
    if (!filePath || !firmwareInfo) return;

    setTransferMessage("");
    setTransferring(true);

    try {
      await invoke("kermit_send", { path: filePath });
    } catch (error) {
      setTransferring(false);
      setTransferMessage(t("transfer.failed", { message: String(error) }));
    }
  }

  async function cancelSend() {
    setTransferMessage(t("transfer.cancelling"));
    try {
      await invoke("kermit_cancel");
    } catch {}
  }

  useEffect(() => {
    if (portName) localStorage.setItem("sd.port", portName);
  }, [portName]);

  useEffect(() => {
    localStorage.setItem("sd.baud", String(baud));
  }, [baud]);

  useEffect(() => {
    scanPorts();

    const unlistenData = listen<string>("serial:data", (event) => terminal.write(event.payload));
    const unlistenClosed = listen<string>("serial:closed", (event) => {
      setConnected(false);
      setConnectionState("lost");
      setLostReason(event.payload);
      setTransferring(false);
      setProgress(null);
      terminal.writeStatus(t("status.connectionLost", { message: event.payload }));
    });
    const unlistenDevices = listen("serial:devices-changed", () => scanPorts());
    const unlistenKStart = listen<{ name: string; total: number }>("kermit:start", (event) => {
      setTransferring(true);
      setProgress({ sent: 0, total: event.payload.total });
      setTransferMessage(t("transfer.sending", { name: event.payload.name }));
    });
    const unlistenKProgress = listen<TransferProgress>("kermit:progress", (event) => {
      setProgress({ sent: event.payload.sent, total: event.payload.total });
    });
    const unlistenKDone = listen<string>("kermit:done", (event) => {
      setTransferring(false);
      setProgress(null);
      setTransferMessage(t("transfer.done", { name: event.payload }));
    });
    const unlistenKCancelled = listen("kermit:cancelled", () => {
      setTransferring(false);
      setProgress(null);
      setTransferMessage(t("transfer.cancelled"));
    });
    const unlistenKError = listen<string>("kermit:error", (event) => {
      setTransferring(false);
      setProgress(null);
      setTransferMessage(t("transfer.failed", { message: event.payload }));
    });

    return () => {
      unlistenData.then((unlisten) => unlisten());
      unlistenClosed.then((unlisten) => unlisten());
      unlistenDevices.then((unlisten) => unlisten());
      unlistenKStart.then((unlisten) => unlisten());
      unlistenKProgress.then((unlisten) => unlisten());
      unlistenKDone.then((unlisten) => unlisten());
      unlistenKCancelled.then((unlisten) => unlisten());
      unlistenKError.then((unlisten) => unlisten());
    };
  }, [t]);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop" || event.payload.paths.length === 0) return;
      void acceptFile(event.payload.paths[0]);
      setView("transfer");
    });

    return () => {
      unlisten.then((cleanup) => cleanup());
    };
  }, [t]);

  useEffect(() => {
    if (connected) return;
    const interval = setInterval(scanPorts, 5000);
    return () => clearInterval(interval);
  }, [connected]);

  return (
    <div className="app">
      <AppHeader
        view={view}
        ports={ports}
        portName={portName}
        baud={baud}
        baudRates={BAUD_RATES}
        connected={connected}
        labels={{
          session: t("tabs.session"),
          transfer: t("tabs.transfer"),
          settings: t("tabs.settings"),
          port: t("controls.port"),
          noPorts: t("controls.noPorts"),
          baudRate: t("controls.baudRate"),
          connect: t("controls.connect"),
          disconnect: t("controls.disconnect"),
        }}
        onViewChange={setView}
        onPortChange={setPortName}
        onBaudChange={setBaud}
        onToggleConnection={toggleConnect}
      />

      <main className="content">
        <TerminalPane
          visible={view === "session"}
          connected={connected}
          connectionState={connectionState}
          emptyTitle={t("terminal.emptyTitle")}
          emptyHint={t("terminal.emptyHint")}
          connectionLostTitle={t("terminal.connectionLostTitle")}
          connectionLostHint={t("terminal.connectionLostHint", { port: portName })}
          connectionLostReason={lostReason}
          reconnectLabel={t("controls.reconnect")}
          canReconnect={Boolean(portName)}
          hostRef={terminal.hostRef}
          onReconnect={toggleConnect}
        />

        {view === "transfer" && (
          <TransferPane
            connected={connected}
            fileName={fileName}
            firmwareInfo={firmwareInfo}
            inspectingFirmware={inspectingFirmware}
            transferring={transferring}
            progress={progress}
            transferMessage={transferMessage}
            labels={{
              dropzone: t("transfer.dropzone"),
              browse: t("transfer.browse"),
              noFile: t("transfer.noFile"),
              inspecting: t("transfer.inspecting"),
              size: t("transfer.size"),
              sha256: t("transfer.sha256"),
              crc32: t("transfer.crc32"),
              cancel: t("transfer.cancel"),
              connectFirst: t("transfer.connectFirst"),
              send: t("transfer.send"),
            }}
            progressLabel={progressLabel}
            onChooseFile={chooseFile}
            onClearFile={() => {
              setFilePath(null);
              setFirmwareInfo(null);
              setTransferMessage("");
            }}
            onStartSend={startSend}
            onCancelSend={cancelSend}
          />
        )}

        {view === "settings" && (
          <SettingsPane
            language={i18n.language}
            labels={{
              title: t("settings.title"),
              languageLabel: t("settings.languageLabel"),
              description: t("settings.description"),
              language: t("controls.language"),
              noOptions: t("controls.noOptions"),
              english: t("languages.en"),
              ukrainian: t("languages.uk"),
            }}
            onLanguageChange={(language) => void i18n.changeLanguage(language)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
