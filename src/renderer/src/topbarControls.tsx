import { useEffect, useRef, useState } from "react";
import { CheckCheck, Layers3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { AppearanceMode, Locale, LocalizedText } from "@shared/types";

import { labelForLocale } from "./appOptions";
import { t } from "./i18n";

export function TopbarControls(props: {
  locale: Locale;
  theme: AppearanceMode;
  localeOptions: Array<{ value: Locale; shortLabel: string; longLabel: string }>;
  themeOptions: Array<{
    value: AppearanceMode;
    icon: LucideIcon;
    shortLabel: string;
    label: LocalizedText;
  }>;
  environmentId: string;
  environmentOptions: Array<{ value: string; label: string; description?: string }>;
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (theme: AppearanceMode) => void;
  onEnvironmentChange: (environmentId: string) => void;
}): JSX.Element {
  const [openPanel, setOpenPanel] = useState<"environment" | "locale" | "theme" | null>(null);
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
  const activeEnvironment = props.environmentOptions.find((option) => option.value === props.environmentId) ?? props.environmentOptions[0];
  const ActiveThemeIcon = activeTheme.icon;

  return (
    <div className="toolbar-control-group" ref={rootRef}>
      <div className={openPanel === "environment" ? "toolbar-menu is-open toolbar-menu-environment" : "toolbar-menu toolbar-menu-environment"}>
        <button
          className={openPanel === "environment" ? "toolbar-icon-button active toolbar-environment-button" : "toolbar-icon-button toolbar-environment-button"}
          type="button"
          aria-label={t(props.locale, "kimiCodeEnvironment")}
          aria-expanded={openPanel === "environment"}
          onClick={() => setOpenPanel((current) => (current === "environment" ? null : "environment"))}
        >
          <span className="toolbar-icon-badge">
            <Layers3 size={16} />
          </span>
          <span className="toolbar-icon-copy">
            <strong>{activeEnvironment?.label ?? props.environmentId}</strong>
            <small>{t(props.locale, "kimiCodeEnvironment")}</small>
          </span>
        </button>
        <div className="toolbar-popover toolbar-popover-wide" role="menu" aria-label={t(props.locale, "kimiCodeEnvironment")}>
          {props.environmentOptions.map((option) => (
            <button
              key={option.value}
              className={option.value === props.environmentId ? "toolbar-option active" : "toolbar-option"}
              type="button"
              onClick={() => {
                if (option.value !== props.environmentId) {
                  props.onEnvironmentChange(option.value);
                }
                setOpenPanel(null);
              }}
            >
              <span className="toolbar-option-leading icon">
                <Layers3 size={15} />
              </span>
              <span className="toolbar-option-copy">
                <strong>{option.label}</strong>
                <small>{option.description || option.value}</small>
              </span>
              {option.value === props.environmentId ? <CheckCheck size={16} /> : null}
            </button>
          ))}
        </div>
      </div>

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
            <strong>{labelForLocale(activeTheme.label, props.locale)}</strong>
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
                  <strong>{labelForLocale(option.label, props.locale)}</strong>
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
