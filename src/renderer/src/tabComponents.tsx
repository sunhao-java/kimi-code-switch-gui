import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Boxes, Check, Copy, Eye, FileText, FolderOpen,
  MoonStar, PenSquare, Sparkles, X,
} from "lucide-react";

import { createDefaultShortcuts } from "@shared/shortcutStore";
import type { SkillsScanReport } from "@shared/skillsStore";
import type {
  AppState,
  AppearanceMode, AppearanceTheme, BackupDestinationType, BackupFrequency, BackupStrategy,
  CloseBehavior, ConfigDriftEntry, DisplayOpenMode, Locale,
  McpServerConfig, Profile, UiFontSize,
} from "@shared/types";

import { getApi } from "./appHelpers";
import {
  UI_FONT_SIZE_OPTIONS,
} from "./appOptions";
import { useDialogEscape, useFocusTrap } from "./dialogs";
import { t } from "./i18n";
import {
  ActionFooter, Field, MultiSelectField,
  ReadOnlyField, SelectField, Toggle,
} from "./formControls";
export { ProviderForm, SecretField } from "./providerForm";
export { ModelForm, nextPricingFromInput } from "./modelForm";
export { ProfileForm } from "./profileForm";

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

export {
  McpServerForm, switchMcpTransport, parseListLines, formatListLines,
  isRemoteMcpTransport, parseRecordLines, formatRecordLines,
} from "./mcpComponents";

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

export function McpJsonViewerDialog(props: {
  locale: Locale;
  value: string;
  onClose: () => void;
}): JSX.Element {
  const dialogRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useDialogEscape(props.onClose);
  useFocusTrap(dialogRef);

  const copyJson = (): void => {
    const writeClipboard = navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(props.value)
      : Promise.reject(new Error("Clipboard API is unavailable."));
    void writeClipboard.then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => {
      setCopied(false);
    });
  };

  return createPortal(
    <div
      className="mcp-json-viewer-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <section ref={dialogRef} className="glass-panel form-panel mcp-import-dialog" role="dialog" aria-modal="true" aria-labelledby="mcp-json-viewer-title">
        <div className="mcp-import-header">
          <div>
            <div className="section-title" id="mcp-json-viewer-title">{t(props.locale, "mcpJsonViewerTitle")}</div>
            <p className="mcp-import-hint">{t(props.locale, "mcpJsonViewerHint")}</p>
          </div>
          <div className="mcp-json-viewer-actions">
            <button
              className="action-button compact icon-only"
              type="button"
              aria-label={t(props.locale, "copyContent")}
              title={copied ? t(props.locale, "copied") : t(props.locale, "copyContent")}
              onClick={copyJson}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
            <button className="action-button compact icon-only" type="button" aria-label={t(props.locale, "close")} onClick={props.onClose}>
              <X size={16} />
            </button>
          </div>
        </div>
        <label className="field">
          <span>{t(props.locale, "mcpJsonViewerContent")}</span>
          <textarea
            className="mcp-import-textarea mcp-json-viewer-textarea"
            readOnly
            rows={14}
            value={props.value}
          />
        </label>
        <div className="button-row">
          <button className="action-button" type="button" onClick={props.onClose}>
            <X size={16} />
            <span>{t(props.locale, "close")}</span>
          </button>
        </div>
      </section>
    </div>,
    document.body,
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
    config_target: "kimi-code" as const,
    config_path: "~/.kimi-code/config.toml",
    profiles: {},
    active_profile: "default",
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
    backup_local_path: "~/.kimi-code-switch-gui/backups",
    backup_webdav_url: "",
    backup_webdav_username: "",
    backup_webdav_password: "",
    backup_webdav_path: "",
    shortcuts: createDefaultShortcuts(),
    mcp_servers: {},
  };

  return {
    configPath: panelSettings.config_path,
    configTarget: "kimi-code",
    profilesPath: "",
    panelSettingsPath: "~/.kimi-code-switch-gui/config.panel.toml",
    mcpConfigPath: "~/.kimi-code/mcp.json",
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
