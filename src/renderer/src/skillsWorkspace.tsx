import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, List, X } from "lucide-react";

import type { SkillEntry, SkillsScanReport } from "@shared/skillsStore";
import type { Locale } from "@shared/types";

import { CodePanel } from "./codePanel";
import { t } from "./i18n";

export type SkillsViewMode = "grid" | "list";

export function SkillsWorkspace(props: {
  locale: Locale;
  report: SkillsScanReport | null;
  selectedPath: SkillsScanReport["paths"][number] | null;
  visibleSkills: SkillEntry[];
  selectedSkill: SkillEntry | null;
  viewMode: SkillsViewMode;
  onViewModeChange: (mode: SkillsViewMode) => void;
  onSelectSkill: (skillId: string) => void;
  isLoading: boolean;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [dynamicPageSize, setDynamicPageSize] = useState(9);
  const overviewPanelRef = useRef<HTMLElement | null>(null);
  const skillsListRef = useRef<HTMLDivElement | null>(null);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredSkills = normalizedQuery
    ? props.visibleSkills.filter((skill) => {
        const name = skill.name.toLowerCase();
        const description = skill.metadata.description.toLowerCase();
        return name.includes(normalizedQuery) || description.includes(normalizedQuery);
      })
    : props.visibleSkills;

  const pageSize = dynamicPageSize;
  const totalPages = Math.max(1, Math.ceil(filteredSkills.length / pageSize));
  const pagedSkills = filteredSkills.slice((page - 1) * pageSize, page * pageSize);
  const gridStyle =
    props.viewMode === "grid" && pagedSkills.length > 0 && pagedSkills.length < 4
      ? {
          gridTemplateColumns: `repeat(${pagedSkills.length}, 240px)`,
          justifyContent: "start" as const,
        }
      : undefined;

  useEffect(() => {
    setPage(1);
  }, [props.selectedPath?.id, props.viewMode, searchQuery]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    const updateDynamicPageSize = (): void => {
      const panelElement = overviewPanelRef.current;
      const listElement = skillsListRef.current;
      if (!panelElement || !listElement) {
        return;
      }

      const panelRect = panelElement.getBoundingClientRect();
      const listRect = listElement.getBoundingClientRect();
      const panelStyles = window.getComputedStyle(panelElement);
      const listStyles = window.getComputedStyle(listElement);
      const panelPaddingBottom = Number.parseFloat(panelStyles.paddingBottom || "0");
      const availableHeight = Math.max(
        0,
        panelRect.bottom - listRect.top - panelPaddingBottom,
      );
      let nextPageSize = 1;

      if (props.viewMode === "list") {
        const rowGap = Number.parseFloat(listStyles.rowGap || listStyles.gap || "0");
        const sampleRow = listElement.querySelector<HTMLElement>(".skills-read-row");
        const rowHeight = sampleRow?.getBoundingClientRect().height ?? 134;

        nextPageSize = Math.max(
          1,
          Math.floor((availableHeight + rowGap) / (rowHeight + rowGap)),
        );

        while (
          nextPageSize > 1 &&
          nextPageSize * rowHeight + (nextPageSize - 1) * rowGap > availableHeight + 0.5
        ) {
          nextPageSize -= 1;
        }
      } else {
        const columnGap = Number.parseFloat(listStyles.columnGap || listStyles.gap || "0");
        const rowGap = Number.parseFloat(listStyles.rowGap || listStyles.gap || "0");
        const sampleCard = listElement.querySelector<HTMLElement>(".skills-read-card");
        const cardHeight = sampleCard?.getBoundingClientRect().height ?? 188;
        const cardWidth = sampleCard?.getBoundingClientRect().width ?? 240;
        const availableWidth = Math.max(0, listRect.width);

        let columns = Math.max(
          1,
          Math.floor((availableWidth + columnGap) / (cardWidth + columnGap)),
        );

        while (
          columns > 1 &&
          columns * cardWidth + (columns - 1) * columnGap > availableWidth + 0.5
        ) {
          columns -= 1;
        }

        let rows = Math.max(
          1,
          Math.floor((availableHeight + rowGap) / (cardHeight + rowGap)),
        );

        while (
          rows > 1 &&
          rows * cardHeight + (rows - 1) * rowGap > availableHeight + 0.5
        ) {
          rows -= 1;
        }

        nextPageSize = Math.max(1, rows * columns);
      }

      setDynamicPageSize((current) => (current === nextPageSize ? current : nextPageSize));
    };

    updateDynamicPageSize();

    const resizeObserver = new ResizeObserver(() => {
      updateDynamicPageSize();
    });

    if (overviewPanelRef.current) {
      resizeObserver.observe(overviewPanelRef.current);
    }
    if (skillsListRef.current) {
      resizeObserver.observe(skillsListRef.current);
    }

    window.addEventListener("resize", updateDynamicPageSize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateDynamicPageSize);
    };
  }, [props.viewMode, filteredSkills.length, page]);

  const handleCopy = (): void => {
    if (!props.selectedSkill) {
      return;
    }
    void navigator.clipboard.writeText(props.selectedSkill.content).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  if (props.isLoading && !props.report) {
    return (
      <section className="glass-panel form-panel empty-state">
        <div className="section-title">{t(props.locale, "skills")}</div>
        <p>{t(props.locale, "skillsLoading")}</p>
      </section>
    );
  }

  if (!props.report) {
    return (
      <section className="glass-panel form-panel empty-state">
        <div className="section-title">{t(props.locale, "skills")}</div>
        <p>{t(props.locale, "skillsEmpty")}</p>
      </section>
    );
  }

  return (
    <section className="skills-workspace">
      <section className="glass-panel form-panel skills-overview-panel" ref={overviewPanelRef}>
        <div className="skills-detail-header">
          <div className="skills-header-main">
            <div className="section-title">{t(props.locale, "skills")}</div>
            <div className="skills-path-caption">{props.selectedPath?.path ?? t(props.locale, "overviewNone")}</div>
          </div>
          <div className="skills-detail-badges">
            <div className="skills-view-toggle" role="tablist" aria-label={t(props.locale, "skillsViewMode")}>
              <button
                className={props.viewMode === "grid" ? "skills-view-button active" : "skills-view-button"}
                type="button"
                onClick={() => props.onViewModeChange("grid")}
                aria-pressed={props.viewMode === "grid"}
                title={t(props.locale, "skillsViewGrid")}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                className={props.viewMode === "list" ? "skills-view-button active" : "skills-view-button"}
                type="button"
                onClick={() => props.onViewModeChange("list")}
                aria-pressed={props.viewMode === "list"}
                title={t(props.locale, "skillsViewList")}
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        <label className="skills-search-field">
          <input
            type="search"
            value={searchQuery}
            placeholder={t(props.locale, "skillsSearchPlaceholder")}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>

        {props.selectedPath && !isSkillPathLoaded(props.selectedPath) ? (
          <p className="skills-note skills-note-warning">{formatSkillPathNotice(props.locale, props.selectedPath)}</p>
        ) : null}

        {filteredSkills.length ? (
          <>
            <div className="skills-pagination">
              <span className="skills-pagination-info">
                {formatMessage(t(props.locale, "skillsPagination"), {
                  current: page,
                  total: totalPages,
                  count: filteredSkills.length,
                })}
              </span>
              <div className="skills-pagination-actions">
                <button
                  className="action-button compact"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {t(props.locale, "previousPage")}
                </button>
                <button
                  className="action-button compact"
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  {t(props.locale, "nextPage")}
                </button>
              </div>
            </div>
            <div
              className={props.viewMode === "grid" ? "skills-read-grid" : "skills-read-list"}
              role="list"
              style={gridStyle}
              ref={skillsListRef}
            >
              {pagedSkills.map((skill) => (
                <button
                  key={skill.id}
                  className={[
                    props.viewMode === "grid" ? "skills-read-card" : "skills-read-row",
                    skill.id === props.selectedSkill?.id ? "active" : "",
                    skill.enabled ? "is-enabled" : "is-disabled",
                    skill.effective ? "" : "muted",
                  ].filter(Boolean).join(" ")}
                  type="button"
                  onClick={() => props.onSelectSkill(skill.id)}
                >
                  <div className={props.viewMode === "grid" ? "skills-read-card-top" : "skills-read-row-main"}>
                    <div className="skills-read-row-header">
                      <span className="list-current-badge">{skill.metadata.type}</span>
                      <strong>{skill.name}</strong>
                    </div>
                    <p>{skill.metadata.description}</p>
                    {props.viewMode === "list" ? (
                      <div className="skills-read-row-folder">{skill.directoryName}</div>
                    ) : null}
                  </div>
                  {props.viewMode === "grid" ? (
                    <div className="skills-read-card-meta">
                      <div className="skills-read-row-folder">{skill.directoryName}</div>
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : props.visibleSkills.length ? (
          <div className="skills-empty-issues">{t(props.locale, "skillsEmptySearch")}</div>
        ) : (
          <div className="skills-empty-issues">{t(props.locale, "skillsEmptyInDirectory")}</div>
        )}
      </section>
      {props.selectedSkill ? (
        <SkillsDetailDialog
          locale={props.locale}
          skill={props.selectedSkill}
          copied={copied}
          onCopy={handleCopy}
          onClose={() => props.onSelectSkill("")}
        />
      ) : null}
    </section>
  );
}

function SkillsDetailDialog(props: {
  locale: Locale;
  skill: SkillEntry;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}): JSX.Element {
  useDialogEscape(props.onClose);
  const detailItems = [
    { label: t(props.locale, "skillsSource"), value: props.skill.sourceLabel },
    { label: t(props.locale, "skillsDirectory"), value: props.skill.directoryPath },
    { label: t(props.locale, "skillsFrontmatter"), value: props.skill.frontmatter ? t(props.locale, "overviewOn") : t(props.locale, "overviewOff") },
    { label: t(props.locale, "skillsLineCount"), value: String(props.skill.lineCount) },
    { label: t(props.locale, "skillsAttachments"), value: formatSkillAssets(props.locale, props.skill) },
    ...(props.skill.overriddenBy
      ? [{ label: t(props.locale, "skillsOverrideTarget"), value: props.skill.overriddenBy }]
      : []),
    ...(props.skill.metadata.license
      ? [{ label: "license", value: props.skill.metadata.license }]
      : []),
    ...(props.skill.metadata.compatibility
      ? [{ label: "compatibility", value: props.skill.metadata.compatibility }]
      : []),
    ...(Object.keys(props.skill.metadata.metadata).length > 0
      ? [{
          label: "metadata",
          value: Object.entries(props.skill.metadata.metadata).map(([key, value]) => `${key}: ${value}`).join(" · "),
        }]
      : []),
  ];

  return createPortal(
    <div
      className="skills-detail-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <section className="skills-detail-dialog glass-panel" role="dialog" aria-modal="true" aria-labelledby="skills-detail-dialog-title">
        <div className="skills-detail-dialog-header">
          <div className="skills-detail-dialog-copy">
            <div className="skills-detail-dialog-title-row">
              <span className="list-current-badge">{props.skill.metadata.type}</span>
              <h3 id="skills-detail-dialog-title">{props.skill.name}</h3>
            </div>
            {props.skill.metadata.description ? (
              <p className="skills-detail-dialog-description">{props.skill.metadata.description}</p>
            ) : null}
          </div>
          <div className="document-viewer-actions">
            <button className="action-button compact icon-only" type="button" aria-label={t(props.locale, "close")} onClick={props.onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="skills-detail-summary-grid">
          {detailItems.map((item) => (
            <div
              key={`${item.label}-${item.value}`}
              className={[
                "skills-kv",
                "skills-kv-compact",
                item.value.includes(" · ") || item.value.includes(": ") ? "skills-kv-multiline" : "",
              ].filter(Boolean).join(" ")}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <CodePanel
          title={props.skill.skillFilePath}
          content={props.skill.content}
          onCopy={props.onCopy}
          copied={props.copied}
        />
      </section>
    </div>,
    document.body,
  );
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

function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

function formatSkillAssets(locale: Locale, skill: SkillEntry): string {
  const labels = [
    skill.hasScripts ? "scripts" : "",
    skill.hasReferences ? "references" : "",
    skill.hasAssets ? "assets" : "",
  ].filter(Boolean);
  return labels.join(" · ") || t(locale, "overviewNone");
}

function isSkillPathLoaded(path: SkillsScanReport["paths"][number]): boolean {
  return path.group !== "builtin" && path.exists && path.selected;
}

function formatSkillPathNotice(locale: Locale, path: SkillsScanReport["paths"][number]): string {
  if (path.group === "builtin") {
    return t(locale, "skillsPathNoticeBuiltin");
  }
  if (!path.exists) {
    return t(locale, "skillsPathNoticeMissing");
  }
  if (!path.selected) {
    return t(locale, "skillsPathNoticeSkipped");
  }
  return "";
}
