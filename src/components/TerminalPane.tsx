import { Search, ChevronDown, ChevronUp, ClipboardCopy, FileDown, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  labels: {
    clear: string;
    copy: string;
    save: string;
    search: string;
    searchPlaceholder: string;
    previousMatch: string;
    nextMatch: string;
    closeSearch: string;
  };
  hostRef: RefObject<HTMLDivElement | null>;
  onReconnect: () => void;
  onClear: () => void;
  onCopy: () => void;
  onSave: () => void;
  onSearchNext: (query: string) => void;
  onSearchPrevious: (query: string) => void;
  onSearchClose: () => void;
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
  labels,
  hostRef,
  onReconnect,
  onClear,
  onCopy,
  onSave,
  onSearchNext,
  onSearchPrevious,
  onSearchClose,
}: TerminalPaneProps) {
  const [frame, setFrame] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (connected || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % ART_FRAMES.length), 450);
    return () => window.clearInterval(id);
  }, [connected]);

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
    onSearchClose();
  }

  return (
    <div className={`terminal${visible ? "" : " is-hidden"}`}>
      <div className="terminal-stage">
        <div className="terminal-log" ref={hostRef} />
        {connectionState !== "idle" && (
          <div className="terminal-tools" aria-label={labels.search}>
            {searchOpen ? (
              <div className="terminal-search">
                <Search size={14} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => {
                    const next = event.target.value;
                    setQuery(next);
                    onSearchNext(next);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      (event.shiftKey ? onSearchPrevious : onSearchNext)(query);
                    }
                    if (event.key === "Escape") closeSearch();
                  }}
                  placeholder={labels.searchPlaceholder}
                  aria-label={labels.search}
                  spellCheck={false}
                />
                <button type="button" className="terminal-tool" onClick={() => onSearchPrevious(query)} aria-label={labels.previousMatch} title={labels.previousMatch}>
                  <ChevronUp size={15} />
                </button>
                <button type="button" className="terminal-tool" onClick={() => onSearchNext(query)} aria-label={labels.nextMatch} title={labels.nextMatch}>
                  <ChevronDown size={15} />
                </button>
                <button type="button" className="terminal-tool" onClick={closeSearch} aria-label={labels.closeSearch} title={labels.closeSearch}>
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button type="button" className="terminal-tool" onClick={() => setSearchOpen(true)} aria-label={labels.search} title={labels.search}>
                <Search size={15} />
              </button>
            )}
            <button type="button" className="terminal-tool" onClick={onCopy} aria-label={labels.copy} title={labels.copy}>
              <ClipboardCopy size={15} />
            </button>
            <button type="button" className="terminal-tool" onClick={onSave} aria-label={labels.save} title={labels.save}>
              <FileDown size={15} />
            </button>
            <button type="button" className="terminal-tool" onClick={onClear} aria-label={labels.clear} title={labels.clear}>
              <Trash2 size={15} />
            </button>
          </div>
        )}
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
