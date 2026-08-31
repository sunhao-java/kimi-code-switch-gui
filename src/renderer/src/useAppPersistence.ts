import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { MutableRefObject } from "react";

import { cloneState, normalizeStatePaths } from "@shared/configStore";
import type { AppState, ConfigDoctorReport, ConfigTarget, FileSnapshotBundle, Locale, PreviewBundle, SaveStateConflictResult } from "@shared/types";
import { getApi } from "./appHelpers";
import { translateError } from "./i18n";
import type { DiagnosticsState } from "./overviewDashboard";
import { applyPrimarySelections, getDefaultPrimarySelections, getRetainedPrimarySelections } from "./primarySelections";
import { applyAppearanceMode, applyAppearanceTheme, applyUiFontSize, createFallbackState } from "./tabComponents";
import { isExternalChangeConflict } from "./useSafetyActions";
import { initBackupBaseline, maybeBackupAfterSave, maybeRunScheduledBackup } from "./backupAuto";
import { recordStartupTiming, startupTimingNow } from "./startupTiming";

interface AppPersistenceContext {
  state: AppState;
  savedState: AppState | null;
  locale: Locale;
  setState: Dispatch<SetStateAction<AppState>>;
  setSavedState: Dispatch<SetStateAction<AppState | null>>;
  setPreview: Dispatch<SetStateAction<PreviewBundle>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setDiagnostics: Dispatch<SetStateAction<DiagnosticsState>>;
  fileSnapshot: FileSnapshotBundle | null;
  fileSnapshotRef?: MutableRefObject<FileSnapshotBundle | null>;
  setFileSnapshot: Dispatch<SetStateAction<FileSnapshotBundle | null>>;
  setDoctorReport: Dispatch<SetStateAction<ConfigDoctorReport | null>>;
  confirmExternalOverwrite: (conflict: SaveStateConflictResult) => Promise<boolean>;
  refreshPreview: (draft?: AppState) => Promise<void>;
  refreshSkills: (draft?: AppState, options?: { silent?: boolean }) => Promise<void>;
  currentSelections: {
    provider: string;
    model: string;
    profile: string;
    mcpServer: string;
  };
  setSelectedProvider: Dispatch<SetStateAction<string>>;
  setSelectedModel: Dispatch<SetStateAction<string>>;
  setSelectedProfile: Dispatch<SetStateAction<string>>;
  setSelectedMcpServer: Dispatch<SetStateAction<string>>;
}

export function useAppPersistence(ctx: AppPersistenceContext) {
  const {
    state,
    savedState,
    locale,
    setState,
    setSavedState,
    setPreview,
    setError,
    setNotice,
    setDiagnostics,
    fileSnapshot,
    fileSnapshotRef,
    setFileSnapshot,
    setDoctorReport,
    confirmExternalOverwrite,
    refreshPreview,
    refreshSkills,
    currentSelections,
    setSelectedProvider,
    setSelectedModel,
    setSelectedProfile,
    setSelectedMcpServer,
  } = ctx;

  const pendingPersistRef = useRef<AppState | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistWaitersRef = useRef<Array<() => void>>([]);
  const inFlightPersistRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const onKimiTargetDetection = (event: Event): void => {
      const detection = (event as CustomEvent<AppState["kimiTargetDetection"]>).detail;
      if (!detection) return;
      setState((current) => ({
        ...current,
        kimiTargetDetection: detection,
      }));
      setSavedState((current) => current
        ? {
          ...current,
          kimiTargetDetection: detection,
        }
        : current);
    };
    window.addEventListener("kimi-target-detection", onKimiTargetDetection);
    return () => window.removeEventListener("kimi-target-detection", onKimiTargetDetection);
  }, [setSavedState, setState]);

  const runPostLoadTasks = useCallback((normalized: AppState, api: NonNullable<ReturnType<typeof getApi>>): void => {
    void (async () => {
      const startedAt = startupTimingNow();
      // doctor 与 skills 互不依赖，并行执行以缩短启动后的后台准备时间。
      const doctorTask = api.runDoctor
        ? (async () => {
          const taskStartedAt = startupTimingNow();
          const doctor = await api.runDoctor!(normalized);
          recordStartupTiming("useAppPersistence.runDoctor", taskStartedAt);
          setDoctorReport(doctor);
        })()
        : Promise.resolve();
      const skillsTask = (async () => {
        const taskStartedAt = startupTimingNow();
        await refreshSkills(normalized, { silent: true });
        recordStartupTiming("useAppPersistence.refreshSkills", taskStartedAt);
      })();
      const taskResults = await Promise.allSettled([doctorTask, skillsTask]);
      for (const result of taskResults) {
        if (result.status === "rejected") {
          const err = result.reason;
          setDiagnostics((current) => ({
            ...current,
            lastError: err instanceof Error ? err.message : String(err),
          }));
        }
      }

      try {
        const backupStartedAt = startupTimingNow();
        await initBackupBaseline(normalized);
        recordStartupTiming("useAppPersistence.initBackupBaseline", backupStartedAt);
        void maybeRunScheduledBackup(normalized);
      } catch (err) {
        setDiagnostics((current) => ({
          ...current,
          lastError: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        recordStartupTiming("useAppPersistence.postLoadTasks", startedAt);
      }
    })();
  }, [refreshSkills, setDiagnostics, setDoctorReport]);

  const loadState = useCallback(async (): Promise<void> => {
    const loadStartedAt = startupTimingNow();
    const api = getApi();
    if (!api) {
      setState(createFallbackState());
      setError("Electron preload API is unavailable. Check the preload script and packaged entry paths.");
      setDiagnostics({
        preload: "unavailable",
        loadState: "failed",
        previewState: "unavailable",
        lastError: "Electron preload API is unavailable.",
      });
      return;
    }

    try {
      setDiagnostics((current) => ({
        ...current,
        preload: "ok",
        loadState: "pending",
      }));
      const apiLoadStartedAt = startupTimingNow();
      const next = await api.loadState();
      recordStartupTiming("useAppPersistence.api.loadState", apiLoadStartedAt);
      const normalized = normalizeStatePaths(next);
      setState(normalized);
      setSavedState(normalized);
      applyAppearanceMode(normalized.panelSettings.theme);
      applyAppearanceTheme(normalized.panelSettings.appearance_theme);
      applyUiFontSize(normalized.panelSettings.ui_font_size);
      applyPrimarySelections(getDefaultPrimarySelections(normalized), {
        setSelectedProvider,
        setSelectedModel,
        setSelectedProfile,
        setSelectedMcpServer,
      });
      const previewStartedAt = startupTimingNow();
      const nextPreview = await api.previewState(normalized);
      recordStartupTiming("useAppPersistence.api.previewState", previewStartedAt);
      setPreview(nextPreview);
      setError("");
      setNotice("");
      setDiagnostics({
        preload: "ok",
        loadState: "ok",
        previewState: "ok",
        lastError: "",
      });
      // 在 UI 可交互前同步建立快照基线，避免首屏存在「基线未就绪 → 保存时
      // expectedSnapshot 为空 → 外部变更检测被跳过」的窗口。其余较重的后加载任务
      // （doctor / skills / 备份基线）仍后台异步执行，保留首屏性能优化。
      if (api.captureSnapshot) {
        try {
          const snapshotStartedAt = startupTimingNow();
          const snapshot = await api.captureSnapshot(normalized);
          recordStartupTiming("useAppPersistence.captureSnapshot", snapshotStartedAt);
          setFileSnapshot(snapshot);
        } catch (err) {
          setDiagnostics((current) => ({
            ...current,
            lastError: err instanceof Error ? err.message : String(err),
          }));
        }
      }
      runPostLoadTasks(normalized, api);
      recordStartupTiming("useAppPersistence.loadState.total", loadStartedAt);
    } catch (loadError) {
      const fallback = createFallbackState();
      setState(fallback);
      setSavedState(fallback);
      applyAppearanceMode(fallback.panelSettings.theme);
      applyAppearanceTheme(fallback.panelSettings.appearance_theme);
      applyUiFontSize(fallback.panelSettings.ui_font_size);
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(message);
      setDiagnostics((current) => ({
        preload: current.preload === "pending" ? "ok" : current.preload,
        loadState: "failed",
        previewState: current.previewState,
        lastError: message,
      }));
    }
  }, [
    runPostLoadTasks,
    setDiagnostics,
    setError,
    setFileSnapshot,
    setNotice,
    setPreview,
    setSavedState,
    setSelectedMcpServer,
    setSelectedModel,
    setSelectedProfile,
    setSelectedProvider,
    setState,
  ]);

  const persistStateNow = useCallback(async (nextState: AppState): Promise<void> => {
    const api = getApi();
    if (!api) {
      const message = "Electron preload API is unavailable. Save operation cannot continue.";
      setError(message);
      setDiagnostics((current) => ({ ...current, preload: "unavailable", lastError: message }));
      return;
    }
    try {
      const normalized = normalizeStatePaths(nextState);
      const expectedSnapshot = fileSnapshotRef?.current ?? fileSnapshot ?? undefined;
      const saveResult = api.saveStateSafe
        ? await api.saveStateSafe(normalized, { expectedSnapshot })
        : await api.saveState(normalized);
      if (isExternalChangeConflict(saveResult)) {
        const overwrite = await confirmExternalOverwrite(saveResult);
        if (!overwrite) {
          setFileSnapshot(saveResult.snapshot);
          setDoctorReport(saveResult.doctor);
          return;
        }
        const overwriteResult = api.saveStateSafe
          ? await api.saveStateSafe(normalized, { expectedSnapshot, allowOverwrite: true })
          : await api.saveState(normalized);
        if (isExternalChangeConflict(overwriteResult)) {
          setFileSnapshot(overwriteResult.snapshot);
          setDoctorReport(overwriteResult.doctor);
          throw new Error("Save blocked: external-change");
        }
        if ("snapshot" in overwriteResult && "doctor" in overwriteResult) {
          setFileSnapshot(overwriteResult.snapshot);
          setDoctorReport(overwriteResult.doctor);
        }
      } else if ("snapshot" in saveResult && "doctor" in saveResult) {
        setFileSnapshot(saveResult.snapshot);
        setDoctorReport(saveResult.doctor);
      }
      if (savedState?.panelSettings.tray_icon !== normalized.panelSettings.tray_icon) {
        await api.setTray(normalized.panelSettings.tray_icon);
      }
      const nextPreview = await api.previewState(normalized);
      setState(normalized);
      setSavedState(normalized);
      setPreview(nextPreview);
      void refreshSkills(normalized, { silent: true });
      setError("");
      setNotice("");
      // 修改后备份：核心配置指纹变化时静默触发（指纹去重使纯 UI 操作成为 no-op）。
      void maybeBackupAfterSave(normalized);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(translateError(locale, message));
      setNotice("");
      setDiagnostics((current) => ({ ...current, lastError: message }));
    }
  }, [
    confirmExternalOverwrite,
    fileSnapshot,
    fileSnapshotRef,
    locale,
    refreshSkills,
    savedState,
    setDiagnostics,
    setDoctorReport,
    setError,
    setFileSnapshot,
    setNotice,
    setPreview,
    setSavedState,
    setState,
  ]);

  // persistStateNow 的依赖（confirmExternalOverwrite、savedState 等）几乎每次
  // 渲染都会变化；通过 ref 间接调用可以让 flushPendingPersist / persistState
  // 保持引用稳定，否则卸载 cleanup 会在每次渲染后执行，把 debounce 队列立即冲掉。
  const persistStateNowRef = useRef(persistStateNow);
  useEffect(() => {
    persistStateNowRef.current = persistStateNow;
  }, [persistStateNow]);

  // pending 与 waiter 在同一周期内原子取走：本周期保存完成只 resolve 本周期
  // 注册的 waiter，保存期间新注册的属于下一轮，不会被在途保存提前放行。
  // 同时用 in-flight promise 链串行化，保证任一时刻至多一个 saveStateSafe
  // 在途，避免并发写把彼此的落盘误判为外部变更。
  const flushPendingPersist = useCallback(async (): Promise<void> => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const previous = inFlightPersistRef.current;
    const run = (async () => {
      await previous;
      const pending = pendingPersistRef.current;
      pendingPersistRef.current = null;
      const waiters = persistWaitersRef.current.splice(0);
      try {
        if (pending) {
          await persistStateNowRef.current(pending);
        }
      } finally {
        waiters.forEach((resolve) => resolve());
      }
    })();
    inFlightPersistRef.current = run;
    try {
      await run;
    } finally {
      if (inFlightPersistRef.current === run) {
        inFlightPersistRef.current = null;
      }
    }
  }, []);

  // 普通编辑采用尾部 debounce，连续修改只落盘最后一个状态；需要立即落盘的
  // 删除、环境切换等操作仍通过 persistImmediateState 执行，不受此队列影响。
  const persistState = useCallback((nextState: AppState): Promise<void> => {
    pendingPersistRef.current = nextState;
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    const promise = new Promise<void>((resolve) => {
      persistWaitersRef.current.push(resolve);
    });
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void flushPendingPersist();
    }, 150);
    return promise;
  }, [flushPendingPersist]);

  useEffect(() => () => {
    // 组件卸载（例如窗口关闭）时仍把最后一次编辑写入磁盘，避免 debounce 丢失。
    void flushPendingPersist();
  }, [flushPendingPersist]);

  const onSave = useCallback(async (): Promise<void> => {
    if (!state) {
      return;
    }
    await persistState(state);
  }, [persistState, state]);

  const persistConfigTarget = useCallback(async (configTarget: ConfigTarget): Promise<void> => {
    const api = getApi();
    if (!api?.saveConfigTargetPreference) {
      const message = "Kimi Switch API does not support config target switching.";
      setError(message);
      setDiagnostics((current) => ({ ...current, lastError: message }));
      throw new Error(message);
    }

    await api.saveConfigTargetPreference(configTarget);
    const nextState = cloneState(state);
    nextState.configTarget = configTarget;
    nextState.panelSettings.config_target = configTarget;
    const normalized = normalizeStatePaths(nextState);
    setState(normalized);
    setSavedState(normalized);
    setError("");
    setNotice("");
  }, [setDiagnostics, setError, setNotice, setSavedState, setState, state]);

  const persistImmediateState = useCallback(async (
    nextVisibleState: AppState,
    nextSavedStateOverride?: AppState,
  ): Promise<void> => {
    await flushPendingPersist();
    const api = getApi();
    if (!api) {
      const message = "Electron preload API is unavailable. Save operation cannot continue.";
      setError(message);
      setDiagnostics((current) => ({ ...current, preload: "unavailable", lastError: message }));
      return;
    }

    const previousSavedState = savedState;
    const normalizedVisibleState = normalizeStatePaths(nextVisibleState);
    const normalizedSavedState = normalizeStatePaths(nextSavedStateOverride ?? nextVisibleState);

    setState(normalizedVisibleState);
    setSavedState(normalizedSavedState);
    applyAppearanceMode(normalizedVisibleState.panelSettings.theme);
    applyAppearanceTheme(normalizedVisibleState.panelSettings.appearance_theme);
    applyUiFontSize(normalizedVisibleState.panelSettings.ui_font_size);
    void refreshPreview(normalizedVisibleState);
    setError("");
    setNotice("");

    try {
      const expectedSnapshot = fileSnapshotRef?.current ?? fileSnapshot ?? undefined;
      const saveResult = api.saveStateSafe
        ? await api.saveStateSafe(normalizedSavedState, { expectedSnapshot })
        : await api.saveState(normalizedSavedState);
      if (isExternalChangeConflict(saveResult)) {
        const overwrite = await confirmExternalOverwrite(saveResult);
        if (!overwrite) {
          setSavedState(previousSavedState ?? null);
          setFileSnapshot(saveResult.snapshot);
          setDoctorReport(saveResult.doctor);
          return;
        }
        const overwriteResult = api.saveStateSafe
          ? await api.saveStateSafe(normalizedSavedState, { expectedSnapshot, allowOverwrite: true })
          : await api.saveState(normalizedSavedState);
        if (isExternalChangeConflict(overwriteResult)) {
          setFileSnapshot(overwriteResult.snapshot);
          setDoctorReport(overwriteResult.doctor);
          throw new Error("Save blocked: external-change");
        }
        if ("snapshot" in overwriteResult && "doctor" in overwriteResult) {
          setFileSnapshot(overwriteResult.snapshot);
          setDoctorReport(overwriteResult.doctor);
        }
      } else if ("snapshot" in saveResult && "doctor" in saveResult) {
        setFileSnapshot(saveResult.snapshot);
        setDoctorReport(saveResult.doctor);
      }
      if (previousSavedState?.panelSettings.tray_icon !== normalizedSavedState.panelSettings.tray_icon) {
        await api.setTray(normalizedSavedState.panelSettings.tray_icon);
      }
      if (
        previousSavedState?.panelSettings.locale !== normalizedSavedState.panelSettings.locale ||
        previousSavedState?.panelSettings.theme !== normalizedSavedState.panelSettings.theme
      ) {
        await api.refreshTrayMenu?.();
      }
      const nextPreview = await api.previewState(normalizedVisibleState);
      setPreview(nextPreview);
      void refreshSkills(normalizedVisibleState, { silent: true });
      setError("");
      setNotice("");
      // 修改后备份（on-change）：核心配置指纹变化时静默触发，纯 UI 操作为 no-op。
      void maybeBackupAfterSave(normalizedSavedState);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setSavedState(previousSavedState ?? null);
      setError(translateError(locale, message));
      setNotice("");
      setDiagnostics((current) => ({ ...current, lastError: message }));
    }
  }, [
    confirmExternalOverwrite,
    fileSnapshot,
    fileSnapshotRef,
    locale,
    refreshPreview,
    refreshSkills,
    savedState,
    setDiagnostics,
    setDoctorReport,
    setError,
    setFileSnapshot,
    setNotice,
    setPreview,
    setSavedState,
    setState,
    flushPendingPersist,
  ]);

  const restoreSavedState = useCallback((nextSavedState: AppState): void => {
    const restored = normalizeStatePaths(cloneState(nextSavedState));
    setState(restored);
    applyAppearanceMode(restored.panelSettings.theme);
    applyAppearanceTheme(restored.panelSettings.appearance_theme);
    applyUiFontSize(restored.panelSettings.ui_font_size);
    applyPrimarySelections(
      getRetainedPrimarySelections(restored, currentSelections),
      {
        setSelectedProvider,
        setSelectedModel,
        setSelectedProfile,
        setSelectedMcpServer,
      },
    );
    void refreshSkills(restored, { silent: true });
    void refreshPreview(restored);
    setError("");
    setNotice("");
  }, [
    currentSelections,
    refreshPreview,
    refreshSkills,
    setError,
    setNotice,
    setSelectedMcpServer,
    setSelectedModel,
    setSelectedProfile,
    setSelectedProvider,
    setState,
  ]);

  return {
    loadState,
    persistState,
    onSave,
    persistConfigTarget,
    persistImmediateState,
    restoreSavedState,
  };
}
