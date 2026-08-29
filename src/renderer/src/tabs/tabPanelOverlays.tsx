import { useState } from "react";
import { createPortal } from "react-dom";
import { Plus, RotateCcw, X } from "lucide-react";

import type { AppState, ConfigDoctorReport, KimiCodeEnvironment, Locale } from "@shared/types";

import { CompactSelect, Field } from "../formControls";
import { t } from "../i18n";
import { getHistory, restoreHistoryEntry } from "../historyManager";
import {
  DoctorDriftList,
  formatMessage,
} from "../tabComponents";

export type CreateEnvironmentDraft = {
  id: string;
  name: string;
  description: string;
  sourceEnvironmentId: string;
};

export function DoctorReportPanel(props: {
  locale: Locale;
  report: ConfigDoctorReport | null;
}): JSX.Element {
  const report = props.report;
  if (!report) {
    return (
      <div className="doctor-panel">
        <div className="doctor-summary muted">
          <strong>{t(props.locale, "doctorNotRun")}</strong>
          <span>{t(props.locale, "doctorNotRunHint")}</span>
        </div>
      </div>
    );
  }

  const visibleIssues = report.issues.slice(0, 8);
  return (
    <div className="doctor-panel">
      <div className={report.ok ? "doctor-summary ok" : "doctor-summary warning"}>
        <strong>
          {report.ok ? t(props.locale, "doctorStatusOk") : t(props.locale, "doctorStatusNeedsAttention")}
        </strong>
        <span>
          {formatMessage(t(props.locale, "doctorSummary"), {
            errors: report.errorCount,
            warnings: report.warningCount,
            infos: report.infoCount,
          })}
        </span>
      </div>
      {visibleIssues.length ? (
        <div className="doctor-issues">
          {visibleIssues.map((issue) => (
            <div key={issue.id} className={`doctor-issue ${issue.severity}`}>
              <span>{issue.severity}</span>
              <div>
                <strong>{issue.scope}</strong>
                <p>{issue.message}</p>
                {issue.suggestedAction ? <em>{issue.suggestedAction}</em> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <DoctorDriftList locale={props.locale} drift={report.drift} />
    </div>
  );
}

export function FullBackupImportDialog(props: {
  locale: Locale;
  envCount: number;
  hasRedactedSecrets: boolean;
  isImporting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  const { locale, envCount, hasRedactedSecrets, isImporting, onConfirm, onCancel } = props;
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog import-preview-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{t(locale, "fullBackupImportTitle")}</h3>
          <button className="icon-button" type="button" onClick={onCancel} aria-label={t(locale, "close")}>
            <X size={16} />
          </button>
        </div>
        <div className="dialog-body import-preview-body">
          <div className="import-preview-warning" role="alert">
            {formatMessage(t(locale, "fullBackupImportWarning"), { count: envCount })}
          </div>
          {hasRedactedSecrets ? (
            <div className="import-preview-warning" role="alert">{t(locale, "importRedactedWarning")}</div>
          ) : null}
        </div>
        <div className="dialog-footer">
          <button className="action-button secondary" type="button" onClick={onCancel} disabled={isImporting}>
            {t(locale, "cancel")}
          </button>
          <button className="action-button primary" type="button" onClick={onConfirm} disabled={isImporting}>
            {isImporting ? t(locale, "fullBackupImporting") : t(locale, "importConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CreateKimiCodeEnvironmentDialog(props: {
  locale: Locale;
  environments: KimiCodeEnvironment[];
  draft: CreateEnvironmentDraft;
  onChange: (draft: CreateEnvironmentDraft) => void;
  onCancel: () => void;
  onCreate: (draft: CreateEnvironmentDraft) => void;
}): JSX.Element {
  const { locale, environments, draft, onChange, onCancel, onCreate } = props;
  const titleId = "create-kimi-environment-title";
  const copyOptions = [
    { value: "", label: t(locale, "kimiCodeEnvironmentCopyNone") },
    ...environments.map((environment) => ({
      value: environment.id,
      label: environment.name || environment.id,
    })),
  ];
  return createPortal(
    <div className="dialog-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <div className="dialog create-environment-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dialog-header">
          <h3 id={titleId}>{t(locale, "kimiCodeEnvironmentCreateTitle")}</h3>
          <button className="icon-button" type="button" aria-label={t(locale, "close")} title={t(locale, "close")} onClick={onCancel}>
            <X size={16} />
          </button>
        </div>
        <div className="dialog-body create-environment-body">
          <p>{t(locale, "kimiCodeEnvironmentCreateDescription")}</p>
          <div className="field">
            <span>{t(locale, "kimiCodeEnvironmentIdentifier")}</span>
            <code className="environment-id-preview">{draft.id}</code>
          </div>
          <Field
            label={t(locale, "kimiCodeEnvironmentName")}
            value={draft.name}
            onChange={(value) => onChange({ ...draft, name: value })}
          />
          <div className="field">
            <span>{t(locale, "kimiCodeEnvironmentCopyFrom")}</span>
            <CompactSelect
              ariaLabel={t(locale, "kimiCodeEnvironmentCopyFrom")}
              value={draft.sourceEnvironmentId}
              options={copyOptions}
              onChange={(value) => onChange({ ...draft, sourceEnvironmentId: value })}
            />
          </div>
          <Field
            label={t(locale, "kimiCodeEnvironmentDescription")}
            value={draft.description}
            onChange={(value) => onChange({ ...draft, description: value })}
          />
        </div>
        <div className="dialog-footer">
          <button className="action-button compact secondary" type="button" onClick={onCancel}>
            {t(locale, "cancel")}
          </button>
          <button className="action-button compact" type="button" onClick={() => onCreate(draft)}>
            <Plus size={13} />
            <span>{t(locale, "kimiCodeEnvironmentCreate")}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function HistoryPanel(props: {
  locale: Locale;
  state: AppState;
  updateState: (updater: (draft: AppState) => void, options?: { persist?: boolean; recordHistory?: boolean; historySummary?: string }) => void;
}): JSX.Element {
  const [, forceUpdate] = useState(0);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const history = getHistory(props.state);

  const handleUndo = (entryId: string): void => {
    const previous = restoreHistoryEntry(entryId);
    if (previous) {
      props.updateState((draft) => {
        Object.assign(draft, previous);
      }, { persist: true, recordHistory: false });
      setExpandedEntryId(null);
      forceUpdate((n) => n + 1);
    }
  };

  if (history.length === 0) {
    return <div className="command-palette-empty">{t(props.locale, "historyNoHistory")}</div>;
  }

  return (
    <div className="history-panel">
      {history.map((entry) => (
        <div key={entry.id} className="history-entry">
          <div className="history-entry-main">
            <button
              type="button"
              className="history-entry-info"
              onClick={() => setExpandedEntryId((current) => current === entry.id ? null : entry.id)}
              aria-expanded={expandedEntryId === entry.id}
            >
              <span className="history-entry-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span className="history-entry-summary">{entry.summary}</span>
              <span className="history-entry-count">
                {formatMessage(t(props.locale, "historyChangesCount"), {
                  count: entry.details.reduce((total, detail) => total + detail.changeCount, 0),
                })}
              </span>
              <span className="history-entry-view">
                {expandedEntryId === entry.id ? t(props.locale, "historyHideDetails") : t(props.locale, "historyViewDetails")}
              </span>
            </button>
            <button type="button" className="action-button compact" onClick={() => handleUndo(entry.id)}>
              <RotateCcw size={14} />
              <span>{t(props.locale, "historyUndo")}</span>
            </button>
          </div>
          {expandedEntryId === entry.id ? (
            <div className="history-entry-details">
              {entry.details.length > 0 ? entry.details.map((detail) => (
                <section className="history-detail" key={detail.id}>
                  <div className="history-detail-title">
                    <span>{detail.title}</span>
                    <small>
                      {formatMessage(t(props.locale, "historyChangesCount"), { count: detail.changeCount })}
                    </small>
                  </div>
                  <div className="history-detail-diff" role="table" aria-label={detail.title}>
                    {renderHistoryDiffLines(detail.diff)}
                  </div>
                </section>
              )) : (
                <div className="command-palette-empty">{t(props.locale, "historyNoDetails")}</div>
              )}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function renderHistoryDiffLines(diff: string): JSX.Element[] {
  return (diff ? diff.split("\n") : []).map((line, index) => {
    const kind = line.startsWith("+ ")
      ? "added"
      : line.startsWith("- ")
        ? "removed"
        : "context";
    const marker = kind === "added" ? "+" : kind === "removed" ? "-" : "";
    const content = line.startsWith("+ ") || line.startsWith("- ") || line.startsWith("  ")
      ? line.slice(2)
      : line;
    return (
      <div className={`history-diff-line ${kind}`} role="row" key={`${index}-${line}`}>
        <span className="history-diff-gutter" role="cell">{marker}</span>
        <code className="history-diff-code" role="cell">{content || " "}</code>
      </div>
    );
  });
}
