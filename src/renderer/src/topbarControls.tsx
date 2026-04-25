import { useEffect, useRef, useState } from "react";
import { CheckCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { AppearanceMode, Locale } from "@shared/types";

import { t } from "./i18n";

export function TopbarControls(props: {
  locale: Locale;
  theme: AppearanceMode;
  localeOptions: Array<{ value: Locale; shortLabel: string; longLabel: string }>;
  themeOptions: Array<{
    value: AppearanceMode;
    icon: LucideIcon;
    shortLabel: string;
    label: Record<Locale, string>;
  }>;
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (theme: AppearanceMode) => void;
}): JSX.Element {
  const [openPanel, setOpenPanel] = useState<"locale" | "theme" | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenPanel(null);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const activeLocale = props.localeOptions.find((option) => option.value === props.locale) ?? props.localeOptions[0];
  const activeTheme = props.themeOptions.find((option) => option.value === props.theme) ?? props.themeOptions[0];
  const ActiveThemeIcon = activeTheme.icon;

  return (
    <div className="toolbar-control-group" ref={rootRef}>
      <div className={openPanel === "locale" ? "toolbar-menu is-open" : "toolbar-menu"}>
        <button
          className={openPanel === "locale" ? "toolbar-icon-button active" : "toolbar-icon-button"}
          type="button"
          aria-label={t(props.locale, "locale")}
          aria-expanded={openPanel === "locale"}
          onClick={() => setOpenPanel((current) => (current === "locale" ? null : "locale"))}
        >
          <span className="toolbar-icon-badge flag">{activeLocale.shortLabel}</span>
          <span className="toolbar-icon-copy">
            <strong>{activeLocale.longLabel}</strong>
            <small>{t(props.locale, "locale")}</small>
          </span>
        </button>
        <div className="toolbar-popover" role="menu" aria-label={t(props.locale, "locale")}>
          {props.localeOptions.map((option) => (
            <button
              key={option.value}
              className={option.value === props.locale ? "toolbar-option active" : "toolbar-option"}
              type="button"
              onClick={() => {
                props.onLocaleChange(option.value);
                setOpenPanel(null);
              }}
            >
              <span className="toolbar-option-leading flag">{option.shortLabel}</span>
              <span className="toolbar-option-copy">
                <strong>{option.longLabel}</strong>
                <small>{option.value}</small>
              </span>
              {option.value === props.locale ? <CheckCheck size={16} /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className={openPanel === "theme" ? "toolbar-menu is-open" : "toolbar-menu"}>
        <button
          className={openPanel === "theme" ? "toolbar-icon-button active" : "toolbar-icon-button"}
          type="button"
          aria-label={t(props.locale, "theme")}
          aria-expanded={openPanel === "theme"}
          onClick={() => setOpenPanel((current) => (current === "theme" ? null : "theme"))}
        >
          <span className="toolbar-icon-badge">
            <ActiveThemeIcon size={16} />
          </span>
          <span className="toolbar-icon-copy">
            <strong>{activeTheme.label[props.locale]}</strong>
            <small>{t(props.locale, "theme")}</small>
          </span>
        </button>
        <div className="toolbar-popover" role="menu" aria-label={t(props.locale, "theme")}>
          {props.themeOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                className={option.value === props.theme ? "toolbar-option active" : "toolbar-option"}
                type="button"
                onClick={() => {
                  props.onThemeChange(option.value);
                  setOpenPanel(null);
                }}
              >
                <span className="toolbar-option-leading icon">
                  <Icon size={15} />
                </span>
                <span className="toolbar-option-copy">
                  <strong>{option.label[props.locale]}</strong>
                  <small>{option.value}</small>
                </span>
                {option.value === props.theme ? <CheckCheck size={16} /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
