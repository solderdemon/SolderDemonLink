import { type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type DropdownOption = { value: string; label: string };

type Props = {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  emptyLabel?: string;
  icon?: ReactNode;
};

export function Dropdown({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  placeholder = "--",
  emptyLabel = "No options",
  icon,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="dd" ref={rootRef}>
      <button
        type="button"
        className={`dd-trigger${open ? " is-open" : ""}`}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {icon ? (
          <span className="dd-icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className="dd-value">{selected?.label ?? placeholder}</span>
        <span className="dd-caret" aria-hidden>
          <ChevronDown size={14} strokeWidth={1.8} />
        </span>
      </button>

      {open && (
        <ul className="dd-menu" role="listbox">
          {options.length === 0 && <li className="dd-empty">{emptyLabel}</li>}
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`dd-option${o.value === value ? " is-active" : ""}`}
                onClick={() => pick(o.value)}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
