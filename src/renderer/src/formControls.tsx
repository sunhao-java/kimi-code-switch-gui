import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronDown, Globe, Plus, X } from "lucide-react";

import type { Locale, UiFontSize } from "@shared/types";

import { t } from "./i18n";

export function SettingsGroup(props: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="settings-group">
      <div className="settings-group-header">
        <div className="settings-group-title">
          <span className="settings-group-dot" aria-hidden="true" />
          <span>{props.title}</span>
        </div>
        <div className="settings-group-rule" aria-hidden="true" />
      </div>
      <div className="settings-group-body">{props.children}</div>
    </section>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: string;
}): JSX.Element {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input inputMode={props.inputMode} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

export function TextAreaField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}): JSX.Element {
  return (
    <label className="field">
      <span>{props.label}</span>
      <textarea
        rows={4}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

export function KeyValueListField(props: {
  locale: Locale;
  label: string;
  value: Record<string, string>;
  addLabel: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
  onChange: (value: Record<string, string>) => void;
}): JSX.Element {
  const [rows, setRows] = useState(() => toRecordEntries(props.value));
  const serializedValue = JSON.stringify(props.value);

  useEffect(() => {
    setRows(toRecordEntries(props.value));
  }, [serializedValue]);

  const updateRow = (rowId: string, patch: Partial<{ key: string; value: string }>): void => {
    const nextRows = rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row));
    setRows(nextRows);
    props.onChange(fromRecordEntries(nextRows));
  };

  const removeRow = (rowId: string): void => {
    const nextRows = rows.filter((row) => row.id !== rowId);
    setRows(nextRows.length ? nextRows : [{ id: `new-${Date.now()}`, key: "", value: "" }]);
    props.onChange(fromRecordEntries(nextRows));
  };

  const addRow = (): void => {
    setRows([...rows, { id: `new-${Date.now()}`, key: "", value: "" }]);
  };

  return (
    <div className="field">
      <span>{props.label}</span>
      <div className="key-value-list">
        {rows.map((row) => (
          <div key={row.id} className="key-value-row">
            <input
              value={row.key}
              placeholder={props.keyPlaceholder}
              onChange={(event) => updateRow(row.id, { key: event.target.value })}
            />
            <input
              value={row.value}
              placeholder={props.valuePlaceholder}
              onChange={(event) => updateRow(row.id, { value: event.target.value })}
            />
            <button
              className="key-value-remove"
              type="button"
              aria-label={t(props.locale, "delete")}
              title={t(props.locale, "delete")}
              onClick={() => removeRow(row.id)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button className="action-button compact key-value-add" type="button" onClick={addRow}>
          <Plus size={14} />
          <span>{props.addLabel}</span>
        </button>
      </div>
    </div>
  );
}

export function ReadOnlyField(props: { label: string; value: string }): JSX.Element {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input value={props.value} readOnly disabled className="field-input-disabled" />
    </label>
  );
}

export function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; icon?: typeof Globe; badge?: string; badgeClassName?: string }>;
  selectedIcon?: typeof Globe;
  popoverClassName?: string;
}): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = props.options.find((option) => option.value === props.value) ?? props.options[0];
  const SelectedIcon = props.selectedIcon ?? selectedOption?.icon;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="field" ref={rootRef}>
      <span>{props.label}</span>
      <div className={isOpen ? "field-select-shell is-open" : "field-select-shell"}>
        <button
          className="field-select-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          {SelectedIcon ? (
            <span className="field-select-leading icon" aria-hidden="true">
              <SelectedIcon size={15} />
            </span>
          ) : selectedOption?.badge ? (
            <span className={["field-select-leading", "badge", selectedOption.badgeClassName].filter(Boolean).join(" ")} aria-hidden="true">
              {selectedOption.badge}
            </span>
          ) : null}
          <span className="field-select-value">{selectedOption?.label ?? props.value}</span>
          <span className="field-select-icon" aria-hidden="true">
            <ChevronDown size={16} />
          </span>
        </button>
        <div
          className={["field-select-popover", props.popoverClassName].filter(Boolean).join(" ")}
          role="listbox"
          aria-label={props.label}
        >
          {props.options.map((option) => (
            <button
              key={option.value}
              className={option.value === props.value ? "field-select-option active" : "field-select-option"}
              type="button"
              role="option"
              aria-selected={option.value === props.value}
              onClick={() => {
                props.onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.icon ? (
                <span className="field-select-option-leading icon" aria-hidden="true">
                  <option.icon size={15} />
                </span>
              ) : option.badge ? (
                <span className={["field-select-option-leading", "badge", option.badgeClassName].filter(Boolean).join(" ")} aria-hidden="true">
                  {option.badge}
                </span>
              ) : null}
              <span className="field-select-option-copy">{option.label}</span>
              {option.value === props.value ? <Check size={16} /> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FontSizeSliderField(props: {
  locale: Locale;
  label: string;
  value: UiFontSize;
  options: Array<{
    value: UiFontSize;
    label: Record<Locale, string>;
    fontSize: string;
  }>;
  onChange: (value: UiFontSize) => void;
}): JSX.Element {
  const options = props.options;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === props.value),
  );
  const progress =
    options.length > 1 ? (selectedIndex / (options.length - 1)) * 100 : 0;

  return (
    <div className="field font-size-field">
      <span>{props.label}</span>
      <div
        className="font-size-slider-shell"
        style={{ ["--font-slider-progress" as string]: `${progress}%` }}
      >
        <div className="font-size-slider-control">
          <input
            className="font-size-slider-input"
            type="range"
            min={0}
            max={options.length - 1}
            step={1}
            value={selectedIndex}
            aria-label={props.label}
            onChange={(event) => {
              const nextIndex = Number(event.target.value);
              props.onChange(options[nextIndex]?.value ?? "standard");
            }}
          />
          <div className="font-size-slider-labels" aria-hidden="true">
            {options.map((option) => (
              <span
                key={option.value}
                className={option.value === props.value ? "is-active" : undefined}
              >
                {option.label[props.locale]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MultiSelectField(props: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: Array<{ value: string; label: string }>;
  emptyLabel: string;
  popoverClassName?: string;
}): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedValues = props.options.filter((option) => props.value.includes(option.value));
  const summary = selectedValues.length
    ? selectedValues.map((option) => option.label).join(", ")
    : props.emptyLabel;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="field" ref={rootRef}>
      <span>{props.label}</span>
      <div className={isOpen ? "field-select-shell is-open" : "field-select-shell"}>
        <button
          className="field-select-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className={selectedValues.length ? "field-select-value" : "field-select-value field-select-placeholder"}>
            {summary}
          </span>
          <span className="field-select-icon" aria-hidden="true">
            <ChevronDown size={16} />
          </span>
        </button>
        <div
          className={["field-select-popover", props.popoverClassName].filter(Boolean).join(" ")}
          role="listbox"
          aria-label={props.label}
          aria-multiselectable="true"
        >
          {props.options.map((option) => {
            const isSelected = props.value.includes(option.value);
            return (
              <button
                key={option.value}
                className={isSelected ? "field-select-option active" : "field-select-option"}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  const nextValues = isSelected
                    ? props.value.filter((value) => value !== option.value)
                    : [...props.value, option.value];
                  props.onChange(nextValues);
                }}
              >
                <span className="field-select-option-copy">{option.label}</span>
                {isSelected ? <Check size={16} /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Toggle(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }): JSX.Element {
  return (
    <label className="toggle-row">
      <span>{props.label}</span>
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
    </label>
  );
}

function toRecordEntries(value: Record<string, string>): Array<{ id: string; key: string; value: string }> {
  const entries = Object.entries(value).map(([key, entryValue], index) => ({
    id: `${key}-${index}`,
    key,
    value: entryValue,
  }));
  return entries.length ? entries : [{ id: "empty-0", key: "", value: "" }];
}

function fromRecordEntries(entries: Array<{ key: string; value: string }>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    if (!key) {
      continue;
    }
    result[key] = entry.value;
  }
  return result;
}
