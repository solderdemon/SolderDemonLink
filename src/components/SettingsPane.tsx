import { Globe2 } from "lucide-react";
import { Dropdown } from "../Dropdown";

type SettingsPaneProps = {
  language: string;
  labels: {
    title: string;
    languageLabel: string;
    description: string;
    language: string;
    noOptions: string;
    english: string;
    ukrainian: string;
  };
  onLanguageChange: (language: string) => void;
};

export function SettingsPane({ language, labels, onLanguageChange }: SettingsPaneProps) {
  return (
    <div className="column settings-panel">
      <section className="settings-group">
        <div className="settings-group-label">{labels.title}</div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <span className="settings-row-title">{labels.languageLabel}</span>
            <span className="dim settings-row-text">{labels.description}</span>
          </div>

          <div className="settings-row-control">
            <Dropdown
              ariaLabel={labels.language}
              emptyLabel={labels.noOptions}
              icon={<Globe2 size={14} strokeWidth={1.8} />}
              value={language.startsWith("uk") ? "uk" : "en"}
              onChange={onLanguageChange}
              options={[
                { value: "en", label: labels.english },
                { value: "uk", label: labels.ukrainian },
              ]}
            />
          </div>
        </div>
      </section>
    </div>
  );
}