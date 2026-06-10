// 自动备份编排：on-change（修改后备份）与 scheduled（定时备份）。
//
// 设计要点（见 plans/backup-strategy-trigger-fix.md）：
// - 指纹去重：只看核心配置（config/profiles/mcp），排除 panel UI 视图态，
//   避免折叠侧边栏/切主题/切标签页这类纯 UI 操作触发备份。
// - 会话基线：loadState 后设基线，避免启动即备份；scheduled 在到期时补做。
// - 静默：自动备份失败只 console.error，不打断用户。
import {
  buildConfigDocument,
  buildProfilesDocument,
  normalizeStatePaths,
} from "@shared/configStore";
import { buildMcpConfigDocument } from "@shared/mcpStore";
import type { AppState, BackupFrequency } from "@shared/types";

import { getApi } from "./appHelpers";

// ── 纯函数 ──

/**
 * 核心配置指纹：拼接 config.toml + profiles + mcp 文档。
 * 不含 panel 设置——UI 视图态（activeTab/sidebar_collapsed/主题等）变化不应触发备份。
 */
export function computeConfigFingerprint(state: AppState): string {
  const s = normalizeStatePaths(state);
  return [
    buildConfigDocument(s),
    buildProfilesDocument(s),
    buildMcpConfigDocument(s.mcpConfig),
  ].join("\n---\n");
}

/** 定时备份周期（毫秒）。 */
export function backupIntervalMs(freq: BackupFrequency): number {
  switch (freq) {
    case "hourly":
      return 60 * 60 * 1000;
    case "weekly":
      return 7 * 24 * 60 * 60 * 1000;
    case "daily":
    default:
      return 24 * 60 * 60 * 1000;
  }
}

/** 是否到期需要执行定时备份。lastAt 为 null（从未备份）则总是需要。 */
export function shouldRunScheduled(now: number, lastAt: number | null, freq: BackupFrequency): boolean {
  if (lastAt == null) return true;
  return now - lastAt >= backupIntervalMs(freq);
}

/**
 * 从备份目录名解析时间戳（epoch ms）。
 * 名称格式：backup-YYYYMMDD-HHMMSS-mmm-host
 * 解析失败返回 null。
 */
export function parseBackupStampFromName(name: string): number | null {
  const m = /^backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})-/.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, ms] = m;
  const date = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
    Number(ms),
  );
  const t = date.getTime();
  return Number.isNaN(t) ? null : t;
}

// ── 会话状态 ──

let lastFingerprint: string | null = null;
let lastBackupAt: number | null = null;

/**
 * 设置会话基线（loadState 成功后调用）。
 * 指纹取当前配置；lastBackupAt 从最近一次备份名解析。
 */
export async function initBackupBaseline(state: AppState): Promise<void> {
  lastFingerprint = computeConfigFingerprint(state);
  lastBackupAt = await resolveLastBackupAt(state);
}

async function resolveLastBackupAt(state: AppState): Promise<number | null> {
  const api = getApi();
  if (!api || typeof api.listBackups !== "function") return null;
  try {
    const records = await api.listBackups(state);
    let latest: number | null = null;
    for (const record of records) {
      const t = parseBackupStampFromName(record.name);
      if (t != null && (latest == null || t > latest)) latest = t;
    }
    return latest;
  } catch (err) {
    console.error("[backupAuto] resolveLastBackupAt failed:", err);
    return null;
  }
}

async function runAutoBackup(state: AppState, trigger: "on-change" | "scheduled"): Promise<void> {
  const api = getApi();
  if (!api || typeof api.runBackup !== "function") return;
  try {
    await api.runBackup(state, trigger);
    lastFingerprint = computeConfigFingerprint(state);
    lastBackupAt = Date.now();
  } catch (err) {
    console.error(`[backupAuto] ${trigger} backup failed:`, err);
  }
}

/**
 * 保存成功后调用。strategy==="on-change" 且核心配置指纹变化时静默备份。
 * 指纹去重使纯 UI 操作路径（切主题/折叠侧边栏）成为 no-op。
 */
export async function maybeBackupAfterSave(state: AppState): Promise<void> {
  if (state.panelSettings.backup_strategy !== "on-change") return;
  const fingerprint = computeConfigFingerprint(state);
  if (fingerprint === lastFingerprint) return;
  await runAutoBackup(state, "on-change");
}

/**
 * 定时检查（loadState 后 + 定时器周期）。strategy==="scheduled" 且到期时备份。
 * 同样以指纹去重：配置自上次备份未变则跳过，避免空转堆备份。
 */
export async function maybeRunScheduledBackup(state: AppState): Promise<void> {
  if (state.panelSettings.backup_strategy !== "scheduled") return;
  if (!shouldRunScheduled(Date.now(), lastBackupAt, state.panelSettings.backup_frequency)) return;
  const fingerprint = computeConfigFingerprint(state);
  if (lastBackupAt != null && fingerprint === lastFingerprint) {
    // 配置自上次备份无变化：刷新时间锚点，跳过空备份。
    lastBackupAt = Date.now();
    return;
  }
  await runAutoBackup(state, "scheduled");
}

/** 测试用：重置会话状态。 */
export function __resetBackupAutoStateForTests(): void {
  lastFingerprint = null;
  lastBackupAt = null;
}
