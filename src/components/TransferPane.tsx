import { Upload, X } from "lucide-react";
import type { FirmwareInfo, TransferProgress } from "../types";

type TransferPaneProps = {
  connected: boolean;
  fileName: string | null;
  firmwareInfo: FirmwareInfo | null;
  inspectingFirmware: boolean;
  transferring: boolean;
  progress: TransferProgress | null;
  transferMessage: string;
  labels: {
    dropzone: string;
    browse: string;
    noFile: string;
    inspecting: string;
    size: string;
    sha256: string;
    crc32: string;
    cancel: string;
    connectFirst: string;
    send: string;
  };
  progressLabel: string | null;
  onChooseFile: () => void;
  onClearFile: () => void;
  onStartSend: () => void;
  onCancelSend: () => void;
};

export function TransferPane({
  connected,
  fileName,
  firmwareInfo,
  inspectingFirmware,
  transferring,
  progress,
  transferMessage,
  labels,
  progressLabel,
  onChooseFile,
  onClearFile,
  onStartSend,
  onCancelSend,
}: TransferPaneProps) {
  return (
    <div className="column">
      <div className="dropzone">
        <Upload size={20} strokeWidth={1.6} className="dim" />
        <p className="dim">
          {labels.dropzone}{" "}
          <button className="link" type="button" onClick={onChooseFile}>
            {labels.browse}
          </button>
        </p>
      </div>

      <div className="transfer-file">
        <span className={fileName ? undefined : "dim"}>{fileName ?? labels.noFile}</span>
        {fileName && !transferring && (
          <button className="icon-button" type="button" onClick={onClearFile} aria-label={labels.cancel}>
            <X size={14} />
          </button>
        )}
      </div>

      {inspectingFirmware && <p className="dim transfer-inspecting">{labels.inspecting}</p>}

      {firmwareInfo && (
        <dl className="firmware-details" aria-label={firmwareInfo.name}>
          <div>
            <dt>{labels.size}</dt>
            <dd>{firmwareInfo.size.toLocaleString()} B</dd>
          </div>
          <div>
            <dt>{labels.sha256}</dt>
            <dd><code>{firmwareInfo.sha256}</code></dd>
          </div>
          <div>
            <dt>{labels.crc32}</dt>
            <dd><code>{firmwareInfo.crc32}</code></dd>
          </div>
        </dl>
      )}

      {progress && progressLabel && (
        <div className="progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress.total ? (progress.sent / progress.total) * 100 : 0}%` }}
            />
          </div>
          <span className="dim progress-text">{progressLabel}</span>
        </div>
      )}

      {transferMessage && <p className="dim">{transferMessage}</p>}
      {!connected && <p className="dim">{labels.connectFirst}</p>}

      <div className="transfer-actions">
        {transferring ? (
          <button className="ghost" type="button" onClick={onCancelSend}>
            {labels.cancel}
          </button>
        ) : (
          <button
            className="connect"
            type="button"
            disabled={!connected || !fileName || !firmwareInfo || inspectingFirmware}
            onClick={onStartSend}
          >
            {labels.send}
          </button>
        )}
      </div>
    </div>
  );
}
