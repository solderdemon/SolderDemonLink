import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";

const searchOptions = {
  decorations: {
    activeMatchBackground: "#ff7a00",
    activeMatchColorOverviewRuler: "#ff7a00",
    matchBackground: "#6c3b00",
    matchOverviewRuler: "#a85500",
  },
};

export function useXtermTerminal(active: boolean, writable: boolean) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const writableRef = useRef(writable);

  useEffect(() => {
    writableRef.current = writable;
  }, [writable]);

  useEffect(() => {
    if (terminalRef.current) return;

    let terminal: Terminal | null = null;
    let disposed = false;

    document.fonts.load('13px "IBM Plex Mono"').then(() => {
      if (disposed || !hostRef.current || terminalRef.current) return;

      terminal = new Terminal({
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
      const search = new SearchAddon();
      terminal.loadAddon(fit);
      terminal.loadAddon(search);
      terminal.open(hostRef.current);
      fit.fit();
      terminal.onData((data) => {
        if (!writableRef.current) return;
        invoke("write_port", { data }).catch(() => {});
      });

      terminalRef.current = terminal;
      fitRef.current = fit;
      searchRef.current = search;
    });

    return () => {
      disposed = true;
      terminal?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
  }, []);

  useEffect(() => {
    const refit = () => {
      fitRef.current?.fit();
      terminalRef.current?.scrollToBottom();
    };
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, []);

  useEffect(() => {
    if (active) requestAnimationFrame(() => fitRef.current?.fit());
  }, [active]);

  useEffect(() => {
    if (active && writable) requestAnimationFrame(() => terminalRef.current?.focus());
  }, [active, writable]);

  function write(data: string) {
    terminalRef.current?.write(data, () => terminalRef.current?.scrollToBottom());
  }

  function writeStatus(text: string) {
    write(`\r\n\x1b[2m[${text}]\x1b[0m\r\n`);
  }

  function clear() {
    terminalRef.current?.clear();
  }

  function getText() {
    const terminal = terminalRef.current;
    if (!terminal) return "";
    terminal.selectAll();
    const text = terminal.getSelection();
    terminal.clearSelection();
    return text;
  }

  function findNext(query: string) {
    return query ? (searchRef.current?.findNext(query, searchOptions) ?? false) : false;
  }

  function findPrevious(query: string) {
    return query ? (searchRef.current?.findPrevious(query, searchOptions) ?? false) : false;
  }

  function clearSearch() {
    searchRef.current?.clearDecorations();
  }

  return {
    hostRef,
    write,
    writeStatus,
    clear,
    getText,
    findNext,
    findPrevious,
    clearSearch,
  };
}
