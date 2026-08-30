import type { BackupDestinationType, BackupRecord } from "@shared/types";

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
