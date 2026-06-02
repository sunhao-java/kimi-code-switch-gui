import { useEffect, useState } from "react";
import { Activity, AlertCircle, BarChart3, CheckCircle2, Clock, Cpu, Database, HardDrive, LineChart, PieChart as PieIcon, Power, Table as TableIcon, Terminal, TrendingUp, User, Zap } from "lucide-react";
import type { Locale } from "@shared/types";
import type { InsightsSettings } from "@shared/usageTypes";
import { t } from "./i18n";
import { SettingsGroup } from "./formControls";
import { ToastContainer } from "./Toast";
import { useToast } from "./useToast";
import { TrendChart, type TrendChartType } from "./insightsChart";
import { PieChart, type PieDatum } from "./insightsPieChart";
import "./insights.css";

const UI_PREFS_KEY = "kimi-insights-ui-prefs-v1";

type InsightsTab = "overview" | "trend" | "breakdown" | "sessions";
type TrendMetric = "tokens" | "calls";
type BreakdownView = "table" | "pie";
type TimeRangeMode = "preset" | "custom";

interface InsightsUiPrefs {
  activeTab: InsightsTab;
  timeRangeKey: string;
  timeRangeMode: TimeRangeMode;
  customFrom: string;
  customTo: string;
  trendMetric: TrendMetric;
  trendChartType: TrendChartType;
  breakdownModelView: BreakdownView;
  breakdownProfileView: BreakdownView;
}

const DEFAULT_UI_PREFS: InsightsUiPrefs = {
  activeTab: "overview",
  timeRangeKey: "7d",
  timeRangeMode: "preset",
  customFrom: "",
  customTo: "",
  trendMetric: "tokens",
  trendChartType: "bar",
  breakdownModelView: "pie",
  breakdownProfileView: "pie",
};

function loadUiPrefs(): InsightsUiPrefs {
  try {
    const raw = window.localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return DEFAULT_UI_PREFS;
    const parsed = JSON.parse(raw) as Partial<InsightsUiPrefs>;
    return { ...DEFAULT_UI_PREFS, ...parsed };
  } catch {
    return DEFAULT_UI_PREFS;
  }
}

function saveUiPrefs(prefs: InsightsUiPrefs): void {
  try {
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* localStorage quota or disabled */
  }
}

interface FirstRunDialogProps {
  locale: Locale;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FirstRunDialog({ locale, onConfirm, onCancel }: FirstRunDialogProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="glass-panel w-[600px] p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
            <TrendingUp size={24} className="text-white" />
          </div>
          <h2 className="text-2xl font-semibold">{t(locale, "insightsFirstRunTitle")}</h2>
        </div>
        <p className="mb-6 text-gray-700 dark:text-gray-300">
          {t(locale, "insightsFirstRunDescription")}
        </p>
        <div className="mb-6 space-y-3 rounded-xl bg-gray-50/50 p-4 dark:bg-gray-800/30">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-start gap-3 transition-all hover:translate-x-1">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-xs font-bold text-white shadow-sm">
                {step}
              </div>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {t(locale, `insightsFirstRunStep${step}` as never)}
              </p>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="insights-button-secondary">
            {t(locale, "insightsFirstRunCancel")}
          </button>
          <button onClick={onConfirm} className="insights-button-primary">
            {t(locale, "insightsFirstRunConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface InsightsSettingsPanelProps {
  locale: Locale;
  onStateChange?: () => void;
}

/**
 * 洞察设置面板（位于设置页内）
 * 仅包含：启用/禁用开关、代理状态、存储信息、配置选项
 * 完整的图表分析面板见 InsightsDashboard 独立 Tab
 */
export function InsightsSettingsPanel({ locale, onStateChange }: InsightsSettingsPanelProps): JSX.Element {
  const [settings, setSettings] = useState<InsightsSettings | null>(null);
  const [watcherStatus, setWatcherStatus] = useState<{ status: string; sessionsTracked?: number; eventsIngested?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ totalBytes: number; exceedsWarn: boolean } | null>(null);
  const { toasts, showToast, removeToast } = useToast();

  const loadStatus = async (): Promise<void> => {
    try {
      const result = await window.kimiSwitch.usageGetStatus();
      if (result.ok) {
        setSettings(result.settings);
        setWatcherStatus(result.proxy);
      }
    } catch (err) {
      console.error("Failed to load insights status:", err);
    }
  };

  const loadStorage = async (): Promise<void> => {
    try {
      const result = await window.kimiSwitch.usageGetStorageInfo();
      if (result.ok) {
        setStorageInfo(result.info);
      }
    } catch (err) {
      console.error("Failed to load storage info:", err);
    }
  };

  useEffect(() => {
    void loadStatus();
    void loadStorage();
  }, []);

  const handleEnable = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await window.kimiSwitch.usageEnable();
      if (result.ok) {
        await loadStatus();
        onStateChange?.();
        showToast("用量洞察已启用", "success");
      } else {
        showToast(`启用失败: ${result.message}`, "error");
      }
    } catch (err) {
      showToast(`启用失败: ${String(err)}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await window.kimiSwitch.usageDisable();
      if (result.ok) {
        await loadStatus();
        onStateChange?.();
        showToast("用量洞察已禁用", "info");
      }
    } catch (err) {
      showToast(`禁用失败: ${String(err)}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResetData = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await window.kimiSwitch.usageResetAllData();
      if (result.ok) {
        await loadStatus();
        await loadStorage();
        showToast("所有洞察数据已清除", "success");
      }
    } catch (err) {
      showToast(`清除失败: ${String(err)}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const status = settings?.insights_status ?? "disabled";
  const isEnabled = status === "enabled";

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="settings-tab-panel">
        {/* 状态概览 */}
        <SettingsGroup title={t(locale, "insightsStatus")}>
          <div className="insights-status-card">
            <div className="insights-status-header">
              <div className="insights-status-info">
                <div className={`insights-status-icon ${isEnabled ? "enabled" : "disabled"}`}>
                  {isEnabled ? <CheckCircle2 size={28} color="white" /> : <Power size={28} color="white" />}
                </div>
                <div className="insights-status-text">
                  <div className="insights-status-title">{t(locale, "insightsStatus")}</div>
                  <div className={`insights-status-label ${isEnabled ? "enabled" : "disabled"}`}>
                    <div className={`insights-status-indicator ${isEnabled ? "enabled" : "disabled"}`} />
                    {status === "enabled"
                      ? t(locale, "insightsEnabled")
                      : status === "paused"
                        ? t(locale, "insightsPaused")
                        : t(locale, "insightsDisabled")}
                  </div>
                </div>
              </div>
              <div className="insights-buttons-group">
                {!isEnabled && (
                  <button onClick={handleEnable} disabled={loading} className="insights-button-primary">
                    <Power size={16} />
                    {t(locale, "insightsEnable")}
                  </button>
                )}
                {isEnabled && (
                  <button onClick={handleDisable} disabled={loading} className="insights-button-danger">
                    <Power size={16} />
                    {t(locale, "insightsDisable")}
                  </button>
                )}
              </div>
            </div>

            {isEnabled && watcherStatus && (
              <div className="insights-metrics-grid">
                <div className="insights-metric-card">
                  <div className="insights-metric-label">
                    <Activity size={14} />
                    数据来源
                  </div>
                  <div className="insights-metric-value" style={{ fontSize: "0.875rem" }}>
                    ~/.kimi/logs/kimi.log
                  </div>
                </div>
                <div className="insights-metric-card">
                  <div className="insights-metric-label">
                    <Database size={14} />
                    已采集事件
                  </div>
                  <div className="insights-metric-value">{watcherStatus.eventsIngested ?? 0}</div>
                </div>
                <div className="insights-metric-card">
                  <div className="insights-metric-label">
                    <TrendingUp size={14} />
                    追踪会话
                  </div>
                  <div className="insights-metric-value">
                    {watcherStatus.sessionsTracked ?? 0}
                  </div>
                </div>
              </div>
            )}

            {isEnabled && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px 16px",
                  background: "rgba(var(--primary-rgb), 0.05)",
                  border: "1px solid rgba(var(--primary-rgb), 0.15)",
                  borderRadius: "12px",
                  fontSize: "0.875rem",
                  color: "var(--text)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <TrendingUp size={16} style={{ color: "rgba(var(--primary-rgb), 1)" }} />
                <span>查看图表统计、趋势分析、分组数据等：请进入侧边栏的"洞察"菜单。</span>
              </div>
            )}
          </div>
        </SettingsGroup>

        {/* 存储信息 */}
        <SettingsGroup title={t(locale, "insightsStorageInfo")}>
          <div className="glass-panel" style={{ borderRadius: "20px", overflow: "hidden" }}>
            <div className="insights-storage-grid">
              <div className="insights-storage-item">
                <div className="insights-storage-icon blue">
                  <Database size={24} color="white" />
                </div>
                <div className="insights-storage-label">{t(locale, "insightsStorageSqlite")}</div>
                <div className="insights-storage-value">
                  {storageInfo ? formatBytes(storageInfo.totalBytes * 0.3) : "0 B"}
                </div>
                <div className="insights-progress-bar">
                  <div
                    className="insights-progress-fill blue"
                    style={{
                      width: storageInfo
                        ? `${Math.min(((storageInfo.totalBytes * 0.3) / (100 * 1024 * 1024)) * 100, 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
              <div className="insights-storage-item">
                <div className="insights-storage-icon purple">
                  <HardDrive size={24} color="white" />
                </div>
                <div className="insights-storage-label">{t(locale, "insightsStorageTotal")}</div>
                <div className="insights-storage-value">
                  {storageInfo ? formatBytes(storageInfo.totalBytes) : "0 B"}
                </div>
                <div className="insights-progress-bar">
                  <div
                    className={`insights-progress-fill ${storageInfo?.exceedsWarn ? "warning" : "purple"}`}
                    style={{
                      width: storageInfo
                        ? `${Math.min((storageInfo.totalBytes / (100 * 1024 * 1024)) * 100, 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            </div>
            {storageInfo?.exceedsWarn && (
              <div className="insights-warning-banner">
                <AlertCircle size={20} color="#f97316" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "#f97316" }}>
                  {t(locale, "insightsStorageExceedsWarn")}
                </div>
              </div>
            )}
          </div>
        </SettingsGroup>

        {/* 配置选项 */}
        <SettingsGroup title="配置选项">
          <div className="insights-config-grid">
            <div className="insights-config-card blue">
              <div className="insights-config-label">{t(locale, "insightsRetentionDays")}</div>
              <div className="insights-config-value">
                <div className="insights-config-number blue">{settings?.insights_retention_days ?? 90}</div>
                <div className="insights-config-unit">天</div>
              </div>
              <div className="insights-config-hint">数据保留时长</div>
            </div>
            <div className="insights-config-card purple">
              <div className="insights-config-label">{t(locale, "insightsDiskWarnThreshold")}</div>
              <div className="insights-config-value">
                <div className="insights-config-number purple">
                  {settings?.insights_disk_warn_threshold_mb ?? 100}
                </div>
                <div className="insights-config-unit">MB</div>
              </div>
              <div className="insights-config-hint">磁盘警告阈值</div>
            </div>
          </div>
        </SettingsGroup>

        {/* 数据管理 */}
        <SettingsGroup title="数据管理">
          <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: "4px" }}>清除所有洞察数据</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>删除 SQLite 数据库和 JSONL 日志，不可恢复</div>
            </div>
            <button onClick={handleResetData} disabled={loading} className="insights-button-danger">
              <AlertCircle size={14} />
              清除数据
            </button>
          </div>
        </SettingsGroup>
      </div>
    </>
  );
}

/**
 * 完整的洞察分析面板（独立 Tab）
 * 包含：总览、趋势、分组统计、会话分析
 */
interface InsightsDashboardProps {
  locale: Locale;
  onStateChange?: () => void;
  onOpenSettings?: () => void;
}

export function InsightsDashboard({ locale, onStateChange, onOpenSettings }: InsightsDashboardProps): JSX.Element {
  const initialPrefs = loadUiPrefs();
  const [activeTab, setActiveTab] = useState<InsightsTab>(initialPrefs.activeTab);
  const [settings, setSettings] = useState<InsightsSettings | null>(null);
  const [overview, setOverview] = useState<{
    totalCalls: number; totalTokens: number; cacheHitRate: number;
    reasoningTokens: number; avgLatencyMs: number; errorRate: number;
  } | null>(null);
  const [trendData, setTrendData] = useState<Array<{ date: string; tokens: number; calls: number }>>([]);
  const [breakdownDataModel, setBreakdownDataModel] = useState<Array<{ name: string; calls: number; tokens: number; avgLatency: number }>>([]);
  const [breakdownDataProfile, setBreakdownDataProfile] = useState<Array<{ name: string; calls: number; tokens: number; avgLatency: number }>>([]);
  const [sessionsData, setSessionsData] = useState<Array<{ sessionId: string; calls: number; tokens: number; duration: string; profile: string; models: string; avgLatency: number; errors: number; startedAt: number }>>([]);
  const [costTotal, setCostTotal] = useState<number | null>(null);
  const [costByDay, setCostByDay] = useState<Record<string, number | null>>({});
  const [costByModel, setCostByModel] = useState<Record<string, number | null>>({});
  const [timeRangeKey, setTimeRangeKey] = useState<string>(initialPrefs.timeRangeKey);
  const [customFrom, setCustomFrom] = useState(initialPrefs.customFrom);
  const [customTo, setCustomTo] = useState(initialPrefs.customTo);
  const [timeRangeMode, setTimeRangeMode] = useState<TimeRangeMode>(initialPrefs.timeRangeMode);
  const [loading, setLoading] = useState(false);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>(initialPrefs.trendMetric);
  const [trendChartType, setTrendChartType] = useState<TrendChartType>(initialPrefs.trendChartType);
  const [breakdownModelView, setBreakdownModelView] = useState<BreakdownView>(initialPrefs.breakdownModelView);
  const [breakdownProfileView, setBreakdownProfileView] = useState<BreakdownView>(initialPrefs.breakdownProfileView);
  const { toasts, showToast, removeToast } = useToast();

  useEffect(() => {
    saveUiPrefs({ activeTab, timeRangeKey, timeRangeMode, customFrom, customTo, trendMetric, trendChartType, breakdownModelView, breakdownProfileView });
  }, [activeTab, timeRangeKey, timeRangeMode, customFrom, customTo, trendMetric, trendChartType, breakdownModelView, breakdownProfileView]);

  const getTimeRange = (): unknown => {
    if (timeRangeMode === "custom" && customFrom && customTo) {
      return { fromUtc: new Date(customFrom).getTime(), toUtc: new Date(customTo + "T23:59:59").getTime() };
    }
    return timeRangeKey;
  };

  const loadStatus = async (): Promise<void> => {
    try {
      const result = await window.kimiSwitch.usageGetStatus();
      if (result.ok) setSettings(result.settings);
    } catch (err) {
      console.error("Failed to load insights status:", err);
    }
  };

  const loadData = async (): Promise<void> => {
    setLoading(true);
    const range = getTimeRange() as never;
    try {
      const [overviewRes, trendRes, breakdownModelRes, breakdownProfileRes, sessionsRes, costRes] = await Promise.allSettled([
        window.kimiSwitch.usageQueryOverview(range),
        window.kimiSwitch.usageQueryTrend({ range, bucket: "day", groupBy: null }),
        window.kimiSwitch.usageQueryBreakdown({ dim: "model", range, limit: 20, orderBy: "tokens" }),
        window.kimiSwitch.usageQueryBreakdown({ dim: "profile", range, limit: 20, orderBy: "tokens" }),
        window.kimiSwitch.usageQuerySessions({ range, limit: 20 }),
        window.kimiSwitch.usageQueryCost(range),
      ]);
      if (overviewRes.status === "fulfilled" && overviewRes.value.ok) setOverview(overviewRes.value.slice);
      if (trendRes.status === "fulfilled" && trendRes.value.ok) {
        setTrendData(trendRes.value.series.map((s) => ({ date: new Date(s.bucket).toISOString().slice(0, 10), tokens: s.tokens, calls: s.calls })));
      }
      if (breakdownModelRes.status === "fulfilled" && breakdownModelRes.value.ok) {
        setBreakdownDataModel(breakdownModelRes.value.rows.map((r) => ({ name: r.name, calls: r.calls, tokens: r.tokens, avgLatency: r.avg_latency_ms })));
      }
      if (breakdownProfileRes.status === "fulfilled" && breakdownProfileRes.value.ok) {
        setBreakdownDataProfile(breakdownProfileRes.value.rows.map((r) => ({ name: r.name, calls: r.calls, tokens: r.tokens, avgLatency: r.avg_latency_ms })));
      }
      if (sessionsRes.status === "fulfilled" && sessionsRes.value.ok) {
        setSessionsData(sessionsRes.value.rows.map((r) => ({
          sessionId: r.session_id,
          calls: r.calls,
          tokens: r.tokens,
          duration: r.ended_utc ? formatDuration(r.ended_utc - r.started_utc) : "-",
          profile: r.profile,
          models: r.models,
          avgLatency: r.avg_latency_ms,
          errors: r.errors,
          startedAt: r.started_utc,
        })));
      }
      if (costRes.status === "fulfilled" && costRes.value.ok) {
        setCostTotal(costRes.value.total);
        setCostByDay(costRes.value.byDay);
        setCostByModel(costRes.value.byModel);
      }
    } catch (err) {
      showToast(`加载数据失败: ${String(err)}`, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadStatus(); }, []);
  useEffect(() => { if (settings?.insights_status === "enabled") void loadData(); }, [settings, timeRangeKey, timeRangeMode, customFrom, customTo]);
  useEffect(() => {
    const handler = (): void => { void loadData(); };
    window.addEventListener("kimi-refresh", handler);
    return () => window.removeEventListener("kimi-refresh", handler);
  }, [timeRangeKey, timeRangeMode, customFrom, customTo]);

  const isEnabled = settings?.insights_status === "enabled";
  if (!isEnabled) {
    return (
      <div className="insights-dashboard-empty">
        <div className="insights-empty-icon"><TrendingUp size={64} /></div>
        <h2 className="insights-empty-title">用量洞察未启用</h2>
        <p className="insights-empty-description">
          洞察功能通过解析 kimi-cli 日志自动统计 Token 用量、调用趋势和会话分析。
          <br />请前往「设置 → 用量洞察」开启洞察采集。
        </p>
        {onOpenSettings ? (
          <button onClick={onOpenSettings} className="insights-button-primary" style={{ marginTop: "16px" }}>
            前往设置开启
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="insights-dashboard">
      <div className="insights-dashboard-header">
        <div className="insights-dashboard-title">
          <TrendingUp size={20} />
          <h2>{t(locale, "insights")}</h2>
        </div>
        <div className="insights-dashboard-actions">
          {timeRangeMode === "preset" ? (
            <select value={timeRangeKey} onChange={(e) => { if (e.target.value === "__custom__") { setTimeRangeMode("custom"); const now = new Date(); setCustomTo(now.toISOString().slice(0, 10)); setCustomFrom(new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10)); } else { setTimeRangeKey(e.target.value); } }} className="insights-select">
              <option value="today">今天</option>
              <option value="3d">最近 3 天</option>
              <option value="7d">最近 7 天</option>
              <option value="14d">最近 14 天</option>
              <option value="30d">最近 30 天</option>
              <option value="90d">最近 90 天</option>
              <option value="mtd">本月</option>
              <option value="__custom__">自定义范围...</option>
            </select>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="insights-select" />
              <span style={{ color: "var(--muted)" }}>—</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="insights-select" />
              <button onClick={() => setTimeRangeMode("preset")} className="insights-button-secondary" style={{ padding: "6px 10px" }}>预设</button>
            </div>
          )}
          <button onClick={() => void loadData()} className="insights-button-secondary" disabled={loading}>
            <Activity size={14} />
            {loading ? "加载中..." : "刷新"}
          </button>
        </div>
      </div>

      <div className="insights-tabs-nav">
        {([["overview", "insightsOverview"], ["trend", "insightsTrend"], ["breakdown", "insightsBreakdown"], ["sessions", "insightsSessions"]] as const).map(([tab, key]) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`insights-tab-button ${activeTab === tab ? "active" : ""}`}>
            {tab === "overview" && <Activity size={16} />}
            {tab === "trend" && <TrendingUp size={16} />}
            {tab === "breakdown" && <Database size={16} />}
            {tab === "sessions" && <Zap size={16} />}
            {t(locale, key)}
          </button>
        ))}
      </div>

      <div className="insights-dashboard-content">
        {activeTab === "overview" && (
          <div className="insights-overview-grid">
            <OverviewMetricCard icon={<Activity size={20} />} label={t(locale, "insightsTotalCalls")} value={overview ? formatNumber(overview.totalCalls) : "-"} color="blue" />
            <OverviewMetricCard icon={<Zap size={20} />} label={t(locale, "insightsTotalTokens")} value={overview ? formatNumber(overview.totalTokens) : "-"} color="purple" />
            <OverviewMetricCard icon={<TrendingUp size={20} />} label={t(locale, "insightsCacheHitRate")} value={overview ? `${(overview.cacheHitRate * 100).toFixed(1)}%` : "-"} color="green" />
            <OverviewMetricCard icon={<Database size={20} />} label={t(locale, "insightsReasoningTokens")} value={overview ? formatNumber(overview.reasoningTokens) : "-"} color="orange" />
            <OverviewMetricCard icon={<Activity size={20} />} label={t(locale, "insightsAvgLatency")} value={overview ? `${Math.round(overview.avgLatencyMs)} ms` : "-"} color="cyan" />
            <OverviewMetricCard icon={<AlertCircle size={20} />} label={t(locale, "insightsErrorRate")} value={overview ? `${(overview.errorRate * 100).toFixed(1)}%` : "-"} color="red" />
            <OverviewMetricCard icon={<TrendingUp size={20} />} label={t(locale, "costEstimate")} value={formatCost(costTotal, locale)} color="green" />
          </div>
        )}

        {activeTab === "trend" && (
          <div className="insights-trend-panel">
            <p className="insights-tab-desc">按日展示 Token 消耗或调用次数的变化趋势，帮助发现用量高峰和异常波动。</p>
            <div className="insights-trend-controls">
              <select value={trendMetric} onChange={(e) => setTrendMetric(e.target.value as TrendMetric)} className="insights-select">
                <option value="tokens">Token 消耗</option>
                <option value="calls">调用次数</option>
              </select>
              <div className="insights-chart-type-toggle" role="tablist" aria-label="图表类型">
                <button
                  type="button"
                  role="tab"
                  aria-selected={trendChartType === "bar"}
                  className={`insights-chart-type-btn ${trendChartType === "bar" ? "active" : ""}`}
                  onClick={() => setTrendChartType("bar")}
                  title="柱状图"
                >
                  <BarChart3 size={14} />
                  <span>柱状图</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={trendChartType === "line"}
                  className={`insights-chart-type-btn ${trendChartType === "line" ? "active" : ""}`}
                  onClick={() => setTrendChartType("line")}
                  title="折线图"
                >
                  <LineChart size={14} />
                  <span>折线图</span>
                </button>
              </div>
            </div>
            {trendData.length === 0 ? (
              <div className="insights-coming-soon"><TrendingUp size={48} /><h3>暂无趋势数据</h3><p>使用 kimi-cli 发起请求后，趋势数据将在此展示。</p></div>
            ) : (
              <>
                <div className="insights-trend-cost-summary">
                  <span className="insights-trend-cost-label">{t(locale, "costEstimate")}</span>
                  <span className="insights-trend-cost-value">{formatCost(costTotal, locale)}</span>
                </div>
                <TrendChart data={trendData} metric={trendMetric} chartType={trendChartType} />
              </>
            )}
          </div>
        )}

        {activeTab === "breakdown" && (
          <div className="insights-breakdown-panel">
            <p className="insights-tab-desc">{t(locale, "insightsBreakdownDesc")}</p>
            <div className="insights-breakdown-dual">
              <BreakdownCard
                title={t(locale, "insightsBreakdownByModel")}
                data={breakdownDataModel}
                view={breakdownModelView}
                onViewChange={setBreakdownModelView}
                locale={locale}
                costByName={costByModel}
              />
              <BreakdownCard
                title={t(locale, "insightsBreakdownByProfile")}
                data={breakdownDataProfile}
                view={breakdownProfileView}
                onViewChange={setBreakdownProfileView}
                locale={locale}
              />
            </div>
          </div>
        )}

        {activeTab === "sessions" && (
          <div className="insights-sessions-panel">
            <p className="insights-tab-desc">{t(locale, "insightsSessionsDesc")}</p>
            {sessionsData.length === 0 ? (
              <div className="insights-coming-soon"><Zap size={48} /><h3>{t(locale, "insightsSessionsEmpty")}</h3><p>{t(locale, "insightsSessionsEmptyHint")}</p></div>
            ) : (
              <div className="insights-session-list">
                {sessionsData.map((row, i) => {
                  const modelList = row.models ? row.models.split(",").filter(Boolean) : [];
                  return (
                    <div key={i} className="insights-session-card">
                      <div className="insights-session-card-main">
                        <div className="insights-session-card-header">
                          <span className="insights-session-id" title={row.sessionId}>{row.sessionId}</span>
                          {row.errors > 0 && (
                            <span className="insights-session-badge danger" title={t(locale, "insightsSessionErrors")}>
                              <AlertCircle size={12} />
                              {row.errors}
                            </span>
                          )}
                        </div>
                        <div className="insights-session-meta">
                          <span className="insights-session-meta-item" title={t(locale, "insightsSessionStartedAt")}>
                            <Clock size={12} />
                            {formatTimestamp(row.startedAt)}
                          </span>
                          {row.profile && (
                            <span className="insights-session-meta-item" title={t(locale, "insightsSessionProfile")}>
                              <User size={12} />
                              {row.profile}
                            </span>
                          )}
                          {modelList.length > 0 && (
                            <span className="insights-session-meta-item" title={t(locale, "insightsSessionModels")}>
                              <Cpu size={12} />
                              {modelList.length === 1 ? modelList[0] : `${modelList[0]} +${modelList.length - 1}`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="insights-session-stats">
                        <div className="insights-session-stat">
                          <div className="insights-session-stat-label">{t(locale, "insightsTotalTokens")}</div>
                          <div className="insights-session-stat-value">{formatNumber(row.tokens)}</div>
                        </div>
                        <div className="insights-session-stat">
                          <div className="insights-session-stat-label">{t(locale, "insightsTotalCalls")}</div>
                          <div className="insights-session-stat-value">{row.calls}</div>
                        </div>
                        <div className="insights-session-stat">
                          <div className="insights-session-stat-label">{t(locale, "insightsAvgLatency")}</div>
                          <div className="insights-session-stat-value">{row.avgLatency > 0 ? `${row.avgLatency} ms` : "-"}</div>
                        </div>
                        <div className="insights-session-stat">
                          <div className="insights-session-stat-label">{t(locale, "insightsSessionDuration")}</div>
                          <div className="insights-session-stat-value">{row.duration}</div>
                        </div>
                      </div>
                      <button
                        className="insights-icon-button"
                        title={t(locale, "insightsSessionResume")}
                        onClick={() => void window.kimiSwitch.usageOpenSessionTerminal(row.sessionId)}
                      >
                        <Terminal size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

interface BreakdownCardProps {
  title: string;
  data: Array<{ name: string; calls: number; tokens: number; avgLatency: number }>;
  view: BreakdownView;
  onViewChange: (v: BreakdownView) => void;
  locale: Locale;
  costByName?: Record<string, number | null>;
}

function BreakdownCard({ title, data, view, onViewChange, locale, costByName }: BreakdownCardProps): JSX.Element {
  const pieData: PieDatum[] = data.map((r) => ({ name: r.name || "(未知)", value: r.tokens }));
  const showCost = costByName !== undefined;

  return (
    <div className="insights-breakdown-card">
      <div className="insights-breakdown-card-header">
        <h4 className="insights-breakdown-card-title">{title}</h4>
        <div className="insights-chart-type-toggle" role="tablist" aria-label="展示形式">
          <button
            type="button"
            role="tab"
            aria-selected={view === "table"}
            className={`insights-chart-type-btn ${view === "table" ? "active" : ""}`}
            onClick={() => onViewChange("table")}
            title={t(locale, "insightsViewTable")}
          >
            <TableIcon size={14} />
            <span>{t(locale, "insightsViewTable")}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "pie"}
            className={`insights-chart-type-btn ${view === "pie" ? "active" : ""}`}
            onClick={() => onViewChange("pie")}
            title={t(locale, "insightsViewPie")}
          >
            <PieIcon size={14} />
            <span>{t(locale, "insightsViewPie")}</span>
          </button>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="insights-coming-soon">
          <Database size={36} />
          <h3>{t(locale, "insightsBreakdownEmpty")}</h3>
          <p>{t(locale, "insightsBreakdownEmptyHint")}</p>
        </div>
      ) : view === "table" ? (
        <div className="insights-breakdown-table">
          <div className="insights-table-header">
            <span className="insights-table-cell name">名称</span>
            <span className="insights-table-cell num">调用次数</span>
            <span className="insights-table-cell num">Token 总量</span>
            <span className="insights-table-cell num">占比</span>
            <span className="insights-table-cell num">平均延迟</span>
            {showCost && <span className="insights-table-cell num">{t(locale, "insightsCostColumn")}</span>}
          </div>
          {data.map((row, i) => {
            const totalTokens = data.reduce((sum, r) => sum + r.tokens, 0) || 1;
            const pct = ((row.tokens / totalTokens) * 100).toFixed(1);
            return (
              <div key={i} className="insights-table-row">
                <span className="insights-table-cell name">{row.name || "(未知)"}</span>
                <span className="insights-table-cell num">{formatNumber(row.calls)}</span>
                <span className="insights-table-cell num">{formatNumber(row.tokens)}</span>
                <span className="insights-table-cell num">{pct}%</span>
                <span className="insights-table-cell num">{Math.round(row.avgLatency)} ms</span>
                {showCost && (
                  <span className="insights-table-cell num">{formatCost(costByName?.[row.name] ?? null, locale)}</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <PieChart data={pieData} unitLabel="tokens" />
      )}
    </div>
  );
}

interface OverviewMetricCardProps {
  icon: JSX.Element;
  label: string;
  value: string;
  color: "blue" | "purple" | "green" | "orange" | "cyan" | "red";
}

function OverviewMetricCard({ icon, label, value, color }: OverviewMetricCardProps): JSX.Element {
  return (
    <div className={`insights-metric-overview-card color-${color}`}>
      <div className="insights-metric-overview-icon">{icon}</div>
      <div className="insights-metric-overview-label">{label}</div>
      <div className="insights-metric-overview-value">{value}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Formats an estimated cost (USD) for display. A `null` cost means no pricing is
 * known for the underlying model(s) — we render the localized "not priced"
 * placeholder rather than "$0.00", which would mislead the user into thinking
 * the work was free. Sub-cent non-zero costs show as "<$0.01".
 */
function formatCost(cost: number | null, locale: Locale): string {
  if (cost === null) return t(locale, "costUnknown");
  if (cost > 0 && cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}

function formatTimestamp(ms: number): string {
  if (!ms) return "-";
  const d = new Date(ms);
  const now = new Date();
  const diffMs = now.getTime() - ms;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  if (diffMs < 7 * 86400000) {
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "-";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}
