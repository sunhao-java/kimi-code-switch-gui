import type { Locale } from "@shared/types";
import { SOURCE_PRESETS } from "./sourcePresets";
import type { SourcePreset } from "./sourcePresets";
import { t } from "../i18n";

interface Step1Props {
  locale: Locale;
  onSelect: (preset: SourcePreset) => void;
}

export function WizardStep1Source(props: Step1Props): JSX.Element {
  return (
    <div className="wizard-step">
      <h3>{t(props.locale, "wizardStep1Title")}</h3>
      <p className="wizard-step-hint">{t(props.locale, "wizardStep1Hint")}</p>
      <div className="wizard-source-grid">
        {SOURCE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="wizard-source-card glass-panel"
            onClick={() => props.onSelect(preset)}
          >
            <strong>{preset.name}</strong>
            <span>{preset.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
