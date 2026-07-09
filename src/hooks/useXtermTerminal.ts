import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

export function useXtermTerminal(active: boolean) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

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
      terminal.loadAddon(fit);
      terminal.open(hostRef.current);
      fit.fit();
      terminal.onData((data) => {
        invoke("write_port", { data }).catch(() => {});
      });

      terminalRef.current = terminal;
      fitRef.current = fit;
    });

    return () => {
      disposed = true;
      terminal?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    const refit = () => fitRef.current?.fit();
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, []);

  useEffect(() => {
    if (active) requestAnimationFrame(() => fitRef.current?.fit());
  }, [active]);

  function write(data: string) {
    terminalRef.current?.write(data);
  }

  function writeStatus(text: string) {
    write(`\r\n\x1b[2m[${text}]\x1b[0m\r\n`);
  }

  return { hostRef, write, writeStatus };
}