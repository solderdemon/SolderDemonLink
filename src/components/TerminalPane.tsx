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
  connectionState: "idle" | "connected" | "disconnected" | "lost";
  emptyTitle: string;
  emptyHint: string;
  connectionLostTitle: string;
  connectionLostHint: string;
  connectionLostReason: string;
  reconnectLabel: string;
  canReconnect: boolean;
  hostRef: RefObject<HTMLDivElement | null>;
  onReconnect: () => void;
};

export function TerminalPane({
  visible,
  connected,
  connectionState,
  emptyTitle,
  emptyHint,
  connectionLostTitle,
  connectionLostHint,
  connectionLostReason,
  reconnectLabel,
  canReconnect,
  hostRef,
  onReconnect,
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
        {connectionState === "idle" && (
          <div className="terminal-empty" aria-live="polite">
            <pre className="terminal-empty-art" aria-hidden="true">{ART_FRAMES[frame]}</pre>
            <div className="terminal-empty-title">{emptyTitle}</div>
            <div className="terminal-empty-hint">{emptyHint}</div>
          </div>
        )}
        {connectionState === "lost" && (
          <section className="terminal-lost" aria-live="assertive" aria-label={connectionLostTitle}>
            <div className="terminal-lost-signal" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="terminal-lost-copy">
              <h2>{connectionLostTitle}</h2>
              <p>{connectionLostHint}</p>
              {connectionLostReason && <code>{connectionLostReason}</code>}
            </div>
            <button className="terminal-reconnect" type="button" disabled={!canReconnect} onClick={onReconnect}>
              {reconnectLabel}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
