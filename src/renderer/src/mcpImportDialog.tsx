import { useRef } from "react";
import { X } from "lucide-react";

import type { Locale } from "@shared/types";

import { useDialogEscape, useFocusTrap } from "./dialogs";
import { t } from "./i18n";
import { ActionFooter } from "./formControls";

export function McpImportDialog(props: {
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
  onImport: () => void;
  onCancel: () => void;
}): JSX.Element {
  const dialogRef = useRef<HTMLElement>(null);

  useDialogEscape(props.onCancel);
  useFocusTrap(dialogRef);

  return (
    <div
      className="mcp-import-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onCancel();
        }
      }}
    >
      <section ref={dialogRef} className="glass-panel form-panel mcp-import-dialog" role="dialog" aria-modal="true" aria-labelledby="mcp-import-title">
        <div className="mcp-import-header">
          <div>
            <div className="section-title" id="mcp-import-title">{t(props.locale, "importMcpJson")}</div>
            <p className="mcp-import-hint">{t(props.locale, "mcpImportHint")}</p>
          </div>
          <button className="action-button compact icon-only" type="button" aria-label={t(props.locale, "cancel")} onClick={props.onCancel}>
            <X size={16} />
          </button>
        </div>
        <label className="field">
          <span>{t(props.locale, "pasteMcpJson")}</span>
          <textarea
            className="mcp-import-textarea"
            rows={12}
            value={props.value}
            placeholder={t(props.locale, "mcpImportPlaceholder")}
            onChange={(event) => props.onChange(event.target.value)}
          />
        </label>
        <ActionFooter
          onSave={props.onImport}
          onCancel={props.onCancel}
          saveLabel={t(props.locale, "mcpImportApply")}
          cancelLabel={t(props.locale, "mcpImportCancel")}
        />
      </section>
    </div>
  );
}
