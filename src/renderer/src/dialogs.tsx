import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, History, LoaderCircle, Save, Trash2, X } from "lucide-react";

import type { BackupDestinationType, BackupRecord, Locale } from "@shared/types";

import { CodePanel } from "./codePanel";
import { t } from "./i18n";

export type ConfirmDialogTone = "primary" | "danger";
export type ConfirmDialogKind = "save" | "delete";

export interface ConfirmDialogState {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: ConfirmDialogTone;
  kind: ConfirmDialogKind;
}

export interface DocumentViewerState {
  title: string;
  format: "TOML" | "JSON";
  content: string;
}

export interface BackupRecordsDialogState {
  destinationType: BackupDestinationType;
  records: BackupRecord[];
  isLoading: boolean;
  errorMessage: string;
  deletingName?: string;
  restoringName?: string;
}

function useDialogEscape(onClose: () => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}

function parseBackupDisplayDate(value: string): Date | null {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const match = /^backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})(?:-.+)?$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second, millisecond] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond),
  );
}

function formatBackupDisplayDate(value: string): string {
  const parsed = parseBackupDisplayDate(value);
  if (!parsed) {
    return value;
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function ConfirmDialog(
  props: ConfirmDialogState & {
    onConfirm: () => void;
    onCancel: () => void;
  },
): JSX.Element {
  const Icon = props.kind === "delete" ? Trash2 : Save;

  return createPortal(
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onCancel();
        }
      }}
    >
      <section className="confirm-dialog glass-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="confirm-dialog-header">
          <div className={props.tone === "danger" ? "confirm-dialog-icon danger" : "confirm-dialog-icon"}>
            <Icon size={20} />
          </div>
          <div className="confirm-dialog-copy">
            <h3 id="confirm-dialog-title">{props.title}</h3>
            {props.description ? <p>{props.description}</p> : null}
          </div>
        </div>
        <div className="confirm-dialog-actions">
          <button className="action-button" type="button" onClick={props.onCancel}>
            {props.cancelLabel}
          </button>
          <button
            className={
              props.tone === "danger"
                ? "action-button confirm-dialog-confirm danger"
                : "action-button action-button-primary confirm-dialog-confirm"
            }
            type="button"
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function DocumentViewerDialog(
  props: DocumentViewerState & {
    locale: Locale;
    onClose: () => void;
  },
): JSX.Element {
  const [copied, setCopied] = useState(false);

  useDialogEscape(props.onClose);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(props.content).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return createPortal(
    <div
      className="document-viewer-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <section className="document-viewer glass-panel" role="dialog" aria-modal="true" aria-labelledby="document-viewer-title">
        <div className="document-viewer-header">
          <div className="document-viewer-title">
            <div className="document-viewer-icon">
              <FileText size={18} />
            </div>
            <div>
              <h3 id="document-viewer-title">{props.title}</h3>
              <p>{props.format}</p>
            </div>
          </div>
          <div className="document-viewer-actions">
            <button className="action-button compact icon-only" type="button" aria-label="Close" onClick={props.onClose}>
              <X size={16} />
            </button>
          </div>
        </div>
        <CodePanel
          title={props.format}
          content={props.content}
          onCopy={handleCopy}
          copied={copied}
        />
      </section>
    </div>,
    document.body,
  );
}

export function BackupRecordsDialog(
  props: BackupRecordsDialogState & {
    locale: Locale;
    onDelete: (record: BackupRecord) => void;
    onRestore: (record: BackupRecord) => void;
    onClose: () => void;
  },
): JSX.Element {
  const sourceLabel =
    props.destinationType === "webdav"
      ? t(props.locale, "backupRecordsSourceWebdav")
      : t(props.locale, "backupRecordsSourceLocal");

  useDialogEscape(props.onClose);

  return createPortal(
    <div
      className="backup-records-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <section className="backup-records-dialog glass-panel" role="dialog" aria-modal="true" aria-labelledby="backup-records-title">
        <div className="backup-records-header">
          <div className="backup-records-title">
            <div className="backup-records-icon">
              <History size={18} />
            </div>
            <div>
              <h3 id="backup-records-title">{t(props.locale, "backupRecordsTitle")}</h3>
              <p>{sourceLabel}</p>
            </div>
          </div>
          <button className="action-button compact icon-only" type="button" aria-label={t(props.locale, "cancel")} onClick={props.onClose}>
            <X size={16} />
          </button>
        </div>
        {props.isLoading ? (
          <div className="backup-records-empty">
            <LoaderCircle size={18} className="button-spinner" />
            <span>{t(props.locale, "backupRecordsLoading")}</span>
          </div>
        ) : props.errorMessage ? (
          <div className="backup-records-empty is-error">
            <span>{props.errorMessage}</span>
          </div>
        ) : props.records.length ? (
          <div className="backup-records-list">
            <div className="backup-records-table-head">
              <span>{t(props.locale, "backupRecordsPath")}</span>
              <span>{t(props.locale, "backupRecordsCreatedAt")}</span>
              <span>{t(props.locale, "backupRecordsItems")}</span>
            </div>
            {props.records.map((record) => (
              <article key={`${record.name}-${record.path}`} className="backup-record-card">
                <div className="backup-record-meta">
                  <div>
                    <span>{record.name}</span>
                  </div>
                  <div>
                    <span>{formatBackupDisplayDate(record.createdAt)}</span>
                  </div>
                  <div className="backup-record-action-cell">
                    <div className="backup-record-actions">
                      <button
                        className={
                          props.restoringName === record.name
                            ? "action-button compact is-loading"
                            : "action-button compact"
                        }
                        type="button"
                        disabled={
                          props.restoringName === record.name || props.deletingName === record.name
                        }
                        onClick={() => props.onRestore(record)}
                      >
                        {props.restoringName === record.name ? (
                          <LoaderCircle size={16} className="button-spinner" />
                        ) : null}
                        <span>
                          {props.restoringName === record.name
                            ? t(props.locale, "backupRestoring")
                            : t(props.locale, "restore")}
                        </span>
                      </button>
                      <button
                        className={props.deletingName === record.name ? "action-button compact danger is-loading" : "action-button compact danger"}
                        type="button"
                        disabled={
                          props.deletingName === record.name || props.restoringName === record.name
                        }
                        onClick={() => props.onDelete(record)}
                      >
                        {props.deletingName === record.name ? <LoaderCircle size={16} className="button-spinner" /> : null}
                        <span>{t(props.locale, "delete")}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="backup-records-empty">
            <span>{t(props.locale, "backupRecordsEmpty")}</span>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
