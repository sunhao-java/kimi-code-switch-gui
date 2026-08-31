import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";

import { searchConfig } from "@shared/configStore";
import type { SearchResult } from "@shared/configStore";
import type { AppState, Locale } from "@shared/types";

import { t } from "./i18n";
import "./commandPalette.css";

interface CommandPaletteProps {
  state: AppState;
  locale: Locale;
  onSelect: (result: SearchResult) => void;
  onClose: () => void;
}

export function CommandPalette({ state, locale, onSelect, onClose }: CommandPaletteProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = searchConfig(state, query);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setSelectedIndex(0); }, [query]);

  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent): void => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          event.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          event.preventDefault();
          if (results[selectedIndex]) onSelect(results[selectedIndex]);
          break;
        case "Escape":
          event.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, onSelect, onClose],
  );

  const typeLabel = (type: SearchResult["type"]): string => {
    const map: Record<string, string> = {
      provider: t(locale, "searchProviders"),
      model: t(locale, "searchModels"),
      profile: t(locale, "searchProfiles"),
      mcp: t(locale, "searchMcp"),
    };
    return map[type] ?? type;
  };

  return createPortal(
    <div className="command-palette-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label={t(locale, "searchPlaceholder")} onKeyDown={handleKeyDown}>
        <div className="command-palette-input-row">
          <Search size={18} className="command-palette-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder={t(locale, "searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t(locale, "searchPlaceholder")}
          />
          <button type="button" className="command-palette-close" onClick={onClose} aria-label={t(locale, "close")}>
            <X size={14} />
          </button>
        </div>
        <div className={query.trim() ? "command-palette-results" : "command-palette-results is-idle"} ref={listRef} role="listbox">
          {query.trim() && results.length === 0 ? (
            <div className="command-palette-empty">{t(locale, "searchNoResults")}</div>
          ) : null}
          {results.map((result, index) => (
            <button
              key={`${result.type}-${result.name}`}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={index === selectedIndex ? "command-palette-item selected" : "command-palette-item"}
              onClick={() => onSelect(result)}
            >
              <span className="command-palette-item-badge">{typeLabel(result.type)}</span>
              <span className="command-palette-item-name">{result.name}</span>
              {result.subtitle ? <span className="command-palette-item-subtitle">{result.subtitle}</span> : null}
            </button>
          ))}
        </div>
        <div className="command-palette-hint">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t(locale, "navigate")}</span>
          <span><kbd>Enter</kbd> {t(locale, "open")}</span>
          <span><kbd>Esc</kbd> {t(locale, "close")}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
