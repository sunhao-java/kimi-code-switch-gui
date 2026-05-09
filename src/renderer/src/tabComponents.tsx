import { useEffect, useState } from "react";
import {
  Boxes, Eye, EyeOff, FileText, FolderOpen, LoaderCircle,
  MoonStar, PenSquare, Save, Sparkles, X,
} from "lucide-react";

import { normalizeEntryName } from "@shared/nameRules";
import { createDefaultShortcuts } from "@shared/shortcutStore";
import type { SkillsScanReport } from "@shared/skillsStore";
import type {
  AppState,
  AppearanceMode, AppearanceTheme, BackupDestinationType, BackupFrequency, BackupStrategy,
  CloseBehavior, DisplayOpenMode, Locale,
  McpServerConfig, McpTransport, Profile, UiFontSize,
} from "@shared/types";

import { getApi } from "./appHelpers";
import {
  MCP_TRANSPORT_OPTIONS, MODEL_CAPABILITY_OPTIONS,
  PROVIDER_TYPE_OPTIONS, UI_FONT_SIZE_OPTIONS,
} from "./appOptions";
import { t } from "./i18n";
import {
  Field, KeyValueListField, MultiSelectField,
  ReadOnlyField, SelectField, TextAreaField, Toggle,
} from "./formControls";

export function createCopyName(sourceName: string, existing: Record<string, unknown>): string {
  const baseName = `${sourceName} Copy`;
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
      label: option.label[props.locale],
    })),
    props.value.type,
    props.locale,
  );

  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{props.locale === "zh-CN" ? "Provider 编辑" : "Provider Editor"}</div>
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
      />
      <div className="button-row">
        <button className="action-button action-button-primary" onClick={props.onSave}>
          <Save size={16} />
          <span>{t(props.locale, "saveProvider")}</span>
        </button>
        <button className="action-button danger" onClick={props.onDelete}>{t(props.locale, "delete")}</button>
      </div>
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
  };
  onChange: (
    name: string,
    patch: Partial<{
      provider: string;
      model: string;
      max_context_size: number;
      capabilities: string[];
    }>,
  ) => void;
  onSave: () => void;
  onDelete: () => void;
}): JSX.Element {
  const capabilityOptions = ensureEnumOptions(
    MODEL_CAPABILITY_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label[props.locale],
    })),
    props.value.capabilities,
    props.locale,
  );

  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{props.locale === "zh-CN" ? "Model 编辑" : "Model Editor"}</div>
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
      <div className="button-row">
        <button className="action-button action-button-primary" onClick={props.onSave}>
          <Save size={16} />
          <span>{t(props.locale, "saveModel")}</span>
        </button>
        <button className="action-button danger" onClick={props.onDelete}>{t(props.locale, "delete")}</button>
      </div>
    </section>
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
    label: option.label[props.locale],
  }));

  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{props.locale === "zh-CN" ? "MCP 编辑" : "MCP Editor"}</div>
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
            keyPlaceholder={props.locale === "zh-CN" ? "Header 名称" : "Header name"}
            valuePlaceholder={props.locale === "zh-CN" ? "Header 值" : "Header value"}
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
            keyPlaceholder={props.locale === "zh-CN" ? "变量名称" : "Variable name"}
            valuePlaceholder={props.locale === "zh-CN" ? "变量值" : "Variable value"}
            onChange={(next) => props.onChange(props.name, { ...props.value, env: next })}
          />
        </>
      )}
      <div className="button-row">
        <button className="action-button action-button-primary" onClick={props.onSave}>
          <Save size={16} />
          <span>{t(props.locale, "saveMcpServer")}</span>
        </button>
        <button
          className={props.isTesting ? "action-button is-loading" : "action-button"}
          type="button"
          disabled={props.isTesting}
          onClick={() => void props.onRunAction("test", props.name)}
        >
          {props.isTesting ? <LoaderCircle size={16} className="button-spinner" /> : null}
          <span>{props.isTesting ? t(props.locale, "mcpTesting") : t(props.locale, "mcpTest")}</span>
        </button>
        <button className="action-button danger" onClick={props.onDelete}>{t(props.locale, "delete")}</button>
      </div>
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
  useDialogEscape(props.onCancel);

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
      <section className="glass-panel form-panel mcp-import-dialog" role="dialog" aria-modal="true" aria-labelledby="mcp-import-title">
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
        <div className="button-row">
          <button className="action-button action-button-primary" type="button" onClick={props.onImport}>
            <span>{t(props.locale, "mcpImportApply")}</span>
          </button>
          <button className="action-button" type="button" onClick={props.onCancel}>
            <span>{t(props.locale, "mcpImportCancel")}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

export function useDialogEscape(onClose: () => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
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
  onTest: () => void;
  onActivate: () => void;
  onClone: () => void;
  onDelete: () => void;
}): JSX.Element {
  const value = props.value;
  return (
    <section className="glass-panel form-panel">
      <div className="section-title">{props.locale === "zh-CN" ? "Profile 编辑" : "Profile Editor"}</div>
      {props.nameEditable ? (
        <Field label={t(props.locale, "formName")} value={props.name} onChange={(next) => props.onChange(next, { ...value, name: next })} />
      ) : (
        <ReadOnlyField label={t(props.locale, "formName")} value={props.name} />
      )}
      <Field label={t(props.locale, "formLabel")} value={value.label} onChange={(next) => props.onChange(props.name, { ...value, label: next })} />
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
      <div className="button-row">
        <button className="action-button action-button-primary" onClick={props.onSave}>
          <Save size={16} />
          <span>{t(props.locale, "saveProfile")}</span>
        </button>
        <button
          className={props.isTesting ? "action-button is-loading" : "action-button"}
          type="button"
          disabled={props.isTesting}
          onClick={props.onTest}
        >
          {props.isTesting ? <LoaderCircle size={16} className="button-spinner" /> : null}
          <span>{props.isTesting ? t(props.locale, "profileTesting") : t(props.locale, "profileTest")}</span>
        </button>
        <button className={props.isActive ? "action-button action-button-primary" : "action-button"} onClick={props.onActivate}>{t(props.locale, "activate")}</button>
        <button className="action-button" onClick={props.onClone}>{t(props.locale, "clone")}</button>
        <button className="action-button danger" onClick={props.onDelete}>{t(props.locale, "delete")}</button>
      </div>
    </section>
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
      label: locale === "zh-CN" ? `未知值（${value}）` : `Unknown Value (${value})`,
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

export function formatSkillPathLabel(
  path: SkillsScanReport["paths"][number],
): string {
  return predictSkillLibrary(path.path).label;
}

export function renderSkillPathLabel(
  path: SkillsScanReport["paths"][number],
): JSX.Element {
  const prediction = predictSkillLibrary(path.path);
  return (
    <span className="skill-path-label">
      <span className={`skill-path-icon ${prediction.className}`} aria-hidden="true">
        <prediction.icon size={14} />
      </span>
      <span className="skill-path-copy">{prediction.label}</span>
    </span>
  );
}

export function predictSkillLibrary(path: string): { icon: typeof Sparkles; className: string; label: string } {
  const normalized = path.toLowerCase();
  if (normalized.includes("/.claude/")) {
    return { icon: Sparkles, className: "is-claude", label: "Claude 技能库" };
  }
  if (normalized.includes("/.codex/")) {
    return { icon: Boxes, className: "is-codex", label: "Codex 技能库" };
  }
  if (normalized.includes("/.kimi/")) {
    return { icon: MoonStar, className: "is-kimi", label: "Kimi 技能库" };
  }
  if (normalized.includes("/agents/")) {
    return { icon: PenSquare, className: "is-agents", label: "Agents 技能库" };
  }
  if (path === "(managed by CLI package)") {
    return { icon: FileText, className: "is-generic", label: "内置技能库" };
  }
  return { icon: FolderOpen, className: "is-generic", label: "自定义技能库" };
}
