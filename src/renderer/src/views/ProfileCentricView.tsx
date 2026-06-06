import type { KeyboardEvent } from "react";
import { Check, Plus, Star, Terminal } from "lucide-react";
import type { AppState, Locale, Profile } from "@shared/types";
import { t } from "../i18n";

interface ProfileCentricViewProps {
  state: AppState;
  locale: Locale;
  selectedProfile: string;
  favorites: string[];
  dirtyProfiles?: Set<string>;
  onSelect: (profileName: string) => void;
  onSwitch: (profileName: string) => void;
  onToggleFavorite: (profileName: string) => void;
  onAddNew: () => void;
  onOpenTerminal: (profileName: string) => void;
}

function resolveProviderLabel(state: AppState, profile: Profile): string {
  const modelEntry = state.mainConfig.models[profile.default_model];
  return modelEntry?.provider ?? "—";
}

export function ProfileCentricView(props: ProfileCentricViewProps): JSX.Element {
  const {
    state, locale, selectedProfile, favorites, dirtyProfiles,
    onSelect, onSwitch, onToggleFavorite, onAddNew, onOpenTerminal,
  } = props;
  const entries = Object.entries(state.profiles);
  const activeEntry = entries.find(([name]) => name === state.activeProfile);
  const otherEntries = entries.filter(([name]) => name !== state.activeProfile);

  // 卡片可用键盘选中（Enter / Space），内部操作按钮各自 stopPropagation
  const onCardKeyDown = (name: string) => (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(name);
    }
  };

  const favButton = (name: string): JSX.Element => {
    const isFav = favorites.includes(name);
    return (
      <button
        type="button"
        className={isFav ? "pcv-icon-btn active" : "pcv-icon-btn"}
        aria-label={isFav ? t(locale, "favoriteRemove") : t(locale, "favoriteAdd")}
        title={isFav ? t(locale, "favoriteRemove") : t(locale, "favoriteAdd")}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite(name);
        }}
      >
        <Star size={14} fill={isFav ? "currentColor" : "none"} />
      </button>
    );
  };

  const terminalButton = (name: string): JSX.Element => (
    <button
      type="button"
      className="pcv-icon-btn"
      aria-label={t(locale, "openInTerminal")}
      title={t(locale, "openInTerminal")}
      onClick={(event) => {
        event.stopPropagation();
        onOpenTerminal(name);
      }}
    >
      <Terminal size={14} />
    </button>
  );

  const nameWithDirty = (name: string, label: string): JSX.Element => (
    <strong>
      {label}
      {dirtyProfiles?.has(name) ? <span className="pcv-dirty-dot" aria-hidden="true" /> : null}
    </strong>
  );

  return (
    <section className="profile-centric-view">
      <div className="pcv-header">
        <h2>{t(locale, "modelConfig")}</h2>
        <div className="pcv-header-actions">
          <button
            className="action-button compact icon-only"
            type="button"
            onClick={onAddNew}
            aria-label={t(locale, "configureNew")}
            title={t(locale, "configureNew")}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {activeEntry ? (
        <div
          role="button"
          tabIndex={0}
          className={`pcv-active glass-panel${selectedProfile === activeEntry[0] ? " selected" : ""}`}
          onClick={() => onSelect(activeEntry[0])}
          onKeyDown={onCardKeyDown(activeEntry[0])}
        >
          <div className="pcv-active-badge">{t(locale, "currentActive")}</div>
          <div className="pcv-active-info">
            {nameWithDirty(activeEntry[0], activeEntry[1].label || activeEntry[0])}
            <span className="pcv-meta">
              {activeEntry[1].default_model} · {resolveProviderLabel(state, activeEntry[1])}
            </span>
          </div>
          <div className="pcv-active-actions">
            {favButton(activeEntry[0])}
            {terminalButton(activeEntry[0])}
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
            <div
              key={name}
              role="button"
              tabIndex={0}
              className={`pcv-list-item glass-panel${selectedProfile === name ? " selected" : ""}`}
              onClick={() => onSelect(name)}
              onKeyDown={onCardKeyDown(name)}
            >
              <div className="pcv-list-info">
                {nameWithDirty(name, profile.label || name)}
                <span className="pcv-meta">
                  {profile.default_model} · {resolveProviderLabel(state, profile)}
                </span>
              </div>
              <div className="pcv-list-actions">
                {favButton(name)}
                {terminalButton(name)}
                <button
                  className="pcv-switch-btn"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSwitch(name);
                  }}
                >
                  <Check size={13} />
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
