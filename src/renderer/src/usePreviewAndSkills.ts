import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { SkillsScanReport } from "@shared/skillsStore";
import type { AppState, Locale, PreviewBundle } from "@shared/types";
import { emptyPreview } from "./appOptions";
import { getApi } from "./appHelpers";
import { t, translateError } from "./i18n";
import type { DiagnosticsState } from "./overviewDashboard";

interface PreviewAndSkillsContext {
  state: AppState;
  locale: Locale;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setDiagnostics: Dispatch<SetStateAction<DiagnosticsState>>;
  setSelectedSkillPath: Dispatch<SetStateAction<string>>;
  setSelectedSkill: Dispatch<SetStateAction<string>>;
}

export function usePreviewAndSkills(ctx: PreviewAndSkillsContext) {
  const {
    state,
    locale,
    setError,
    setNotice,
    setDiagnostics,
    setSelectedSkillPath,
    setSelectedSkill,
  } = ctx;
  const [preview, setPreview] = useState<PreviewBundle>(emptyPreview);
  const [skillsReport, setSkillsReport] = useState<SkillsScanReport | null>(null);
  const [isSkillsLoading, setIsSkillsLoading] = useState(false);
  const skillsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (skillsRefreshTimerRef.current) {
        clearTimeout(skillsRefreshTimerRef.current);
      }
    };
  }, []);

  const refreshPreview = useCallback(async (draft?: AppState): Promise<void> => {
    const targetState = draft ?? state;
    if (!targetState) {
      setPreview(emptyPreview);
      return;
    }

    const api = getApi();
    if (!api) {
      setPreview(emptyPreview);
      setDiagnostics((current) => ({ ...current, previewState: "unavailable" }));
      return;
    }
    try {
      const nextPreview = await api.previewState(targetState);
      setPreview(nextPreview);
      setDiagnostics((current) => ({ ...current, previewState: "ok" }));
    } catch {
      setPreview(emptyPreview);
      setDiagnostics((current) => ({
        ...current,
        previewState: "failed",
        lastError: current.lastError || "Preview generation failed.",
      }));
    }
  }, [setDiagnostics, state]);

  const refreshSkills = useCallback(async (
    draft?: AppState,
    options: { silent?: boolean } = {},
  ): Promise<void> => {
    const targetState = draft ?? state;
    if (!targetState) {
      setSkillsReport(null);
      return;
    }

    // Debounce silent refreshes to avoid excessive scans during rapid saves.
    if (options.silent && skillsRefreshTimerRef.current) {
      clearTimeout(skillsRefreshTimerRef.current);
      skillsRefreshTimerRef.current = null;
    }

    const doRefresh = async (): Promise<void> => {
      const api = getApi();
      if (!api) {
        setSkillsReport(null);
        return;
      }
      if (typeof api.scanSkills !== "function") {
        if (!options.silent) {
          setNotice("");
          setError(t(locale, "skillsRuntimeOutdated"));
        }
        setSkillsReport(null);
        return;
      }
      try {
        setIsSkillsLoading(true);
        const report = await api.scanSkills(targetState);
        setSkillsReport(report);
        setSelectedSkillPath((current) => {
          if (current && report.paths.some((path) => path.id === current)) {
            return current;
          }
          return report.paths.find((path) => path.selected)?.id ?? report.paths[0]?.id ?? "";
        });
        setSelectedSkill((current) => {
          if (current && report.skills.some((skill) => skill.id === current)) {
            return current;
          }
          return "";
        });
        if (!options.silent) {
          setError("");
          setNotice(t(locale, "skillsRefreshed"));
        }
      } catch (scanError) {
        const message = scanError instanceof Error ? scanError.message : String(scanError);
        if (!options.silent) {
          setNotice("");
          setError(translateError(locale, message));
        }
      } finally {
        setIsSkillsLoading(false);
      }
    };

    if (options.silent) {
      skillsRefreshTimerRef.current = setTimeout(() => {
        skillsRefreshTimerRef.current = null;
        void doRefresh();
      }, 500);
      return;
    }

    await doRefresh();
  }, [locale, setError, setNotice, setSelectedSkill, setSelectedSkillPath, state]);

  return {
    preview,
    setPreview,
    skillsReport,
    setSkillsReport,
    isSkillsLoading,
    setIsSkillsLoading,
    skillsRefreshTimerRef,
    refreshPreview,
    refreshSkills,
  };
}
