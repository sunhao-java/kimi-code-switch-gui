import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Boxes, Check, Eye, EyeOff, FileText, FolderOpen, LoaderCircle,
  MoonStar, PenSquare, Play, RefreshCw, Sparkles, X,
} from "lucide-react";

import { normalizeEntryName } from "@shared/nameRules";
import { createDefaultShortcuts } from "@shared/shortcutStore";
import type { SkillsScanReport } from "@shared/skillsStore";
import type {
  AppState,
  AppearanceMode, AppearanceTheme, BackupDestinationType, BackupFrequency, BackupStrategy,
  CloseBehavior, ConfigDriftEntry, DisplayOpenMode, Locale,
  McpServerConfig, McpTransport, ModelPricing, Profile, ProfileConnectivityTestResult, UiFontSize,
} from "@shared/types";
import { resolveModelPricing } from "@shared/pricing";

import { getApi } from "./appHelpers";
import {
  labelForLocale, MCP_TRANSPORT_OPTIONS, MODEL_CAPABILITY_OPTIONS,
  PROVIDER_TYPE_OPTIONS, UI_FONT_SIZE_OPTIONS,
} from "./appOptions";
import { useDialogEscape, useFocusTrap } from "./dialogs";
import { t } from "./i18n";
import {
  ActionFooter, Field, KeyValueListField, MultiSelectField,
  ReadOnlyField, SelectField, TextAreaField, Toggle,
} from "./formControls";

export function createCopyName(sourceName: string, existing: Record<string, unknown>): string {
  return createLocalizedCopyName(sourceName, existing, "Copy");
}

export function createLocalizedCopyName(sourceName: string, existing: Record<string, unknown>, copySuffix: string): string {
  const baseName = `${sourceName} ${copySuffix}`;
  if (!existing[baseName]) {
    return baseName;
  }
  let index = 2;
  while (existing[`${baseName}${index}`]) {
    index += 1;
  }
  return `${baseName}${index}`;
}

export function createDefaultMcpServer(): McpServerConfig {
  return {
    enabled: true,
    transport: "streamable-http",
    url: "",
    headers: {},
    command: "",
    args: [],
    env: {},
  };
}

export function switchMcpTransport(server: McpServerConfig, transport: McpTransport): McpServerConfig {
  if (transport === server.transport) {
    return server;
  }
  return {
    enabled: server.enabled,
    transport,
    url: "",
    headers: {},
    command: "",
    args: [],
    env: {},
    extra: server.extra,
  };
}

export function parseListLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatListLines(value: string[]): string {
  return value.join("\n");
}

export function isRemoteMcpTransport(transport: McpTransport): boolean {
  return transport !== "stdio";
}

export function parseRecordLines(value: string): Record<string, string> {
  const pairs = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.includes("=") ? line.indexOf("=") : line.indexOf(":");
      if (separatorIndex === -1) {
        return null;
      }
      const key = line.slice(0, separatorIndex).trim();
      const entryValue = line.slice(separatorIndex + 1).trim();
      if (!key) {
        return null;
      }
      return [key, entryValue] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);
  return Object.fromEntries(pairs);
}

export function formatRecordLines(value: Record<string, string>): string {
  return Object.entries(value)
    .map(([key, entryValue]) => `${key}=${entryValue}`)
    .join("\n");
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
  const providerTypeOptions = ensureEnumOptions(
    PROVIDER_TYPE_OPTIONS.map((option) => ({
      value: option.value,
      label: labelForLocale(option.label, props.locale),
    })),
    props.value.type,
    props.locale,
  );

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
      <Field label={t(props.locale, "formBaseUrl")} value={props.value.base_url} onChange={(value) => props.onChange(props.name, { base_url: value })} />
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
        onSave={props.onSave}
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

export function ModelForm(props: {
  locale: Locale;
  providers: string[];
  name: string;
  value: {
    provider: string;
    model: string;
    max_context_size: number;
    capabilities: string[];
    pricing?: ModelPricing;
  };
  onChange: (
    name: string,
    patch: Partial<{
      provider: string;
      model: string;
      max_context_size: number;
      capabilities: string[];
      pricing?: ModelPricing;
    }>,
  ) => void;
  onSave: () => void;
  onDelete: () => void;
}): JSX.Element {
  const capabilityOptions = ensureEnumOptions(
    MODEL_CAPABILITY_OPTIONS.map((option) => ({
      value: option.value,
      label: labelForLocale(option.label, props.locale),
    })),
    props.value.capabilities,
    props.locale,
  );

  const handlePricingChange = (field: keyof ModelPricing, raw: string): void => {
    props.onChange(props.name, {
      pricing: nextPricingFromInput(props.value.pricing, field, raw),
    });
  };

  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{t(props.locale, "modelEditor")}</div>
      <ReadOnlyField label={t(props.locale, "formName")} value={props.name} />
      <SelectField
        label={t(props.locale, "formProvider")}
        value={props.value.provider}
        onChange={(value) => props.onChange(props.name, { provider: value })}
        options={props.providers.map((provider) => ({ value: provider, label: provider }))}
      />
      <Field
        label={t(props.locale, "formModel")}
        value={props.value.model}
        onChange={(value) => props.onChange(props.name, { model: normalizeEntryName(value) })}
      />
      <Field
        label={t(props.locale, "formContextSize")}
        value={String(props.value.max_context_size)}
        onChange={(value) => props.onChange(props.name, { max_context_size: Number(value) || 0 })}
      />
      <MultiSelectField
        label={t(props.locale, "formCapabilities")}
        value={props.value.capabilities}
        onChange={(value) => props.onChange(props.name, { capabilities: value })}
        options={capabilityOptions}
        emptyLabel={t(props.locale, "formCapabilitiesEmpty")}
        popoverClassName="field-select-popover-full"
      />
      <ModelPricingEditor
        locale={props.locale}
        model={props.value.model}
        pricing={props.value.pricing}
        onChange={handlePricingChange}
      />
      <ActionFooter
        onSave={props.onSave}
        onDelete={props.onDelete}
        saveLabel={t(props.locale, "saveModel")}
        deleteLabel={t(props.locale, "delete")}
      />
    </section>
  );
}

const PRICING_FIELDS: ReadonlyArray<{ field: keyof ModelPricing; labelKey: string }> = [
  { field: "input_per_mtok", labelKey: "pricingInput" },
  { field: "output_per_mtok", labelKey: "pricingOutput" },
  { field: "cache_read_per_mtok", labelKey: "pricingCacheRead" },
  { field: "cache_creation_per_mtok", labelKey: "pricingCacheCreation" },
];

/**
 * Builds the next `pricing` value when a single per-1M-token rate input changes.
 * Empty / invalid input clears that field; when every field ends up empty the
 * whole `pricing` object is dropped (returns `undefined`) so the model falls
 * back to the built-in default table.
 */
export function nextPricingFromInput(
  current: ModelPricing | undefined,
  field: keyof ModelPricing,
  raw: string,
): ModelPricing | undefined {
  const trimmed = raw.trim();
  const parsed = trimmed === "" ? undefined : Number(trimmed);
  const value = parsed !== undefined && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;

  const draft: Partial<ModelPricing> = {
    input_per_mtok: current?.input_per_mtok,
    output_per_mtok: current?.output_per_mtok,
    cache_read_per_mtok: current?.cache_read_per_mtok,
    cache_creation_per_mtok: current?.cache_creation_per_mtok,
  };
  if (value === undefined) {
    delete draft[field];
  } else {
    draft[field] = value;
  }

  const hasAny = Object.values(draft).some((v) => v !== undefined);
  if (!hasAny) return undefined;
  // ModelPricing requires input/output; default missing required rates to 0 so
  // the partial override is still a valid object until the user fills them in.
  return {
    input_per_mtok: draft.input_per_mtok ?? 0,
    output_per_mtok: draft.output_per_mtok ?? 0,
    ...(draft.cache_read_per_mtok !== undefined ? { cache_read_per_mtok: draft.cache_read_per_mtok } : {}),
    ...(draft.cache_creation_per_mtok !== undefined ? { cache_creation_per_mtok: draft.cache_creation_per_mtok } : {}),
  };
}

function ModelPricingEditor(props: {
  locale: Locale;
  model: string;
  pricing?: ModelPricing;
  onChange: (field: keyof ModelPricing, raw: string) => void;
}): JSX.Element {
  // Resolve the effective default (built-in table) so blank inputs can hint the
  // fallback rate the cost estimate will actually use.
  const defaults = resolveModelPricing({ model: props.model });
  return (
    <div className="model-pricing-editor">
      <div className="model-pricing-head">{t(props.locale, "pricingTitle")}</div>
      <div className="model-pricing-grid">
        {PRICING_FIELDS.map(({ field, labelKey }) => {
          const overridden = props.pricing?.[field];
          const fallback = defaults?.[field];
          const placeholder =
            fallback !== undefined
              ? formatMessage(t(props.locale, "pricingDefaultPlaceholder"), { value: fallback })
              : "";
          return (
            <label key={field} className="model-pricing-field">
              <span>{t(props.locale, labelKey)}</span>
              <div className="pricing-input">
                <span className="pricing-affix">$</span>
                <input
                  inputMode="decimal"
                  value={overridden !== undefined ? String(overridden) : ""}
                  placeholder={placeholder}
                  onChange={(event) => props.onChange(field, event.target.value)}
                />
                <span className="pricing-affix pricing-affix-suffix">/1M</span>
              </div>
            </label>
          );
        })}
      </div>
      <p className="model-pricing-hint">{t(props.locale, "pricingHint")}</p>
    </div>
  );
}

export function McpServerForm(props: {
  locale: Locale;
  name: string;
  nameEditable: boolean;
  value: McpServerConfig;
  isTesting: boolean;
  onRunAction: (action: "test" | "auth" | "reset-auth", name: string) => Promise<void>;
  onChange: (name: string, value: McpServerConfig) => void;
  onSave: () => void;
  onDelete: () => void;
}): JSX.Element {
  const transportOptions = MCP_TRANSPORT_OPTIONS.map((option) => ({
    value: option.value,
    label: labelForLocale(option.label, props.locale),
  }));

  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{t(props.locale, "mcpEditor")}</div>
      {props.nameEditable ? (
        <Field label={t(props.locale, "formName")} value={props.name} onChange={(next) => props.onChange(next, { ...props.value })} />
      ) : (
        <ReadOnlyField label={t(props.locale, "formName")} value={props.name} />
      )}
      <SelectField
        label={t(props.locale, "formTransport")}
        value={props.value.transport}
        onChange={(next) => props.onChange(props.name, switchMcpTransport(props.value, next as McpTransport))}
        options={transportOptions}
        popoverClassName="field-select-popover-full"
      />
      {isRemoteMcpTransport(props.value.transport) ? (
        <>
          <Field
            label={t(props.locale, "formUrl")}
            value={props.value.url}
            onChange={(next) => props.onChange(props.name, { ...props.value, url: next })}
          />
          <KeyValueListField
            locale={props.locale}
            label={t(props.locale, "formHeaders")}
            value={props.value.headers}
            addLabel={t(props.locale, "addHeader")}
            keyPlaceholder={t(props.locale, "headerNamePlaceholder")}
            valuePlaceholder={t(props.locale, "headerValuePlaceholder")}
            onChange={(next) => props.onChange(props.name, { ...props.value, headers: next })}
          />
        </>
      ) : (
        <>
          <Field
            label={t(props.locale, "formCommand")}
            value={props.value.command}
            onChange={(next) => props.onChange(props.name, { ...props.value, command: next })}
          />
          <TextAreaField
            label={t(props.locale, "formArgs")}
            value={formatListLines(props.value.args)}
            placeholder={t(props.locale, "formArgsPlaceholder")}
            onChange={(next) => props.onChange(props.name, { ...props.value, args: parseListLines(next) })}
          />
          <KeyValueListField
            locale={props.locale}
            label={t(props.locale, "formEnv")}
            value={props.value.env}
            addLabel={t(props.locale, "addEnv")}
            keyPlaceholder={t(props.locale, "variableNamePlaceholder")}
            valuePlaceholder={t(props.locale, "variableValuePlaceholder")}
            onChange={(next) => props.onChange(props.name, { ...props.value, env: next })}
          />
        </>
      )}
      <ActionFooter
        onSave={props.onSave}
        onDelete={props.onDelete}
        saveLabel={t(props.locale, "saveMcpServer")}
        deleteLabel={t(props.locale, "delete")}
      >
        <button
          className={props.isTesting ? "action-button is-loading" : "action-button"}
          type="button"
          disabled={props.isTesting}
          onClick={() => void props.onRunAction("test", props.name)}
        >
          {props.isTesting ? <LoaderCircle size={16} className="button-spinner" /> : null}
          <span>{props.isTesting ? t(props.locale, "mcpTesting") : t(props.locale, "mcpTest")}</span>
        </button>
      </ActionFooter>
    </section>
  );
}

export function McpImportDialog(props: {
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
  onImport: () => void;
  onCancel: () => void;
}): JSX.Element {
  const dialogRef = useRef<HTMLElement>(null);

  useDialogEscape(props.onCancel);
  useFocusTrap(dialogRef);

  return (
    <div
      className="mcp-import-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onCancel();
        }
      }}
    >
      <section ref={dialogRef} className="glass-panel form-panel mcp-import-dialog" role="dialog" aria-modal="true" aria-labelledby="mcp-import-title">
        <div className="mcp-import-header">
          <div>
            <div className="section-title" id="mcp-import-title">{t(props.locale, "importMcpJson")}</div>
            <p className="mcp-import-hint">{t(props.locale, "mcpImportHint")}</p>
          </div>
          <button className="action-button compact icon-only" type="button" aria-label={t(props.locale, "cancel")} onClick={props.onCancel}>
            <X size={16} />
          </button>
        </div>
        <label className="field">
          <span>{t(props.locale, "pasteMcpJson")}</span>
          <textarea
            className="mcp-import-textarea"
            rows={12}
            value={props.value}
            placeholder={t(props.locale, "mcpImportPlaceholder")}
            onChange={(event) => props.onChange(event.target.value)}
          />
        </label>
        <ActionFooter
          onSave={props.onImport}
          onCancel={props.onCancel}
          saveLabel={t(props.locale, "mcpImportApply")}
          cancelLabel={t(props.locale, "mcpImportCancel")}
        />
      </section>
    </div>
  );
}

export function ProfileForm(props: {
  locale: Locale;
  models: string[];
  name: string;
  nameEditable: boolean;
  value: Profile;
  isActive: boolean;
  isTesting: boolean;
  onChange: (name: string, value: Profile) => void;
  onSave: () => void;
  onTest: (modelName: string) => Promise<ProfileConnectivityTestResult>;
  onActivate: () => void;
  onClone: () => void;
  onDelete: () => void;
}): JSX.Element {
  const value = props.value;
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{t(props.locale, "profileEditor")}</div>
      {props.nameEditable ? (
        <Field label={t(props.locale, "profileFormUniqueId")} value={props.name} onChange={(next) => props.onChange(next, { ...value, name: next })} />
      ) : (
        <ReadOnlyField label={t(props.locale, "profileFormUniqueId")} value={props.name} />
      )}
      <Field label={t(props.locale, "profileFormDisplayName")} value={value.label} onChange={(next) => props.onChange(props.name, { ...value, label: next })} />
      <SelectField
        label={t(props.locale, "formDefaultModel")}
        value={value.default_model}
        onChange={(next) => props.onChange(props.name, { ...value, default_model: next })}
        options={props.models.map((model) => ({ value: model, label: model }))}
      />
      <Toggle label={t(props.locale, "formThinking")} checked={value.default_thinking} onChange={(checked) => props.onChange(props.name, { ...value, default_thinking: checked })} />
      <Toggle label={t(props.locale, "formYolo")} checked={value.default_yolo} onChange={(checked) => props.onChange(props.name, { ...value, default_yolo: checked })} />
      <Toggle label={t(props.locale, "formPlanMode")} checked={value.default_plan_mode} onChange={(checked) => props.onChange(props.name, { ...value, default_plan_mode: checked })} />
      <Toggle label={t(props.locale, "formStream")} checked={value.show_thinking_stream} onChange={(checked) => props.onChange(props.name, { ...value, show_thinking_stream: checked })} />
      <Toggle label={t(props.locale, "formMergeSkills")} checked={value.merge_all_available_skills} onChange={(checked) => props.onChange(props.name, { ...value, merge_all_available_skills: checked })} />
      <ActionFooter
        onSave={props.onSave}
        onDelete={props.onDelete}
        saveLabel={t(props.locale, "saveProfile")}
        deleteLabel={t(props.locale, "delete")}
      >
        <button
          className={props.isTesting ? "action-button is-loading" : "action-button"}
          type="button"
          disabled={props.isTesting}
          onClick={() => setIsTestDialogOpen(true)}
        >
          {props.isTesting ? <LoaderCircle size={16} className="button-spinner" /> : null}
          <span>{props.isTesting ? t(props.locale, "profileTesting") : t(props.locale, "profileTest")}</span>
        </button>
        <button className={props.isActive ? "action-button action-button-primary" : "action-button"} onClick={props.onActivate}>{t(props.locale, "activate")}</button>
        <button className="action-button" onClick={props.onClone}>{t(props.locale, "clone")}</button>
      </ActionFooter>
      {isTestDialogOpen ? (
        <ProfileTestDialog
          locale={props.locale}
          profile={value}
          profileName={props.name}
          models={props.models}
          onTest={props.onTest}
          onClose={() => setIsTestDialogOpen(false)}
        />
      ) : null}
    </section>
  );
}

function ProfileTestDialog(props: {
  locale: Locale;
  profile: Profile;
  profileName: string;
  models: string[];
  onTest: (modelName: string) => Promise<ProfileConnectivityTestResult>;
  onClose: () => void;
}): JSX.Element {
  const dialogRef = useRef<HTMLElement>(null);
  const testModel = props.profile.default_model;
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<ProfileConnectivityTestResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasStarted, setHasStarted] = useState(false);

  useDialogEscape(props.onClose);
  useFocusTrap(dialogRef);

  const runTest = async (modelName: string): Promise<void> => {
    setHasStarted(true);
    setIsTesting(true);
    setErrorMessage("");
    try {
      const nextResult = await props.onTest(modelName);
      setResult(nextResult);
    } catch (error) {
      setResult(null);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsTesting(false);
    }
  };

  const providerType = result?.providerType || "apikey";
  const prompt = result?.prompt ?? "hi";
  const displayModel = result?.modelName ?? testModel;

  return createPortal(
    <div
      className="profile-test-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <section ref={dialogRef} className="profile-test-dialog glass-panel" role="dialog" aria-modal="true" aria-labelledby="profile-test-title">
        <div className="profile-test-header">
          <h3 id="profile-test-title">{t(props.locale, "profileTestDialogTitle")}</h3>
          <button className="profile-test-close" type="button" aria-label={t(props.locale, "close")} onClick={props.onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="profile-test-body">
          <div className="profile-test-account-card">
            <div className="profile-test-play">
              <Play size={28} />
            </div>
            <div className="profile-test-account-copy">
              <strong>{props.profileName}</strong>
              <span><b>{providerType.toUpperCase()}</b>{t(props.locale, "profileTestAccountLabel")}</span>
            </div>
            <span className="profile-test-active">{t(props.locale, "active")}</span>
          </div>

          <ProfileTestConsole
            locale={props.locale}
            profileName={props.profileName}
            providerType={providerType}
            modelName={displayModel}
            prompt={prompt}
            result={result}
            errorMessage={errorMessage}
            isTesting={isTesting}
            hasStarted={hasStarted}
          />

        </div>

        <div className="profile-test-actions">
          <button className="action-button" type="button" onClick={props.onClose}>
            {t(props.locale, "close")}
          </button>
          <button
            className={isTesting ? "action-button action-button-primary is-loading" : "action-button action-button-primary"}
            type="button"
            disabled={isTesting}
            onClick={() => void runTest(testModel)}
          >
            {isTesting ? <LoaderCircle size={17} className="button-spinner" /> : <RefreshCw size={17} />}
            <span>{isTesting ? t(props.locale, "profileTesting") : hasStarted ? t(props.locale, "profileTestRetry") : t(props.locale, "profileTestStart")}</span>
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function ProfileTestConsole(props: {
  locale: Locale;
  profileName: string;
  providerType: string;
  modelName: string;
  prompt: string;
  result: ProfileConnectivityTestResult | null;
  errorMessage: string;
  isTesting: boolean;
  hasStarted: boolean;
}): JSX.Element {
  const response = props.result?.stdout || props.result?.stderr || "";
  return (
    <div className="profile-test-console">
      {props.hasStarted ? (
        <p className="is-info">{formatMessage(t(props.locale, "profileTestStartAccount"), { name: props.profileName })}</p>
      ) : null}
      <p>{formatMessage(t(props.locale, "profileTestAccountType"), { type: props.providerType })}</p>
      <p className={props.errorMessage ? "is-danger" : props.result ? "is-success" : "is-muted"}>
        {props.errorMessage
          ? t(props.locale, "profileTestFailed")
          : props.result
            ? t(props.locale, "profileTestConnected")
            : t(props.locale, "profileTestStart")}
      </p>
      <p className="is-cyan">{formatMessage(t(props.locale, "profileTestUsingModel"), { model: props.modelName })}</p>
      <p>{formatMessage(t(props.locale, "profileTestSendingPrompt"), { prompt: props.prompt })}</p>
      <p className="is-warning">{t(props.locale, "profileTestResponse")}</p>
      {props.isTesting ? (
        <p className="is-muted">{t(props.locale, "profileTesting")}</p>
      ) : props.errorMessage ? (
        <pre className="is-danger">{props.errorMessage}</pre>
      ) : response ? (
        <pre className="is-output">{response}</pre>
      ) : null}
      <div className="profile-test-console-divider" />
      {!props.isTesting && props.hasStarted ? (
        <p className={props.errorMessage ? "is-danger profile-test-console-status" : "is-success profile-test-console-status"}>
          {props.errorMessage ? <X size={18} /> : <Check size={18} />}
          <span>{props.errorMessage ? t(props.locale, "profileTestFailed") : t(props.locale, "profileTestCompleted")}</span>
        </p>
      ) : null}
    </div>
  );
}

export function PathField(props: {
  locale: Locale;
  label: string;
  value: string;
  readOnly?: boolean;
  fileType?: "toml" | "json";
  pickerProperties?: Array<"openFile" | "openDirectory" | "createDirectory">;
  onView?: () => void;
  extraActions?: Array<{
    key: string;
    label: string;
    icon: JSX.Element;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
  }>;
  onChange: (value: string) => void;
}): JSX.Element {
  const pickFile = async (): Promise<void> => {
    if (props.readOnly) {
      return;
    }
    const api = getApi();
    if (!api) {
      return;
    }
    const result = await api.pickFile({
      title: props.label,
      properties: props.pickerProperties ?? ["openFile"],
      ...(props.pickerProperties?.includes("openFile") !== false
        ? { filters: [{ name: (props.fileType ?? "toml").toUpperCase(), extensions: [props.fileType ?? "toml"] }] }
        : {}),
    });
    if (!result.canceled && result.filePath) {
      props.onChange(result.filePath);
    }
  };

  return (
    <div className="field">
      <span>{props.label}</span>
      <div className="field-row">
        <input
          value={props.value}
          readOnly={props.readOnly}
          disabled={props.readOnly}
          className={props.readOnly ? "field-input-disabled" : undefined}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <div className="field-row-actions">
          {props.extraActions?.map((action) => (
            <button
              key={action.key}
              className={action.className ?? "action-button compact icon-only"}
              type="button"
              aria-label={action.label}
              title={action.label}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.icon}
            </button>
          ))}
          {props.onView ? (
            <button
              className="action-button compact icon-only"
              type="button"
              aria-label={t(props.locale, "view")}
              title={t(props.locale, "view")}
              onClick={props.onView}
            >
              <Eye size={16} />
            </button>
          ) : null}
          {!props.readOnly ? (
            <button
              className="action-button compact icon-only"
              type="button"
              aria-label={t(props.locale, "browse")}
              title={t(props.locale, "browse")}
              onClick={() => void pickFile()}
            >
              <FolderOpen size={16} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function createFallbackState(): AppState {
  const panelSettings = {
    version: 1,
    config_path: "~/.kimi/config.toml",
    profiles_path: "",
    follow_config_profiles: true,
    theme: "auto" as AppearanceMode,
    appearance_theme: "aurora" as AppearanceTheme,
    ui_font_size: "standard" as UiFontSize,
    locale: "zh-CN" as Locale,
    tray_icon: false,
    display_open_mode: "remember-last" as DisplayOpenMode,
    close_behavior: "quit" as CloseBehavior,
    terminal_app: "system-terminal",
    backup_strategy: "manual" as BackupStrategy,
    backup_frequency: "daily" as BackupFrequency,
    backup_retention_count: 10,
    backup_destination_type: "local" as BackupDestinationType,
    backup_local_path: "~/.kimi/.panel/backups",
    backup_webdav_url: "",
    backup_webdav_username: "",
    backup_webdav_password: "",
    backup_webdav_path: "",
    shortcuts: createDefaultShortcuts(),
    mcp_servers: {},
  };

  return {
    configPath: panelSettings.config_path,
    profilesPath: "~/.kimi/config.profiles.toml",
    panelSettingsPath: "~/.kimi/.panel/config.panel.toml",
    mcpConfigPath: "~/.kimi/mcp.json",
    mainConfig: {
      default_model: "",
      default_thinking: true,
      default_yolo: false,
      default_plan_mode: false,
      default_editor: "",
      theme: "dark",
      show_thinking_stream: false,
      merge_all_available_skills: false,
      hooks: [],
      models: {},
      providers: {},
      loop_control: {},
      background: {},
      notifications: {},
      services: {},
      mcp: {},
    },
    profiles: {},
    activeProfile: "",
    panelSettings,
    mcpConfig: {
      mcpServers: {},
    },
  };
}

export function ensureEnumOptions(
  options: Array<{ value: string; label: string }>,
  currentValue: string | string[],
  locale: Locale,
): Array<{ value: string; label: string }> {
  const values = Array.isArray(currentValue) ? currentValue : [currentValue];
  const merged = [...options];
  for (const value of values) {
    if (!value || merged.some((option) => option.value === value)) {
      continue;
    }
    merged.push({
      value,
      label: formatMessage(t(locale, "unknownValue"), { value }),
    });
  }
  return merged;
}

export function applyAppearanceMode(mode: AppearanceMode): void {
  if (typeof document === "undefined") {
    return;
  }
  const resolvedMode =
    mode === "auto"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : mode;
  document.documentElement.dataset.theme = resolvedMode;
}

export function applyAppearanceTheme(theme: AppearanceTheme): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.dataset.appearanceTheme = theme;
}

export function applyUiFontSize(size: UiFontSize): void {
  if (typeof document === "undefined") {
    return;
  }
  const fontSize =
    UI_FONT_SIZE_OPTIONS.find((option) => option.value === size)?.fontSize ?? "16px";
  document.documentElement.style.fontSize = fontSize;
  document.documentElement.dataset.uiFontSize = size;
}

export function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

export function DoctorDriftList(props: {
  locale: Locale;
  drift: ConfigDriftEntry[] | undefined;
}): JSX.Element | null {
  const drift = props.drift ?? [];
  if (!drift.length) {
    return null;
  }
  return (
    <div className="doctor-issues doctor-drift">
      <div className="doctor-issue info">
        <span>info</span>
        <div>
          <strong>{t(props.locale, "driftTitle")}</strong>
          {drift.map((entry) => (
            <p key={`${entry.file}.${entry.path}.${entry.key}`}>
              {formatMessage(t(props.locale, "driftUnknownField"), {
                file: entry.file,
                path: entry.path,
                key: entry.key,
              })}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export function formatSkillPathLabel(
  path: SkillsScanReport["paths"][number],
  locale: Locale,
): string {
  return predictSkillLibrary(path.path, locale).label;
}

export function renderSkillPathLabel(
  path: SkillsScanReport["paths"][number],
  locale: Locale,
): JSX.Element {
  const prediction = predictSkillLibrary(path.path, locale);
  return (
    <span className="skill-path-label">
      <span className={`skill-path-icon ${prediction.className}`} aria-hidden="true">
        <prediction.icon size={14} />
      </span>
      <span className="skill-path-copy">{prediction.label}</span>
    </span>
  );
}

export function predictSkillLibrary(path: string, locale: Locale): { icon: typeof Sparkles; className: string; label: string } {
  const normalized = path.toLowerCase();
  if (normalized.includes("/.claude/")) {
    return { icon: Sparkles, className: "is-claude", label: t(locale, "skillLibraryClaude") };
  }
  if (normalized.includes("/.codex/")) {
    return { icon: Boxes, className: "is-codex", label: t(locale, "skillLibraryCodex") };
  }
  if (normalized.includes("/.kimi/")) {
    return { icon: MoonStar, className: "is-kimi", label: t(locale, "skillLibraryKimi") };
  }
  if (normalized.includes("/agents/")) {
    return { icon: PenSquare, className: "is-agents", label: t(locale, "skillLibraryAgents") };
  }
  if (path === "(managed by CLI package)") {
    return { icon: FileText, className: "is-generic", label: t(locale, "skillLibraryBuiltin") };
  }
  return { icon: FolderOpen, className: "is-generic", label: t(locale, "skillLibraryCustom") };
}
