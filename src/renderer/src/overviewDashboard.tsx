import { Boxes, Check, FileText, Globe, Layers3, Zap } from "lucide-react";

import type { AppState, Locale } from "@shared/types";

import { t } from "./i18n";

export type DiagnosticLevel = "ok" | "failed" | "pending" | "unavailable";

export interface DiagnosticsState {
  preload: DiagnosticLevel;
  loadState: DiagnosticLevel;
  previewState: DiagnosticLevel;
  lastError: string;
}

type OverviewTabId = "profiles" | "providers" | "models";

export function SummaryCard(props: { label: string; value: string; note?: string; title?: string; accent?: boolean }): JSX.Element {
  return (
    <div className={props.accent ? "summary-card accent" : "summary-card"} title={props.title}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.note ? <small>{props.note}</small> : null}
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

  const boolLabel = (v: boolean): string => t(locale, v ? "overviewOn" : "overviewOff");

  function BoolPill({ value }: { value: boolean }): JSX.Element {
    return (
      <span className={value ? "status-pill on" : "status-pill off"}>
        <span className="dot" />
        {boolLabel(value)}
      </span>
    );
  }

  return (
    <section className="overview-grid">
      <section className="glass-panel overview-card overview-hero overview-hero-tall">
        <div className="overview-hero-header">
          <Zap size={15} />
          <span>{t(locale, "overviewActiveProfile")}</span>
        </div>
        {activeProfile ? (
          <>
            <div className="overview-profile-name">{state.activeProfile}</div>
            <div className="overview-kv-grid">
              <div className="overview-kv"><span>{t(locale, "overviewDefaultModel")}</span><strong>{activeProfile.default_model || "-"}</strong></div>
              <div className="overview-kv"><span>{t(locale, "overviewThinking")}</span><BoolPill value={activeProfile.default_thinking} /></div>
              <div className="overview-kv"><span>{t(locale, "overviewYolo")}</span><BoolPill value={activeProfile.default_yolo} /></div>
              <div className="overview-kv"><span>{t(locale, "overviewPlanMode")}</span><BoolPill value={activeProfile.default_plan_mode} /></div>
              <div className="overview-kv"><span>{t(locale, "overviewThinkingStream")}</span><BoolPill value={activeProfile.show_thinking_stream} /></div>
              <div className="overview-kv"><span>{t(locale, "overviewMergeSkills")}</span><BoolPill value={activeProfile.merge_all_available_skills} /></div>
            </div>
          </>
        ) : (
          <p className="overview-empty">{t(locale, "overviewNone")}</p>
        )}
      </section>

      <div className="overview-right-col">
        <section className="glass-panel overview-card">
          <div className="section-title">
            <Globe size={16} />
            <span>{t(locale, "overviewProviderList")}</span>
            <span className="overview-badge">{providerEntries.length}</span>
            {providerEntries.length > 3 ? (
              <button className="overview-more-link" type="button" onClick={() => onNavigate("providers")}>
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
              <button className="overview-more-link" type="button" onClick={() => onNavigate("models")}>
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

      <section className="glass-panel overview-card overview-card-wide">
        <div className="section-title">
          <Layers3 size={16} />
          <span>{t(locale, "overviewProfileList")}</span>
          <span className="overview-badge">{profileEntries.length}</span>
          {profileEntries.length > 4 ? (
            <button className="overview-more-link" type="button" onClick={() => onNavigate("profiles")}>
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
                  <button className="overview-profile-activate" onClick={() => onActivateProfile(name)}>
                    {t(locale, "overviewQuickActivate")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="overview-footer">
        <section className="glass-panel overview-card">
          <div className="section-title">
            <FileText size={16} />
            <span>{t(locale, "overviewConfigPaths")}</span>
          </div>
          <div className="overview-paths">
            <code>{state.configPath}</code>
            <code>{state.profilesPath}</code>
            <code>{state.panelSettingsPath}</code>
            <code>{state.mcpConfigPath}</code>
          </div>
        </section>
        <DiagnosticsPanel locale={locale} diagnostics={diagnostics} state={state} />
      </div>
    </section>
  );
}

function DiagnosticsPanel(props: {
  locale: Locale;
  diagnostics: DiagnosticsState;
  state: AppState;
}): JSX.Element {
  const { locale, diagnostics, state } = props;
  return (
    <section className="glass-panel diagnostics-panel">
      <div className="section-title">{t(locale, "diagnosticsTitle")}</div>
      <p className="diagnostics-subtitle">{t(locale, "diagnosticsSubtitle")}</p>
      <div className="diagnostics-grid">
        <DiagnosticItem label={t(locale, "diagPreload")} level={diagnostics.preload} locale={locale} />
        <DiagnosticItem label={t(locale, "diagLoad")} level={diagnostics.loadState} locale={locale} />
        <DiagnosticItem label={t(locale, "diagPreview")} level={diagnostics.previewState} locale={locale} />
      </div>
      <div className="diagnostics-block">
        <div className="code-head">{t(locale, "diagPaths")}</div>
        <pre>{[state.configPath, state.profilesPath, state.panelSettingsPath, state.mcpConfigPath].join("\n")}</pre>
      </div>
      <div className="diagnostics-block">
        <div className="code-head">{t(locale, "diagLastError")}</div>
        <pre>{diagnostics.lastError || "-"}</pre>
      </div>
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
