import { useState } from "react";
import { Check, Eye, EyeOff, LoaderCircle, Play, X } from "lucide-react";

import { getApi } from "./appHelpers";
import { labelForLocale, PROVIDER_TYPE_OPTIONS } from "./appOptions";
import { parseEndpointUrl } from "./endpointUtils";
import { t } from "./i18n";
import { ActionFooter, Field, ReadOnlyField, SelectField } from "./formControls";
import type { Locale } from "@shared/types";

function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

function ensureEnumOptions(
  options: Array<{ value: string; label: string }>,
  currentValue: string,
  locale: Locale,
): Array<{ value: string; label: string }> {
  const merged = [...options];
  if (currentValue && !merged.some((option) => option.value === currentValue)) {
    merged.push({
      value: currentValue,
      label: formatMessage(t(locale, "unknownValue"), { value: currentValue }),
    });
  }
  return merged;
}

export function ProviderForm(props: {
  locale: Locale;
  name: string;
  nameEditable: boolean;
  value: { type: string; base_url: string; api_key: string };
  onChange: (name: string, patch: { type?: string; base_url?: string; api_key?: string }) => void;
  onSave: () => void;
  onDelete: () => void;
}): JSX.Element {
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [endpointCheckState, setEndpointCheckState] = useState<"idle" | "checking" | "ok" | "failed">("idle");
  const [endpointCheckMessage, setEndpointCheckMessage] = useState("");
  const providerTypeOptions = ensureEnumOptions(
    PROVIDER_TYPE_OPTIONS.map((option) => ({
      value: option.value,
      label: labelForLocale(option.label, props.locale),
    })),
    props.value.type,
    props.locale,
  );
  const endpointValue = props.value.base_url.trim();
  const endpointUrl = endpointValue.length > 0 ? parseEndpointUrl(endpointValue) : null;
  const hasEndpointFormatError = endpointValue.length > 0 && endpointUrl === null;

  const updateEndpoint = (value: string): void => {
    props.onChange(props.name, { base_url: value });
    setEndpointCheckState("idle");
    setEndpointCheckMessage("");
  };

  const testEndpoint = async (): Promise<void> => {
    if (endpointUrl === null || endpointCheckState === "checking") return;
    const api = getApi();
    if (!api?.testEndpointReachability) {
      setEndpointCheckState("failed");
      setEndpointCheckMessage(t(props.locale, "endpointHealthUnavailable"));
      return;
    }
    setEndpointCheckState("checking");
    setEndpointCheckMessage("");
    try {
      const result = await api.testEndpointReachability(endpointUrl.toString());
      if (result.ok) {
        setEndpointCheckState("ok");
        setEndpointCheckMessage(t(props.locale, "endpointHealthOk").replace("{status}", String(result.status)));
      } else {
        setEndpointCheckState("failed");
        setEndpointCheckMessage(t(props.locale, "endpointHealthFail").replace("{message}", result.message));
      }
    } catch (err) {
      setEndpointCheckState("failed");
      setEndpointCheckMessage(
        t(props.locale, "endpointHealthFail").replace("{message}", err instanceof Error ? err.message : String(err)),
      );
    }
  };

  const EndpointStatusIcon = endpointCheckState === "checking"
    ? LoaderCircle
    : endpointCheckState === "ok"
      ? Check
      : endpointCheckState === "failed"
        ? X
        : Play;

  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{t(props.locale, "providerEditor")}</div>
      {props.nameEditable ? (
        <Field label={t(props.locale, "formName")} value={props.name} onChange={(value) => props.onChange(value, {})} />
      ) : (
        <ReadOnlyField label={t(props.locale, "formName")} value={props.name} />
      )}
      <SelectField
        label={t(props.locale, "formType")}
        value={props.value.type}
        onChange={(value) => props.onChange(props.name, { type: value })}
        options={providerTypeOptions}
        popoverClassName="field-select-popover-full"
      />
      <label className="field">
        <span>{t(props.locale, "formBaseUrl")}</span>
        <div className="endpoint-field-input">
          <input
            value={props.value.base_url}
            onChange={(event) => updateEndpoint(event.target.value)}
            aria-invalid={hasEndpointFormatError}
          />
          <button
            className={`endpoint-health-button is-${endpointCheckState}`}
            type="button"
            onClick={() => void testEndpoint()}
            disabled={endpointUrl === null || endpointCheckState === "checking"}
            title={t(props.locale, endpointCheckState === "checking" ? "endpointHealthChecking" : "endpointHealthCheck")}
            aria-label={t(props.locale, endpointCheckState === "checking" ? "endpointHealthChecking" : "endpointHealthCheck")}
          >
            <EndpointStatusIcon size={16} className={endpointCheckState === "checking" ? "button-spinner" : undefined} />
          </button>
        </div>
        {hasEndpointFormatError ? (
          <span className="field-error">{t(props.locale, "endpointInvalidUrl")}</span>
        ) : endpointCheckState !== "idle" || endpointCheckMessage ? (
          <span className={`field-status is-${endpointCheckState}`}>
            {endpointCheckState === "checking" ? t(props.locale, "endpointHealthChecking") : endpointCheckMessage}
          </span>
        ) : null}
      </label>
      <SecretField
        label={t(props.locale, "formApiKey")}
        value={props.value.api_key}
        visible={isApiKeyVisible}
        onToggleVisible={() => setIsApiKeyVisible((current) => !current)}
        onChange={(value) => props.onChange(props.name, { api_key: value })}
        showLabel={t(props.locale, "showSecret")}
        hideLabel={t(props.locale, "hideSecret")}
      />
      <ActionFooter
        onSave={() => {
          if (endpointUrl === null) {
            setEndpointCheckState("failed");
            setEndpointCheckMessage(t(props.locale, "endpointInvalidUrl"));
            return;
          }
          props.onSave();
        }}
        onDelete={props.onDelete}
        saveLabel={t(props.locale, "saveProvider")}
        deleteLabel={t(props.locale, "delete")}
      />
    </section>
  );
}

export function SecretField(props: {
  label: string;
  value: string;
  visible: boolean;
  onToggleVisible: () => void;
  onChange: (value: string) => void;
  showLabel?: string;
  hideLabel?: string;
}): JSX.Element {
  const Icon = props.visible ? EyeOff : Eye;
  return (
    <label className="field">
      <span>{props.label}</span>
      <div className="secret-field">
        <input
          type={props.visible ? "text" : "password"}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <button
          className="secret-toggle"
          type="button"
          aria-label={props.visible ? (props.hideLabel ?? "Hide secret") : (props.showLabel ?? "Show secret")}
          onClick={props.onToggleVisible}
        >
          <Icon size={16} />
        </button>
      </div>
    </label>
  );
}
