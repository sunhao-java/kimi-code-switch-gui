import { useEffect, useState } from "react";
import { Boxes, Check, FileText, Globe, Layers3, Zap } from "lucide-react";

import type { AppState, Locale } from "@shared/types";

import { ABOUT_INFO } from "./aboutPage";
import { APPEARANCE_THEME_OPTIONS } from "./appOptions";
import { t } from "./i18n";

export type DiagnosticLevel = "ok" | "failed" | "pending" | "unavailable";

export interface DiagnosticsState {
  preload: DiagnosticLevel;
  loadState: DiagnosticLevel;
  previewState: DiagnosticLevel;
  lastError: string;
}

type OverviewTabId = "profiles" | "providers" | "models";

export function SummaryCard(props: {
  label: string;
  value: string;
  note?: string;
  title?: string;
  accent?: boolean;
  active?: boolean;
  onClick?: () => void;
}): JSX.Element {
  const className = [
    "summary-card",
    props.accent ? "accent" : "",
    props.onClick ? "summary-card-clickable" : "",
    props.active ? "summary-card-active" : "",
  ].filter(Boolean).join(" ");
  const content = (
    <>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.note ? <small>{props.note}</small> : null}
    </>
  );

  if (props.onClick) {
    return (
      <button
        type="button"
        className={className}
        title={props.title}
        aria-label={`${props.label} ${props.value}`}
        aria-pressed={props.active}
        onClick={props.onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} title={props.title}>
      {content}
    </div>
  );
}

export function OverviewDashboard(props: {
  state: AppState;
  locale: Locale;
  diagnostics: DiagnosticsState;
  onActivateProfile: (name: string) => void;
  onNavigate: (tab: OverviewTabId) => void;
}): JSX.Element {
  const { state, locale, diagnostics, onActivateProfile, onNavigate } = props;
  const activeProfile = state.profiles[state.activeProfile];
  const providerEntries = Object.entries(state.mainConfig.providers);
  const modelEntries = Object.entries(state.mainConfig.models);
  const profileEntries = Object.entries(state.profiles);
  const visibleProviders = providerEntries.slice(0, 3);
  const visibleModels = modelEntries.slice(0, 3);
  const visibleProfiles = profileEntries.slice(0, 4);

  const [cliVersion, setCliVersion] = useState<{ version: string; installed: boolean }>({ version: "", installed: false });
  useEffect(() => {
    window.kimiSwitch?.getCliVersion?.().then(setCliVersion).catch(() => setCliVersion({ version: "", installed: false }));
  }, []);

  const boolLabel = (v: boolean): string => t(locale, v ? "overviewOn" : "overviewOff");

  function themeLabel(theme: string): string {
    const option = APPEARANCE_THEME_OPTIONS.find((o) => o.value === theme);
    return option ? option.label[locale] : theme || "aurora";
  }

  function BoolPill({ value }: { value: boolean }): JSX.Element {
    return (
      <span className={value ? "status-pill on" : "status-pill off"}>
        <span className="dot" />
        {boolLabel(value)}
      </span>
    );
  }

  const hasDiagnosticIssue = diagnostics.preload !== "ok" || diagnostics.loadState !== "ok" || diagnostics.previewState !== "ok";

  return (
    <section className="overview-grid">
      <section className="glass-panel overview-card overview-card-wide overview-hero">
        <div className="overview-hero-header">
          <Zap size={14} />
          <span>{t(locale, "overviewActiveProfile")}</span>
        </div>
        <div className="overview-app-title">
          <span className="overview-app-name">Kimi Code Switch</span>
          <span className="overview-app-ver">v{ABOUT_INFO.version}</span>
        </div>
        <div className="overview-hero-body">
          <div className="overview-hero-col">
            <div className="overview-hero-col-title">{t(locale, "overviewAppVersion")}</div>
            <div className="overview-hero-kv"><span className="overview-hero-kv-label">{t(locale, "overviewCliVersion")}</span><span className={cliVersion.installed ? "overview-hero-kv-value" : "overview-hero-kv-value text-warn"}>{cliVersion.installed ? cliVersion.version : t(locale, "overviewCliNotFound")}</span></div>
            <div className="overview-hero-kv"><span className="overview-hero-kv-label">{t(locale, "overviewDefaultModel")}</span><span className="overview-hero-kv-value">{activeProfile?.default_model || "-"}</span></div>
            <div className="overview-hero-kv"><span className="overview-hero-kv-label">{t(locale, "overviewTheme")}</span><span className="overview-hero-kv-value">{themeLabel(state.panelSettings.appearance_theme)}</span></div>
          </div>
          <div className="overview-hero-col">
            <div className="overview-hero-col-title">{t(locale, "overviewActiveConfig")}</div>
            <div className="overview-hero-kv"><span className="overview-hero-kv-label">{t(locale, "overviewThinking")}</span><BoolPill value={!!activeProfile?.default_thinking} /></div>
            <div className="overview-hero-kv"><span className="overview-hero-kv-label">{t(locale, "overviewYolo")}</span><BoolPill value={!!activeProfile?.default_yolo} /></div>
            <div className="overview-hero-kv"><span className="overview-hero-kv-label">{t(locale, "overviewPlanMode")}</span><BoolPill value={!!activeProfile?.default_plan_mode} /></div>
          </div>
        </div>
        <div className="overview-hero-paths">
          <div className="overview-hero-paths-title">{t(locale, "overviewConfigPaths")}</div>
          <div className="overview-hero-paths-grid">
            <div className="overview-hero-path"><span className="overview-hero-path-label">{t(locale, "overviewConfigTitle")}</span><span className="overview-hero-path-value">{state.configPath}</span></div>
            <div className="overview-hero-path"><span className="overview-hero-path-label">{t(locale, "overviewProfilesTitle")}</span><span className="overview-hero-path-value">{state.profilesPath}</span></div>
            <div className="overview-hero-path"><span className="overview-hero-path-label">{t(locale, "overviewPanelTitle")}</span><span className="overview-hero-path-value">{state.panelSettingsPath}</span></div>
            <div className="overview-hero-path"><span className="overview-hero-path-label">{t(locale, "overviewMcpTitle")}</span><span className="overview-hero-path-value">{state.mcpConfigPath}</span></div>
          </div>
        </div>
      </section>

      <section className="glass-panel overview-card">
        <div className="section-title">
          <Layers3 size={16} />
          <span>{t(locale, "overviewProfileList")}</span>
          <span className="overview-badge">{profileEntries.length}</span>
          {profileEntries.length > 4 ? (
            <button
              className="overview-more-link"
              type="button"
              aria-label={`${t(locale, "overviewShowMore")} ${t(locale, "overviewProfileList")}`}
              title={`${t(locale, "overviewShowMore")} ${t(locale, "overviewProfileList")}`}
              onClick={() => onNavigate("profiles")}
            >
              {t(locale, "overviewShowMore")}
            </button>
          ) : null}
        </div>
        <div className="overview-profile-grid">
          {visibleProfiles.map(([name, profile]) => {
            const isActive = name === state.activeProfile;
            return (
              <div key={name} className={isActive ? "overview-profile-chip active" : "overview-profile-chip"}>
                <div className="overview-profile-info">
                  <strong>{profile.label || name}</strong>
                  <span>{profile.default_model || "-"}</span>
                </div>
                {isActive ? (
                  <span className="overview-profile-active"><Check size={14} /></span>
                ) : (
                  <button
                    className="overview-profile-activate"
                    type="button"
                    aria-label={`${t(locale, "overviewQuickActivate")} ${profile.label || name}`}
                    title={`${t(locale, "overviewQuickActivate")} ${profile.label || name}`}
                    onClick={() => onActivateProfile(name)}
                  >
                    {t(locale, "overviewQuickActivate")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="overview-right-col">
        <section className="glass-panel overview-card">
          <div className="section-title">
            <Globe size={16} />
            <span>{t(locale, "overviewProviderList")}</span>
            <span className="overview-badge">{providerEntries.length}</span>
            {providerEntries.length > 3 ? (
              <button
                className="overview-more-link"
                type="button"
                aria-label={`${t(locale, "overviewShowMore")} ${t(locale, "overviewProviderList")}`}
                title={`${t(locale, "overviewShowMore")} ${t(locale, "overviewProviderList")}`}
                onClick={() => onNavigate("providers")}
              >
                {t(locale, "overviewShowMore")}
              </button>
            ) : null}
          </div>
          <div className="overview-list">
            {visibleProviders.map(([name, provider]) => (
              <div key={name} className="overview-list-item">
                <span className="overview-list-name">{name}</span>
                <span className="overview-list-meta">{provider.type}</span>
              </div>
            ))}
            {providerEntries.length === 0 && <p className="overview-empty">-</p>}
          </div>
        </section>

        <section className="glass-panel overview-card">
          <div className="section-title">
            <Boxes size={16} />
            <span>{t(locale, "overviewModelList")}</span>
            <span className="overview-badge">{modelEntries.length}</span>
            {modelEntries.length > 3 ? (
              <button
                className="overview-more-link"
                type="button"
                aria-label={`${t(locale, "overviewShowMore")} ${t(locale, "overviewModelList")}`}
                title={`${t(locale, "overviewShowMore")} ${t(locale, "overviewModelList")}`}
                onClick={() => onNavigate("models")}
              >
                {t(locale, "overviewShowMore")}
              </button>
            ) : null}
          </div>
          <div className="overview-list">
            {visibleModels.map(([name, model]) => (
              <div key={name} className="overview-list-item">
                <span className="overview-list-name">{name}</span>
                <span className="overview-list-meta">{model.capabilities.join(", ") || "-"}</span>
              </div>
            ))}
            {modelEntries.length === 0 && <p className="overview-empty">-</p>}
          </div>
        </section>
      </div>

      {hasDiagnosticIssue ? (
        <section className="glass-panel overview-card overview-card-wide overview-footer-merged">
          <div className="section-title">
            <FileText size={16} />
            <span>{t(locale, "diagnosticsTitle")}</span>
            <span className="overview-badge overview-badge-warn">!</span>
          </div>
          <div className="diagnostics-inline">
            <DiagnosticItem label={t(locale, "diagPreload")} level={diagnostics.preload} locale={locale} />
            <DiagnosticItem label={t(locale, "diagLoad")} level={diagnostics.loadState} locale={locale} />
            <DiagnosticItem label={t(locale, "diagPreview")} level={diagnostics.previewState} locale={locale} />
          </div>
          {diagnostics.lastError ? (
            <div className="diagnostics-block">
              <div className="code-head">{t(locale, "diagLastError")}</div>
              <pre>{diagnostics.lastError}</pre>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function DiagnosticItem(props: {
  label: string;
  level: DiagnosticLevel;
  locale: Locale;
}): JSX.Element {
  return (
    <div className={`diagnostic-item ${props.level}`}>
      <span>{props.label}</span>
      <strong>{diagnosticLabel(props.level, props.locale)}</strong>
    </div>
  );
}

function diagnosticLabel(level: DiagnosticLevel, locale: Locale): string {
  switch (level) {
    case "ok":
      return t(locale, "diagOk");
    case "failed":
      return t(locale, "diagFailed");
    case "unavailable":
      return t(locale, "diagUnavailable");
    default:
      return t(locale, "diagPending");
  }
}
