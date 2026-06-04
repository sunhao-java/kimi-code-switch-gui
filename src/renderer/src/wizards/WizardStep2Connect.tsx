import { useState } from "react";
import type { Locale } from "@shared/types";
import type { SourcePreset } from "./sourcePresets";
import { t } from "../i18n";

export interface ConnectionFormData {
  apiKey: string;
  endpoint: string;
  modelId: string;
}

interface Step2Props {
  locale: Locale;
  source: SourcePreset;
  initialData: ConnectionFormData;
  onBack: () => void;
  onNext: (data: ConnectionFormData) => void;
}

export function WizardStep2Connect(props: Step2Props): JSX.Element {
  const { locale, source, initialData, onBack, onNext } = props;
  const [form, setForm] = useState<ConnectionFormData>(initialData);
  const [customModel, setCustomModel] = useState(
    source.commonModels.length === 0 ||
    (form.modelId !== "" && !source.commonModels.includes(form.modelId)),
  );

  const isValid = form.endpoint.trim().length > 0
    && form.modelId.trim().length > 0
    && (source.authType === "none" || form.apiKey.trim().length > 0);

  return (
    <div className="wizard-step">
      <h3>{t(locale, "wizardStep2Title")}</h3>
      <p className="wizard-step-hint">{source.name}</p>

      <div className="wizard-form">
        {source.authType !== "none" ? (
          <label className="wizard-field">
            <span>{t(locale, "apiKeyLabel")}</span>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder={source.authType === "x-api-key" ? "sk-ant-..." : "sk-..."}
              autoFocus
            />
          </label>
        ) : null}

        <label className="wizard-field">
          <span>{t(locale, "endpointLabel")}</span>
          <input
            type="text"
            value={form.endpoint}
            onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
          />
        </label>

        <label className="wizard-field">
          <span>{t(locale, "modelLabel")}</span>
          <select
            value={customModel ? "__custom__" : form.modelId}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                setCustomModel(true);
                setForm({ ...form, modelId: "" });
              } else {
                setCustomModel(false);
                setForm({ ...form, modelId: e.target.value });
              }
            }}
          >
            <option value="">{t(locale, "selectModel")}</option>
            {source.commonModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value="__custom__">{t(locale, "customModelOption")}</option>
          </select>
        </label>

        {customModel ? (
          <label className="wizard-field">
            <span>{t(locale, "customModelLabel")}</span>
            <input
              type="text"
              value={form.modelId}
              onChange={(e) => setForm({ ...form, modelId: e.target.value })}
              placeholder="model-id"
              autoFocus
            />
          </label>
        ) : null}
      </div>

      <div className="wizard-nav">
        <button className="action-button secondary" type="button" onClick={onBack}>
          {t(locale, "wizardBack")}
        </button>
        <button
          className="action-button primary"
          type="button"
          disabled={!isValid}
          onClick={() => onNext(form)}
        >
          {t(locale, "wizardNext")}
        </button>
      </div>
    </div>
  );
}
