import { useState } from "react";
import type { Locale } from "@shared/types";
import { t } from "../i18n";

interface Step3Props {
  locale: Locale;
  profileName: string;
  onBack: () => void;
  onComplete: (profileName: string, activate: boolean) => void;
}

export function WizardStep3Name(props: Step3Props): JSX.Element {
  const { locale, profileName, onBack, onComplete } = props;
  const [activate, setActivate] = useState(true);
  const trimmed = profileName.trim();

  return (
    <div className="wizard-step">
      <h3>{t(locale, "wizardStep3Title")}</h3>
      <p className="wizard-step-hint">{t(locale, "wizardStep3Hint")}</p>

      <div className="wizard-form">
        <div className="wizard-field">
          <span>{t(locale, "profileNameLabel")}</span>
          <div className="wizard-readonly-value">{trimmed}</div>
        </div>

        <label className="wizard-toggle">
          <input
            type="checkbox"
            checked={activate}
            onChange={(e) => setActivate(e.target.checked)}
          />
          <span>{t(locale, "activateOnComplete")}</span>
        </label>
      </div>

      <div className="wizard-nav">
        <button className="action-button secondary" type="button" onClick={onBack}>
          {t(locale, "wizardBack")}
        </button>
        <button
          className="action-button primary"
          type="button"
          disabled={!trimmed}
          onClick={() => onComplete(trimmed, activate)}
        >
          {t(locale, "wizardComplete")}
        </button>
      </div>
    </div>
  );
}
