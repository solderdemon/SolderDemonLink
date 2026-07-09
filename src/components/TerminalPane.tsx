import type { RefObject } from "react";

type TerminalPaneProps = {
  visible: boolean;
  connected: boolean;
  input: string;
  inputPlaceholder: string;
  hostRef: RefObject<HTMLDivElement | null>;
  onInputChange: (input: string) => void;
  onSendInput: () => void;
};

export function TerminalPane({
  visible,
  connected,
  input,
  inputPlaceholder,
  hostRef,
  onInputChange,
  onSendInput,
}: TerminalPaneProps) {
  return (
    <div className={`terminal${visible ? "" : " is-hidden"}`}>
      <div className="terminal-log" ref={hostRef} />
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