import { Settings2, SquareTerminal, Waypoints } from "lucide-react";
import { Dropdown } from "../Dropdown";
import type { PortInfo, View } from "../types";

type AppHeaderProps = {
  view: View;
  ports: PortInfo[];
  portName: string;
  baud: number;
  baudRates: readonly number[];
  connected: boolean;
  labels: {
    session: string;
    transfer: string;
    settings: string;
    port: string;
    noPorts: string;
    baudRate: string;
    connect: string;
    disconnect: string;
  };
  onViewChange: (view: View) => void;
  onPortChange: (portName: string) => void;
  onBaudChange: (baud: number) => void;
  onToggleConnection: () => void;
};

export function AppHeader({
  view,
  ports,
  portName,
  baud,
  baudRates,
  connected,
  labels,
  onViewChange,
  onPortChange,
  onBaudChange,
  onToggleConnection,
}: AppHeaderProps) {
  const views: { id: View; label: string; iconOnly?: boolean }[] = [
    { id: "session", label: labels.session },
    { id: "transfer", label: labels.transfer },
    { id: "settings", label: labels.settings, iconOnly: true },
  ];

  return (
    <header className="topbar">
      <nav className="tabs">
        {views.map((item) => (
          <button
            key={item.id}
            className={`tab${item.iconOnly ? " tab-icon-only" : ""}${view === item.id ? " is-active" : ""}`}
            type="button"
            onClick={() => onViewChange(item.id)}
            aria-label={item.label}
            title={item.label}
          >
            {item.id === "settings" ? <Settings2 className="tab-icon" aria-hidden="true" /> : item.label}
          </button>
        ))}
      </nav>

      <div className="topbar-controls">
        <Dropdown
          ariaLabel={labels.port}
          placeholder={labels.noPorts}
          emptyLabel={labels.noPorts}
          icon={<SquareTerminal size={14} strokeWidth={1.8} />}
          value={portName}
          disabled={connected}
          onChange={onPortChange}
          options={ports.map((port) => ({ value: port.name, label: port.name }))}
        />

        <Dropdown
          ariaLabel={labels.baudRate}
          icon={<Waypoints size={14} strokeWidth={1.8} />}
          value={String(baud)}
          disabled={connected}
          onChange={(value) => onBaudChange(Number(value))}
          options={baudRates.map((rate) => ({ value: String(rate), label: String(rate) }))}
        />

        <button
          className={`connect${connected ? " is-connected" : ""}`}
          type="button"
          disabled={!connected && !portName}
          onClick={onToggleConnection}
        >
          {connected ? labels.disconnect : labels.connect}
        </button>
      </div>
    </header>
  );
}