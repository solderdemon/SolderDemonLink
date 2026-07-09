import { Upload, X } from "lucide-react";
import type { TransferProgress } from "../types";

type TransferPaneProps = {
  connected: boolean;
  fileName: string | null;
  transferring: boolean;
  progress: TransferProgress | null;
  transferMessage: string;
  labels: {
    dropzone: string;
    browse: string;
    noFile: string;
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
          <button className="connect" type="button" disabled={!connected || !fileName} onClick={onStartSend}>
            {labels.send}
          </button>
        )}
      </div>
    </div>
  );
}