import { invoke } from "@tauri-apps/api/core";

import type {
  OfficialAccount,
  OfficialAccountCredentialsStatus,
  OfficialAccountOperationResult,
} from "@shared/types";

export function initOfficialAccountsStore(): Promise<void> {
  return invoke("init_official_accounts_store");
}

export function listOfficialAccounts(): Promise<OfficialAccount[]> {
  return invoke<OfficialAccount[]>("list_official_accounts");
}

export function getOfficialAccountCredentialsStatus(): Promise<OfficialAccountCredentialsStatus> {
  return invoke<OfficialAccountCredentialsStatus>("get_official_account_credentials_status");
}

export function createOfficialAccount(displayName: string): Promise<OfficialAccount> {
  return invoke<OfficialAccount>("create_official_account", { displayName });
}

export function renameOfficialAccount(id: string, displayName: string): Promise<OfficialAccount> {
  return invoke<OfficialAccount>("rename_official_account", { id, displayName });
}

export function captureCurrentOfficialAccount(displayName: string): Promise<OfficialAccountOperationResult> {
  return invoke<OfficialAccountOperationResult>("capture_current_official_account", { displayName });
}

export function prepareOfficialAccountLogin(id: string): Promise<OfficialAccountOperationResult> {
  return invoke<OfficialAccountOperationResult>("prepare_official_account_login", { id });
}

export function completeOfficialAccountLogin(id: string, activate = true): Promise<OfficialAccountOperationResult> {
  return invoke<OfficialAccountOperationResult>("complete_official_account_login", { id, activate });
}

export function activateOfficialAccount(id: string): Promise<OfficialAccountOperationResult> {
  return invoke<OfficialAccountOperationResult>("activate_official_account", { id });
}

export function deleteOfficialAccount(id: string): Promise<void> {
  return invoke("delete_official_account", { id });
}
