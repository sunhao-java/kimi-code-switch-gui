import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bug, ExternalLink, Github, History, LoaderCircle, Mail, RefreshCw } from "lucide-react";

import type { Locale } from "@shared/types";

import { t } from "./i18n";
import logoLight from "./assets/logo-light.png";
import logoDark from "./assets/logo-dark.png";

type InstallSource = "homebrew" | "manual" | "development";

interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseName: string;
  publishedAt: string;
  homebrewCommand: string;
  installSource?: InstallSource;
  errorMessage?: string;
}

const ABOUT_INFO = {
  version: "1.1.0",
  author: "Hulk Sun",
  license: "MIT",
  repositoryUrl: "https://github.com/sunhao-java/kimi-code-switch-gui",
  issuesUrl: "https://github.com/sunhao-java/kimi-code-switch-gui/issues",
  authorBlogUrl: "https://www.crazy-coder.cn",
  contactEmail: "sunhao.java@gmail.com",
};

const PENDING_UPDATE_VERSION_STORAGE_KEY = "kimi-switch.pending-update-version";
const UPDATE_CHECK_COOLDOWN_MS = 30 * 1000;

function getApi() {
  return typeof window !== "undefined" ? window.kimiSwitch : undefined;
}

function normalizeReleaseVersion(value: string): string {
  return value.trim().replace(/^v/i, "");
}

function compareReleaseVersions(left: string, right: string): number {
  const leftParts = normalizeReleaseVersion(left).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeReleaseVersion(right).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

function loadPendingUpdateVersion(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(PENDING_UPDATE_VERSION_STORAGE_KEY) ?? "";
}

function savePendingUpdateVersion(version: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedVersion = normalizeReleaseVersion(version);
  if (!normalizedVersion) {
    window.localStorage.removeItem(PENDING_UPDATE_VERSION_STORAGE_KEY);
    return;
  }

  const storedVersion = loadPendingUpdateVersion();
  const nextVersion =
    storedVersion && compareReleaseVersions(storedVersion, normalizedVersion) > 0
      ? storedVersion
      : normalizedVersion;

  window.localStorage.setItem(PENDING_UPDATE_VERSION_STORAGE_KEY, nextVersion);
}

function clearPendingUpdateVersion(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PENDING_UPDATE_VERSION_STORAGE_KEY);
}

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the selection-based copy path.
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
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

function formatInstallSource(locale: Locale, source: InstallSource | "unknown"): string {
  const isZh = locale === "zh-CN";
  if (source === "homebrew") {
    return isZh ? "Homebrew" : "Homebrew";
  }
  if (source === "manual") {
    return isZh ? "手动安装" : "Manual";
  }
  if (source === "development") {
    return isZh ? "开发构建" : "Development";
  }
  return isZh ? "检测中" : "Detecting";
}

function getUpdateDescription(locale: Locale, result: UpdateCheckResult, hasUpdate: boolean, hasError: boolean): string {
  const isZh = locale === "zh-CN";
  if (hasError) {
    return isZh
      ? `当前版本 v${result.currentVersion}。检查更新时发生错误：${result.errorMessage}`
      : `You're on v${result.currentVersion}. The update check failed: ${result.errorMessage}`;
  }

  if (!hasUpdate) {
    return isZh
      ? `当前版本 v${result.currentVersion}，未检测到更新。`
      : `You're on v${result.currentVersion}. No newer release was found.`;
  }

  if (result.installSource === "homebrew") {
    return isZh
      ? `当前版本 v${result.currentVersion}，最新版本 ${result.releaseName}。建议通过 Homebrew 更新。`
      : `You're on v${result.currentVersion}. The latest release is ${result.releaseName}. Update via Homebrew.`;
  }
  if (result.installSource === "development") {
    return isZh
      ? `当前版本 v${result.currentVersion}，最新版本 ${result.releaseName}。当前是开发构建，请前往 GitHub Release 页面查看正式版本。`
      : `You're on v${result.currentVersion}. The latest release is ${result.releaseName}. This is a development build, so check the GitHub release page for the packaged app.`;
  }
  return isZh
    ? `当前版本 v${result.currentVersion}，最新版本 ${result.releaseName}。请前往 GitHub Release 页面下载安装包。`
    : `You're on v${result.currentVersion}. The latest release is ${result.releaseName}. Download the installer from the GitHub release page.`;
}

function UpdateDialog(props: {
  locale: Locale;
  result: UpdateCheckResult;
  copiedCommand: boolean;
  copiedReleaseUrl: boolean;
  onCopyCommand: () => void;
  onOpenRelease: () => void;
  onClose: () => void;
}): JSX.Element {
  useDialogEscape(props.onClose);

  const isZh = props.locale === "zh-CN";
  const hasError = Boolean(props.result.errorMessage);
  const hasUpdate = props.result.hasUpdate || compareReleaseVersions(props.result.latestVersion, props.result.currentVersion) > 0;
  const isUpToDate = !hasError && !hasUpdate;
  const title = hasError
    ? (isZh ? "检查更新失败" : "Update Check Failed")
    : hasUpdate
      ? (isZh ? "发现新版本" : "Update Available")
      : (isZh ? "当前已是最新版本" : "You're Up to Date");
  const description = getUpdateDescription(props.locale, props.result, hasUpdate, hasError);
  const showHomebrewCommand = hasUpdate && props.result.installSource === "homebrew";

  return createPortal(
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <section
        className={isUpToDate ? "confirm-dialog update-dialog update-dialog-compact glass-panel" : "confirm-dialog update-dialog glass-panel"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
      >
        <div className="confirm-dialog-header update-dialog-header">
          <div className="confirm-dialog-icon update-dialog-icon">
            <RefreshCw size={20} />
          </div>
          <div className="confirm-dialog-copy update-dialog-copy">
            <div className="update-dialog-title-row">
              <h3 id="update-dialog-title">{title}</h3>
              {hasUpdate ? (
                <span className="update-dialog-badge">
                  {isZh ? "建议更新" : "Update Recommended"}
                </span>
              ) : null}
            </div>
            {!isUpToDate ? (
              <div className="update-dialog-version-row">
                <div className="update-dialog-version-card">
                  <span>{isZh ? "当前版本" : "Current"}</span>
                  <strong>v{props.result.currentVersion}</strong>
                </div>
                <div className="update-dialog-version-separator" aria-hidden="true">
                  →
                </div>
                <div className="update-dialog-version-card">
                  <span>{isZh ? "最新版本" : "Latest"}</span>
                  <strong>v{props.result.latestVersion}</strong>
                </div>
              </div>
            ) : null}
            <p>{description}</p>
            {showHomebrewCommand ? (
              <div className="update-dialog-command-block">
                <span className="update-dialog-command-label">
                  {isZh ? "Homebrew 更新命令" : "Homebrew Upgrade Command"}
                </span>
                <code>{props.result.homebrewCommand}</code>
              </div>
            ) : null}
            {hasError ? (
              <div className="update-dialog-error-tip">
                {isZh ? "你也可以直接打开 GitHub Release 页面手动查看最新版本。" : "You can also open the GitHub Releases page and check manually."}
              </div>
            ) : null}
          </div>
        </div>
        <div className="confirm-dialog-actions update-dialog-actions">
          {showHomebrewCommand ? (
            <button className="action-button update-dialog-button" type="button" onClick={props.onCopyCommand}>
              {props.copiedCommand ? (isZh ? "已复制命令" : "Copied") : (isZh ? "复制 Homebrew 命令" : "Copy Homebrew Command")}
            </button>
          ) : null}
          {hasUpdate || hasError ? (
            <button className="action-button action-button-primary update-dialog-button" type="button" onClick={props.onOpenRelease}>
              {props.copiedReleaseUrl
                ? (isZh ? "已复制 Release 链接" : "Release URL Copied")
                : (isZh ? "打开 GitHub Release" : "Open GitHub Release")}
            </button>
          ) : null}
          <button
            className={isUpToDate ? "action-button action-button-primary update-dialog-button" : "action-button update-dialog-button"}
            type="button"
            onClick={props.onClose}
          >
            {t(props.locale, "close")}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function AboutPage(props: {
  locale: Locale;
}): JSX.Element {
  const isZh = props.locale === "zh-CN";
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateCheckCooldownUntil, setUpdateCheckCooldownUntil] = useState(0);
  const [cooldownRemainingSeconds, setCooldownRemainingSeconds] = useState(0);
  const [updateDialog, setUpdateDialog] = useState<UpdateCheckResult | null>(null);
  const [copiedUpdateCommand, setCopiedUpdateCommand] = useState(false);
  const [copiedReleaseUrl, setCopiedReleaseUrl] = useState(false);
  const [installSource, setInstallSource] = useState<InstallSource | "unknown">("unknown");
  const [pendingUpdateVersion, setPendingUpdateVersion] = useState(() => loadPendingUpdateVersion());
  const links = [
    {
      icon: Github,
      label: isZh ? "GitHub 地址" : "GitHub",
      value: ABOUT_INFO.repositoryUrl,
    },
    {
      icon: Bug,
      label: isZh ? "提 Issue" : "Report Issues",
      value: ABOUT_INFO.issuesUrl,
    },
    {
      icon: ExternalLink,
      label: isZh ? "作者博客" : "Author Blog",
      value: ABOUT_INFO.authorBlogUrl,
    },
    {
      icon: Mail,
      label: isZh ? "联系邮箱" : "Contact Email",
      value: `mailto:${ABOUT_INFO.contactEmail}`,
      displayValue: ABOUT_INFO.contactEmail,
    },
  ];
  const history = [
    {
      version: "v1.1.0",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.1.0`,
      text: isZh
        ? "新增发布更新闭环，支持按安装来源提示更新方式；同时拆分渲染层大文件，提升 App.tsx 可维护性，并修复外链与空值类型边界问题。"
        : "Added the release update loop with install-source-aware guidance; split renderer modules for a more maintainable App.tsx, and fixed external-link and nullable-state boundaries.",
    },
    {
      version: "v1.0.4",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.4`,
      text: isZh
        ? "新增托盘语言与主题快捷切换，补齐备份恢复能力，并继续优化 Skills 工作区浏览、详情展示和 frontmatter 解析兼容性。"
        : "Added tray shortcuts for language and theme switching, introduced backup restore support, and further refined the Skills workspace, detail presentation, and frontmatter parsing compatibility.",
    },
    {
      version: "v1.0.3",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.3`,
      text: isZh
        ? "重构 Skills 工作区与详情查看体验，新增界面字体大小设置，统一 Skills 自动发现流程，并修复多个页面无法打开与内容区高度未撑满的问题。"
        : "Refined the Skills workspace and detail viewer, added interface font size settings, unified Skills auto discovery, and fixed multi-page navigation crashes plus the workspace height fill issue.",
    },
    {
      version: "v1.0.2",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.2`,
      text: isZh
        ? "补齐备份记录查看与删除流程，修复 MCP 面板配置反复写入导致的结构与缩进异常，并更新项目文档介绍。"
        : "Added backup record viewing and deletion, fixed repeated MCP panel writes causing structure and indentation issues, and refreshed the project documentation overview.",
    },
    {
      version: "v1.0.1",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.1`,
      text: isZh
        ? "集中优化设置页、首页总览和 MCP 管理交互，并更新整套透明品牌 Logo 与 macOS 图标资源。"
        : "Polished settings, overview, and MCP management flows, and refreshed the transparent brand logo and macOS icon assets.",
    },
    {
      version: "v1.0.0",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.0`,
      text: isZh
        ? "首个桌面版本，包含 Provider、Model、Profile 管理、配置预览与 Diff、状态栏菜单，以及修复后的 GitHub Release 发布流程。"
        : "Initial desktop release with Provider, Model, Profile management, config preview, diff, tray menu, and the fixed GitHub Release pipeline.",
    },
  ];
  const visibleHistory = history.slice(0, 3);
  const hasPendingUpdate =
    pendingUpdateVersion.length > 0 && compareReleaseVersions(pendingUpdateVersion, ABOUT_INFO.version) > 0;
  const isCheckOnCooldown = cooldownRemainingSeconds > 0;

  useEffect(() => {
    const api = getApi();
    if (!api?.getInstallSource) {
      return;
    }

    void api.getInstallSource()
      .then((source) => setInstallSource(source))
      .catch(() => setInstallSource("unknown"));
  }, []);

  useEffect(() => {
    if (!updateCheckCooldownUntil) {
      setCooldownRemainingSeconds(0);
      return;
    }

    const updateRemaining = (): void => {
      const remaining = Math.max(0, Math.ceil((updateCheckCooldownUntil - Date.now()) / 1000));
      setCooldownRemainingSeconds(remaining);
      if (remaining <= 0) {
        setUpdateCheckCooldownUntil(0);
      }
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(intervalId);
  }, [updateCheckCooldownUntil]);

  useEffect(() => {
    if (!pendingUpdateVersion) {
      return;
    }

    if (compareReleaseVersions(pendingUpdateVersion, ABOUT_INFO.version) <= 0) {
      clearPendingUpdateVersion();
      setPendingUpdateVersion("");
    }
  }, [pendingUpdateVersion]);

  const openRelease = (url: string): void => {
    const api = getApi();
    const openTask = api?.openExternal ? api.openExternal(url) : Promise.reject(new Error("Open external unavailable"));
    void openTask.catch(() => {
      void copyText(url).then((copied) => {
        if (!copied) {
          return;
        }
        setCopiedReleaseUrl(true);
        window.setTimeout(() => setCopiedReleaseUrl(false), 1800);
      });
    });
  };

  const handleCheckUpdates = (): void => {
    const api = getApi();
    if (!api?.checkForUpdates || isCheckingUpdate || isCheckOnCooldown) {
      return;
    }

    setIsCheckingUpdate(true);
    setUpdateCheckCooldownUntil(Date.now() + UPDATE_CHECK_COOLDOWN_MS);
    void api.checkForUpdates()
      .then((result) => {
        const shouldMarkPending = result.hasUpdate || compareReleaseVersions(result.latestVersion, result.currentVersion) > 0;

        setInstallSource(result.installSource ?? installSource);
        if (shouldMarkPending) {
          savePendingUpdateVersion(result.latestVersion);
          setPendingUpdateVersion((current) => {
            if (!current || compareReleaseVersions(result.latestVersion, current) > 0) {
              return normalizeReleaseVersion(result.latestVersion);
            }
            return current;
          });
        }
        setCopiedUpdateCommand(false);
        setCopiedReleaseUrl(false);
        setUpdateDialog(result);
      })
      .catch((error) => {
        const rawMessage = error instanceof Error ? error.message : String(error);
        const message = rawMessage.includes("GitHub API rate limit exceeded")
          ? (isZh
            ? "GitHub 请求已被限流，请前往 GitHub Release 页面手动查看最新版本。"
            : "GitHub rate limit exceeded. Please open the GitHub Releases page and check manually.")
          : rawMessage;
        setUpdateDialog({
          currentVersion: ABOUT_INFO.version,
          latestVersion: ABOUT_INFO.version,
          hasUpdate: false,
          releaseUrl: `${ABOUT_INFO.repositoryUrl}/releases`,
          releaseName: "",
          publishedAt: "",
          homebrewCommand: "brew upgrade --cask kimi-code-switch-gui",
          installSource: installSource === "unknown" ? undefined : installSource,
          errorMessage: message,
        });
      })
      .finally(() => {
        setIsCheckingUpdate(false);
      });
  };

  return (
    <section className="glass-panel about-page">
      <div className="about-hero">
        <div className="about-logo">
          <img className="brand-logo brand-logo-light" src={logoLight} alt="Kimi Code Switch" />
          <img className="brand-logo brand-logo-dark" src={logoDark} alt="Kimi Code Switch" />
        </div>
        <div>
          <p className="about-eyebrow">{t(props.locale, "about")}</p>
          <h2>Kimi Code Switch GUI</h2>
          <p>
            {isZh
              ? "用于管理 kimi-code-cli 配置的桌面工具。"
              : "Desktop app for managing kimi-code-cli configuration."}
          </p>
          <p className="about-meta-summary">
            {isZh
              ? `作者：${ABOUT_INFO.author} · 许可证：${ABOUT_INFO.license} · 安装来源：${formatInstallSource(props.locale, installSource)}`
              : `Author: ${ABOUT_INFO.author} · License: ${ABOUT_INFO.license} · Source: ${formatInstallSource(props.locale, installSource)}`}
          </p>
        </div>
        <div className="about-version-actions">
          <span className="about-version-wrap">
            <span className={hasPendingUpdate ? "about-version has-update" : "about-version"}>
              <span>v{ABOUT_INFO.version}</span>
              {hasPendingUpdate ? <span className="about-version-status-dot" aria-hidden="true" /> : null}
            </span>
          </span>
          <button
            className={isCheckingUpdate ? "action-button compact is-loading" : "action-button compact"}
            type="button"
            onClick={handleCheckUpdates}
            disabled={isCheckingUpdate || isCheckOnCooldown}
          >
            {isCheckingUpdate ? <LoaderCircle size={14} className="button-spinner" /> : <RefreshCw size={14} />}
            <span>
              {isCheckingUpdate
                ? (isZh ? "检查中" : "Checking")
                : isCheckOnCooldown
                  ? (isZh ? `${cooldownRemainingSeconds}s 后重试` : `Retry in ${cooldownRemainingSeconds}s`)
                  : (isZh ? "检查更新" : "Check Updates")}
            </span>
          </button>
        </div>
      </div>

      <div className="about-grid">
        <section className="about-section about-section-wide">
          <div className="section-title">
            <ExternalLink size={16} />
            <span>{isZh ? "项目链接" : "Project Links"}</span>
          </div>
          <div className="about-link-list">
            {links.map(({ icon: Icon, label, value, displayValue }) => (
              <button
                key={label}
                className="about-link-item"
                type="button"
                onClick={() => openRelease(value)}
              >
                <span className="about-link-icon"><Icon size={16} /></span>
                <span>{label}</span>
                <code>{displayValue ?? value}</code>
              </button>
            ))}
          </div>
        </section>

        <section className="about-section about-section-wide">
          <div className="section-title">
            <History size={16} />
            <span>{isZh ? "版本历史" : "Version History"}</span>
          </div>
          <div className="about-history">
            {visibleHistory.map((item) => (
              <div key={item.version} className="about-history-item">
                <span className="about-history-version">
                  <strong>{item.version}</strong>
                  <button
                    className="about-history-link"
                    type="button"
                    aria-label={`${item.version} release`}
                    onClick={() => openRelease(item.url)}
                  >
                    <ExternalLink size={13} />
                  </button>
                </span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      {updateDialog ? (
        <UpdateDialog
          locale={props.locale}
          result={updateDialog}
          copiedCommand={copiedUpdateCommand}
          copiedReleaseUrl={copiedReleaseUrl}
          onCopyCommand={() => {
            void copyText(updateDialog.homebrewCommand).then((copied) => {
              if (!copied) {
                return;
              }

              setCopiedUpdateCommand(true);
              window.setTimeout(() => setCopiedUpdateCommand(false), 1800);
            });
          }}
          onOpenRelease={() => openRelease(updateDialog.releaseUrl)}
          onClose={() => {
            setCopiedUpdateCommand(false);
            setCopiedReleaseUrl(false);
            setUpdateDialog(null);
          }}
        />
      ) : null}
    </section>
  );
}
