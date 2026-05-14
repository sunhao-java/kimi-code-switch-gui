import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import type { AppState, Locale, Profile } from "@shared/types";

import { t } from "./i18n";

interface QuickProfileSwitcherProps {
  state: AppState;
  locale: Locale;
  onActivate: (profileName: string) => void;
  onClose: () => void;
}

export function QuickProfileSwitcher({ state, locale, onActivate, onClose }: QuickProfileSwitcherProps): JSX.Element {
  const entries = Object.entries(state.profiles);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = entries.findIndex(([name]) => name === state.activeProfile);
    return idx >= 0 ? idx : 0;
  });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent): void => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, entries.length - 1));
          break;
        case "ArrowUp":
          event.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          event.preventDefault();
          if (entries[selectedIndex]) onActivate(entries[selectedIndex][0]);
          break;
        case "Escape":
          event.preventDefault();
          onClose();
          break;
      }
    },
    [entries, selectedIndex, onActivate, onClose],
  );

  return createPortal(
    <div className="command-palette-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label={t(locale, "quickSwitchTitle")} onKeyDown={handleKeyDown} tabIndex={-1} ref={(el) => el?.focus()}>
        <div className="command-palette-input-row">
          <span className="command-palette-title">{t(locale, "quickSwitchTitle")}</span>
          <button type="button" className="command-palette-close" onClick={onClose} aria-label={t(locale, "close")}>
            <X size={14} />
          </button>
        </div>
        <div className="command-palette-results" ref={listRef} role="listbox">
          {entries.map(([name, profile], index) => (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={index === selectedIndex ? "command-palette-item selected" : "command-palette-item"}
              onClick={() => onActivate(name)}
            >
              <span className="command-palette-item-name">{name}</span>
              <ProfileBadges profile={profile} isActive={name === state.activeProfile} locale={locale} />
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ProfileBadges({ profile, isActive, locale }: { profile: Profile; isActive: boolean; locale: Locale }): JSX.Element {
  return (
    <span className="command-palette-item-subtitle">
      {isActive ? <span className="badge badge-active">{t(locale, "quickSwitchActive")}</span> : null}
      <span>{profile.default_model}</span>
      {profile.default_thinking ? <span className="badge">T</span> : null}
      {profile.default_yolo ? <span className="badge">Y</span> : null}
    </span>
  );
}
