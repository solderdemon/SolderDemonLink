import { useEffect, useState } from "react";
import type { RefObject } from "react";

function demonFrame(eye: string, spark: number): string {
  const gap = Array.from({ length: 9 }, (_, i) => (i === spark ? "*" : " ")).join("");
  return `
      ,           ,
     /             \\
    ((__-^^-,-^^-__))
     '-_---' '---_-'
      '--(${eye}) (${eye})--'
         \\  ^  /
          |vvv|
           '-'

~~~==[]>${gap}<[]==~~~
`;
}

function normalizeArtFrame(art: string): string {
  const lines = art.replace(/^\n/, "").replace(/\n$/, "").split("\n");
  const width = Math.max(...lines.map((line) => line.length));
  return lines.map((line) => line.padEnd(width, " ")).join("\n");
}

const ART_FRAMES = [
  demonFrame("o", 1),
  demonFrame("o", 4),
  demonFrame("o", 7),
  demonFrame("-", -1),
].map(normalizeArtFrame);

type TerminalPaneProps = {
  visible: boolean;
  connected: boolean;
  input: string;
  inputPlaceholder: string;
  emptyTitle: string;
  emptyHint: string;
  hostRef: RefObject<HTMLDivElement | null>;
  onInputChange: (input: string) => void;
  onSendInput: () => void;
};

export function TerminalPane({
  visible,
  connected,
  input,
  inputPlaceholder,
  emptyTitle,
  emptyHint,
  hostRef,
  onInputChange,
  onSendInput,
}: TerminalPaneProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (connected || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % ART_FRAMES.length), 450);
    return () => window.clearInterval(id);
  }, [connected]);

  return (
    <div className={`terminal${visible ? "" : " is-hidden"}`}>
      <div className="terminal-stage">
        <div className="terminal-log" ref={hostRef} />
        {!connected && (
          <div className="terminal-empty" aria-live="polite">
            <pre className="terminal-empty-art" aria-hidden="true">{ART_FRAMES[frame]}</pre>
            <div className="terminal-empty-title">{emptyTitle}</div>
            <div className="terminal-empty-hint">{emptyHint}</div>
          </div>
        )}
      </div>
      {connected && (
        <div className="send-line">
          <span className="dim">&gt;</span>
          <input
            className="send-input"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onSendInput()}
            placeholder={inputPlaceholder}
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}