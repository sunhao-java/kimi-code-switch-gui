import { useState } from "react";
import { CheckCircle2, LoaderCircle, Wifi, XCircle } from "lucide-react";
import type { Locale } from "@shared/types";
import type { SourcePreset } from "./sourcePresets";
import { getApi } from "../appHelpers";
import { parseEndpointUrl } from "../endpointUtils";
import { t } from "../i18n";

export interface ConnectionFormData {
  apiKey: string;
  endpoint: string;
  modelId: string;
  profileName: string;
}

interface Step2Props {
  locale: Locale;
  source: SourcePreset;
  initialData: ConnectionFormData;
  existingProfileNames: string[];
  onBack: () => void;
  onNext: (data: ConnectionFormData) => void;
}

type EndpointCheckState = "idle" | "checking" | "ok" | "failed";

export function WizardStep2Connect(props: Step2Props): JSX.Element {
  const { locale, source, initialData, existingProfileNames, onBack, onNext } = props;
  const [form, setForm] = useState<ConnectionFormData>(initialData);
  const [customModel, setCustomModel] = useState(
    source.commonModels.length === 0 ||
    (form.modelId !== "" && !source.commonModels.includes(form.modelId)),
  );
  const [endpointCheckState, setEndpointCheckState] = useState<EndpointCheckState>("idle");
  const [endpointCheckMessage, setEndpointCheckMessage] = useState("");

  const profileName = form.profileName.trim();
  const endpointValue = form.endpoint.trim();
  const endpointUrl = endpointValue.length > 0 ? parseEndpointUrl(endpointValue) : null;
  const hasEndpointFormatError = endpointValue.length > 0 && endpointUrl === null;
  const isProfileNameDuplicate = profileName.length > 0 && existingProfileNames.includes(profileName);
  const isValid = endpointUrl !== null
    && form.modelId.trim().length > 0
    && profileName.length > 0
    && !isProfileNameDuplicate
    && (source.authType === "none" || form.apiKey.trim().length > 0);

  const updateForm = (patch: Partial<ConnectionFormData>): void => {
    setForm({ ...form, ...patch });
  };

  const updateEndpoint = (value: string): void => {
    updateForm({ endpoint: value });
    setEndpointCheckState("idle");
    setEndpointCheckMessage("");
  };

  const testEndpoint = async (): Promise<void> => {
    if (endpointUrl === null || endpointCheckState === "checking") return;
    const api = getApi();
    if (!api?.testEndpointReachability) {
      setEndpointCheckState("failed");
      setEndpointCheckMessage(t(locale, "endpointHealthUnavailable"));
      return;
    }

    setEndpointCheckState("checking");
    setEndpointCheckMessage("");
    try {
      const result = await api.testEndpointReachability(endpointUrl.toString());
      if (result.ok) {
        setEndpointCheckState("ok");
        setEndpointCheckMessage(
          t(locale, "endpointHealthOk").replace("{status}", String(result.status)),
        );
      } else {
        setEndpointCheckState("failed");
        setEndpointCheckMessage(
          t(locale, "endpointHealthFail").replace("{message}", result.message),
        );
      }
    } catch (err) {
      setEndpointCheckState("failed");
      setEndpointCheckMessage(
        t(locale, "endpointHealthFail").replace("{message}", err instanceof Error ? err.message : String(err)),
      );
    }
  };

  const EndpointStatusIcon = endpointCheckState === "checking"
    ? LoaderCircle
    : endpointCheckState === "ok"
      ? CheckCircle2
      : endpointCheckState === "failed"
        ? XCircle
        : Wifi;

  return (
    <div className="wizard-step">
      <h3>{t(locale, "wizardStep2Title")}</h3>
      <p className="wizard-step-hint">{t(locale, source.nameKey)}</p>

      <div className="wizard-form">
        <label className="wizard-field">
          <span>{t(locale, "profileNameLabel")}</span>
          <input
            type="text"
            value={form.profileName}
            onChange={(e) => updateForm({ profileName: e.target.value })}
            autoFocus
          />
          {isProfileNameDuplicate ? (
            <span className="wizard-field-error">{t(locale, "wizardProfileNameExists")}</span>
          ) : null}
        </label>

        <label className="wizard-field">
          <span>{t(locale, "endpointLabel")}</span>
          <div className="wizard-endpoint-input">
            <input
              type="text"
              value={form.endpoint}
              onChange={(e) => updateEndpoint(e.target.value)}
              aria-invalid={hasEndpointFormatError}
            />
            <button
              className={`wizard-endpoint-check-button is-${endpointCheckState}`}
              type="button"
              onClick={() => void testEndpoint()}
              disabled={endpointUrl === null || endpointCheckState === "checking"}
              title={t(locale, endpointCheckState === "checking" ? "endpointHealthChecking" : "endpointHealthCheck")}
              aria-label={t(locale, endpointCheckState === "checking" ? "endpointHealthChecking" : "endpointHealthCheck")}
            >
              <EndpointStatusIcon size={16} className={endpointCheckState === "checking" ? "is-spinning" : undefined} />
            </button>
          </div>
          {hasEndpointFormatError ? (
            <span className="wizard-field-error">{t(locale, "endpointInvalidUrl")}</span>
          ) : endpointCheckState !== "idle" || endpointCheckMessage ? (
            <span className={`wizard-field-status is-${endpointCheckState}`}>
              {endpointCheckState === "checking" ? t(locale, "endpointHealthChecking") : endpointCheckMessage}
            </span>
          ) : null}
        </label>

        {source.authType !== "none" ? (
          <label className="wizard-field">
            <span>{t(locale, "apiKeyLabel")}</span>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => updateForm({ apiKey: e.target.value })}
              placeholder={source.authType === "x-api-key" ? "sk-ant-..." : "sk-..."}
            />
          </label>
        ) : null}

        <label className="wizard-field">
          <span>{t(locale, "modelLabel")}</span>
          {source.commonModels.length === 0 ? (
            // 自定义来源：无预设模型，直接输入模型 id
            <input
              type="text"
              value={form.modelId}
              onChange={(e) => updateForm({ modelId: e.target.value })}
              placeholder="model-id"
            />
          ) : (
            <select
              value={customModel ? "__custom__" : form.modelId}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setCustomModel(true);
                  updateForm({ modelId: "" });
                } else {
                  setCustomModel(false);
                  updateForm({ modelId: e.target.value });
                }
              }}
            >
              <option value="">{t(locale, "selectModel")}</option>
              {source.commonModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
              <option value="__custom__">{t(locale, "customModelOption")}</option>
            </select>
          )}
        </label>

        {source.commonModels.length > 0 && customModel ? (
          <label className="wizard-field">
            <span>{t(locale, "customModelLabel")}</span>
            <input
              type="text"
              value={form.modelId}
              onChange={(e) => updateForm({ modelId: e.target.value })}
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
