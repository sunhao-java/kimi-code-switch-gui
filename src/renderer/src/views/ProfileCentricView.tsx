import { Check, Plus, Settings, Terminal } from "lucide-react";
import type { AppState, Locale, Profile } from "@shared/types";
import { buildModelName } from "@shared/nameRules";
import { t } from "../i18n";

interface ProfileCentricViewProps {
  state: AppState;
  locale: Locale;
  onSwitch: (profileName: string) => void;
  onAddNew: () => void;
  onShowAdvanced: () => void;
  onOpenTerminal: (profileName: string) => void;
}

function resolveProviderLabel(state: AppState, profile: Profile): string {
  const modelEntry = state.mainConfig.models[profile.default_model];
  return modelEntry?.provider ?? "—";
}

export function ProfileCentricView(props: ProfileCentricViewProps): JSX.Element {
  const { state, locale, onSwitch, onAddNew, onShowAdvanced, onOpenTerminal } = props;
  const entries = Object.entries(state.profiles);
  const activeEntry = entries.find(([name]) => name === state.activeProfile);
  const otherEntries = entries.filter(([name]) => name !== state.activeProfile);

  return (
    <section className="profile-centric-view">
      <div className="pcv-header">
        <h2>{t(locale, "yourAssistants")}</h2>
        <div className="pcv-header-actions">
          <button className="action-button compact" type="button" onClick={onAddNew}>
            <Plus size={15} />
            <span>{t(locale, "configureNew")}</span>
          </button>
          <button className="action-button compact secondary" type="button" onClick={onShowAdvanced}>
            <Settings size={15} />
            <span>{t(locale, "showAdvanced")}</span>
          </button>
        </div>
      </div>

      {activeEntry ? (
        <div className="pcv-active glass-panel">
          <div className="pcv-active-badge">{t(locale, "currentActive")}</div>
          <div className="pcv-active-info">
            <strong>{activeEntry[1].label || activeEntry[0]}</strong>
            <span className="pcv-meta">
              {activeEntry[1].default_model} · {resolveProviderLabel(state, activeEntry[1])}
            </span>
          </div>
          <div className="pcv-active-actions">
            <button
              className="action-button compact"
              type="button"
              aria-label={t(locale, "openInTerminal")}
              title={t(locale, "openInTerminal")}
              onClick={() => onOpenTerminal(activeEntry[0])}
            >
              <Terminal size={15} />
            </button>
          </div>
        </div>
      ) : (
        <div className="pcv-empty glass-panel">
          <p>{t(locale, "noActiveProfile")}</p>
          <button className="action-button" type="button" onClick={onAddNew}>
            <Plus size={15} />
            <span>{t(locale, "configureNew")}</span>
          </button>
        </div>
      )}

      {otherEntries.length > 0 ? (
        <div className="pcv-list">
          <h3>{t(locale, "otherProfiles")}</h3>
          {otherEntries.map(([name, profile]) => (
            <div key={name} className="pcv-list-item glass-panel">
              <div className="pcv-list-info">
                <strong>{profile.label || name}</strong>
                <span className="pcv-meta">
                  {profile.default_model} · {resolveProviderLabel(state, profile)}
                </span>
              </div>
              <div className="pcv-list-actions">
                <button
                  className="action-button compact"
                  type="button"
                  onClick={() => onOpenTerminal(name)}
                  aria-label={t(locale, "openInTerminal")}
                  title={t(locale, "openInTerminal")}
                >
                  <Terminal size={14} />
                </button>
                <button
                  className="action-button compact primary"
                  type="button"
                  onClick={() => onSwitch(name)}
                >
                  <Check size={14} />
                  <span>{t(locale, "switchTo")}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div className="pcv-empty-all glass-panel">
          <p>{t(locale, "noProfiles")}</p>
          <button className="action-button primary" type="button" onClick={onAddNew}>
            <Plus size={15} />
            <span>{t(locale, "configureNew")}</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
