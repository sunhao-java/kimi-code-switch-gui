import { useCallback, useEffect, useState } from "react";
import { Boxes, Check, Download, FileText, Globe, Layers3, LoaderCircle, RefreshCw, Zap } from "lucide-react";

import type { AppState, KimiCodeInstallSource, Locale } from "@shared/types";

import { ABOUT_INFO } from "./aboutInfo";
import { APPEARANCE_THEME_OPTIONS, labelForLocale } from "./appOptions";
import { t } from "./i18n";

export type DiagnosticLevel = "ok" | "failed" | "pending" | "unavailable";

export interface DiagnosticsState {
  preload: DiagnosticLevel;
  loadState: DiagnosticLevel;
  previewState: DiagnosticLevel;
  lastError: string;
}

type OverviewTabId = "profiles" | "providers" | "models";
type CliVersionState = {
  version: string;
  installed: boolean;
  checking?: boolean;
  latestVersion?: string;
  hasUpdate?: boolean;
  installCommand?: string;
  installSource?: KimiCodeInstallSource;
};

const EMPTY_CLI_VERSION: CliVersionState = { version: "", installed: false };

function cliVersionFromDetection(detection: AppState["kimiTargetDetection"] | undefined): CliVersionState {
  if (!detection) return { ...EMPTY_CLI_VERSION, checking: true };
  return {
    version: detection.version,
    installed: detection.installed,
    checking: detection.status === "checking",
    latestVersion: detection.latestVersion,
    hasUpdate: detection.hasUpdate,
    installCommand: detection.installCommand,
    installSource: detection.installSource,
  };
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
  const activeProfileDisplayName = activeProfile?.label?.trim() || state.activeProfile || "-";
  const visibleProviders = providerEntries.slice(0, 3);
  const visibleModels = modelEntries.slice(0, 3);
  const visibleProfiles = profileEntries.slice(0, 4);

  const [cliVersion, setCliVersion] = useState<CliVersionState>(() => cliVersionFromDetection(state.kimiTargetDetection));
  const [isCliVersionChecking, setIsCliVersionChecking] = useState(false);
  const [isCliUpdating, setIsCliUpdating] = useState(false);
  const checkCliVersion = useCallback(async (checkLatest = false): Promise<void> => {
    setIsCliVersionChecking(true);
    try {
      const version = await window.kimiSwitch?.getCliVersion?.({ checkLatest, target: "kimi-code" });
      setCliVersion(version ?? EMPTY_CLI_VERSION);
    } catch {
      setCliVersion(EMPTY_CLI_VERSION);
    } finally {
      setIsCliVersionChecking(false);
    }
  }, []);

  useEffect(() => {
    setCliVersion(cliVersionFromDetection(state.kimiTargetDetection));
  }, [state.kimiTargetDetection]);

  const upgradeCli = useCallback(async (): Promise<void> => {
    setIsCliUpdating(true);
    try {
      await window.kimiSwitch?.upgradeKimiCli?.("kimi-code", { install: !cliVersion.installed });
      await checkCliVersion(true);
    } finally {
      setIsCliUpdating(false);
    }
  }, [checkCliVersion, cliVersion.installed]);

  const cliVersionText = cliVersion.checking
    ? t(locale, "configTargetDetecting")
    : cliVersion.installed
    ? cliVersion.hasUpdate && cliVersion.latestVersion
      ? `${cliVersion.version} -> ${cliVersion.latestVersion}`
      : cliVersion.version
    : t(locale, "overviewCliNotFound");

  const versionLabel = t(locale, "overviewKimiCodeVersion");
  const checkVersionLabel = t(locale, "overviewKimiCodeCheck");
  const updateVersionLabel = cliVersion.installed ? t(locale, "overviewKimiCodeUpdate") : t(locale, "overviewKimiCodeInstall");
  const installSourceLabel = (source?: KimiCodeInstallSource): string => {
    switch (source) {
      case "homebrew":
        return t(locale, "configTargetInstallSourceHomebrew");
      case "official-script":
        return t(locale, "configTargetInstallSourceOfficialScript");
      case "npm":
        return t(locale, "configTargetInstallSourceNpm");
      case "pnpm":
        return t(locale, "configTargetInstallSourcePnpm");
      case "unknown":
      case undefined:
        return cliVersion.installed ? t(locale, "configTargetInstallSourceUnknown") : t(locale, "overviewCliNotFound");
    }
  };

  const boolLabel = (v: boolean): string => t(locale, v ? "overviewOn" : "overviewOff");
  const resolveProfileModelName = (profile: AppState["profiles"][string]): string =>
    profile.default_model || state.mainConfig.default_model || "";
  const activeProfileModelName = activeProfile ? resolveProfileModelName(activeProfile) : state.mainConfig.default_model;
  const formatProfileModes = (profile: AppState["profiles"][string]): string => [
    `${t(locale, "overviewThinking")}: ${boolLabel(!!profile.default_thinking)}`,
    `${t(locale, "overviewYolo")}: ${boolLabel(!!profile.default_yolo)}`,
    `${t(locale, "overviewPlanMode")}: ${boolLabel(!!profile.default_plan_mode)}`,
  ].join(" · ");

  function themeLabel(theme: string): string {
    const option = APPEARANCE_THEME_OPTIONS.find((o) => o.value === theme);
    return option ? labelForLocale(option.label, locale) : theme || "aurora";
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
          <span className="overview-app-name">{activeProfileDisplayName}</span>
          <span className="overview-app-ver">v{ABOUT_INFO.version}</span>
        </div>
        <div className="overview-hero-body">
          <div className="overview-hero-col">
            <div className="overview-hero-col-title">{t(locale, "overviewAppVersion")}</div>
            <div className="overview-hero-kv"><span className="overview-hero-kv-label">{versionLabel}</span><span className={cliVersion.installed || cliVersion.checking ? "overview-hero-kv-value overview-cli-version-value" : "overview-hero-kv-value overview-cli-version-value text-warn"}><span>{cliVersionText}</span><button className="overview-cli-check-button" type="button" title={checkVersionLabel} aria-label={checkVersionLabel} disabled={isCliVersionChecking || isCliUpdating} onClick={() => void checkCliVersion(true)}>{isCliVersionChecking ? <LoaderCircle size={13} className="button-spinner" /> : <RefreshCw size={13} />}</button>{!cliVersion.checking && (cliVersion.hasUpdate || !cliVersion.installed) ? <button className="overview-cli-check-button" type="button" title={cliVersion.installed ? updateVersionLabel : `${updateVersionLabel}: ${cliVersion.installCommand ?? ""}`} aria-label={updateVersionLabel} disabled={isCliUpdating || isCliVersionChecking} onClick={() => void upgradeCli()}>{isCliUpdating ? <LoaderCircle size={13} className="button-spinner" /> : <Download size={13} />}</button> : null}</span></div>
            <div className="overview-hero-kv"><span className="overview-hero-kv-label">{t(locale, "overviewKimiCodeInstallSource")}</span><span className="overview-hero-kv-value">{installSourceLabel(cliVersion.installSource)}</span></div>
            <div className="overview-hero-kv"><span className="overview-hero-kv-label">{t(locale, "overviewDefaultModel")}</span><span className="overview-hero-kv-value">{activeProfileModelName || "-"}</span></div>
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
            const profileModelName = resolveProfileModelName(profile);
            return (
              <div key={name} className={isActive ? "overview-profile-chip active" : "overview-profile-chip"}>
                <div className="overview-profile-info">
                  <strong title={profile.label || name}>{profile.label || name}</strong>
                  <div className={profileModelName ? "overview-profile-model" : "overview-profile-model is-empty"}>
                    {profileModelName || t(locale, "overviewProfileModelUnset")}
                  </div>
                  <div className="overview-profile-modes" title={formatProfileModes(profile)}>
                    {formatProfileModes(profile)}
                  </div>
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
