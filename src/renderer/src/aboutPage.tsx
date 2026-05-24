import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bug, Check, ExternalLink, Github, History, LoaderCircle, Mail, RefreshCw } from "lucide-react";

import { compareReleaseVersions, normalizeReleaseVersion } from "@shared/versionUtils";
import type { Locale } from "@shared/types";

import { t } from "./i18n";
import { toTraditionalChinese } from "./localeText";
import logoLight from "./assets/logo-light.png";
import logoDark from "./assets/logo-dark.png";

type InstallSource = "homebrew" | "manual" | "development";
type UpdateDialogPreviewKind = "error" | "available-homebrew" | "available-manual" | "current";

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

export const ABOUT_INFO = {
  version: "1.1.8",
  author: "Hulk Sun",
  license: "MIT",
  repositoryUrl: "https://github.com/sunhao-java/kimi-code-switch-gui",
  issuesUrl: "https://github.com/sunhao-java/kimi-code-switch-gui/issues",
  authorBlogUrl: "https://www.crazy-coder.cn",
  contactEmail: "sunhao.java@gmail.com",
};

const PENDING_UPDATE_VERSION_STORAGE_KEY = "kimi-switch.pending-update-version";
const UPDATE_CHECK_COOLDOWN_MS = 30 * 1000;

function aboutText(
  locale: Locale,
  key: string,
  values: Record<string, string | number> = {},
): string {
  const dictionary: Record<string, Record<Locale, string>> = {
    installManual: {
      "zh-CN": "手动安装",
      "zh-TW": toTraditionalChinese("手动安装"),
      "en-US": "Manual",
      "ja-JP": "手動インストール",
      "de-DE": "Manuell",
      "es-ES": "Manual",
    },
    installDevelopment: {
      "zh-CN": "开发构建",
      "zh-TW": toTraditionalChinese("开发构建"),
      "en-US": "Development",
      "ja-JP": "開発ビルド",
      "de-DE": "Entwicklungsbuild",
      "es-ES": "Compilación de desarrollo",
    },
    installDetecting: {
      "zh-CN": "检测中",
      "zh-TW": toTraditionalChinese("检测中"),
      "en-US": "Detecting",
      "ja-JP": "検出中",
      "de-DE": "Wird erkannt",
      "es-ES": "Detectando",
    },
    aboutDescription: {
      "zh-CN": "用于管理 kimi-code-cli 配置的桌面工具。",
      "zh-TW": toTraditionalChinese("用于管理 kimi-code-cli 配置的桌面工具。"),
      "en-US": "Desktop app for managing kimi-code-cli configuration.",
      "ja-JP": "kimi-code-cli の設定を管理するデスクトップアプリです。",
      "de-DE": "Desktop-App zum Verwalten der kimi-code-cli-Konfiguration.",
      "es-ES": "Aplicación de escritorio para gestionar la configuración de kimi-code-cli.",
    },
    aboutMeta: {
      "zh-CN": "作者：{author} · 许可证：{license} · 安装来源：{source}",
      "zh-TW": toTraditionalChinese("作者：{author} · 许可证：{license} · 安装来源：{source}"),
      "en-US": "Author: {author} · License: {license} · Source: {source}",
      "ja-JP": "作者: {author} · ライセンス: {license} · インストール元: {source}",
      "de-DE": "Autor: {author} · Lizenz: {license} · Quelle: {source}",
      "es-ES": "Autor: {author} · Licencia: {license} · Origen: {source}",
    },
    updatePreviewTitle: {
      "zh-CN": "更新弹框预览",
      "zh-TW": toTraditionalChinese("更新弹框预览"),
      "en-US": "Update Dialog Preview",
      "ja-JP": "更新ダイアログのプレビュー",
      "de-DE": "Update-Dialog Vorschau",
      "es-ES": "Vista previa del diálogo de actualización",
    },
    updatePreviewDescription: {
      "zh-CN": "不依赖真实网络结果，直接查看几种典型状态下的弹框效果。",
      "zh-TW": toTraditionalChinese("不依赖真实网络结果，直接查看几种典型状态下的弹框效果。"),
      "en-US": "Open representative dialog states without relying on the live network result.",
      "ja-JP": "実際のネットワーク結果に依存せず、代表的な状態のダイアログを確認できます。",
      "de-DE": "Zeigt typische Dialogzustände ohne Live-Netzwerkergebnis an.",
      "es-ES": "Abre estados representativos del diálogo sin depender del resultado real de red.",
    },
    previewFailure: {
      "zh-CN": "预览失败态",
      "zh-TW": toTraditionalChinese("预览失败态"),
      "en-US": "Preview Failure",
      "ja-JP": "失敗状態をプレビュー",
      "de-DE": "Fehlerzustand anzeigen",
      "es-ES": "Vista de fallo",
    },
    previewHomebrewUpdate: {
      "zh-CN": "预览 Homebrew 更新",
      "zh-TW": toTraditionalChinese("预览 Homebrew 更新"),
      "en-US": "Preview Homebrew Update",
      "ja-JP": "Homebrew 更新をプレビュー",
      "de-DE": "Homebrew-Update anzeigen",
      "es-ES": "Vista de actualización Homebrew",
    },
    previewManualUpdate: {
      "zh-CN": "预览手动更新",
      "zh-TW": toTraditionalChinese("预览手动更新"),
      "en-US": "Preview Manual Update",
      "ja-JP": "手動更新をプレビュー",
      "de-DE": "Manuelles Update anzeigen",
      "es-ES": "Vista de actualización manual",
    },
    previewCurrent: {
      "zh-CN": "预览已最新",
      "zh-TW": toTraditionalChinese("预览已最新"),
      "en-US": "Preview Up To Date",
      "ja-JP": "最新状態をプレビュー",
      "de-DE": "Aktuellen Zustand anzeigen",
      "es-ES": "Vista de versión actualizada",
    },
    projectLinks: {
      "zh-CN": "项目链接",
      "zh-TW": toTraditionalChinese("项目链接"),
      "en-US": "Project Links",
      "ja-JP": "プロジェクトリンク",
      "de-DE": "Projektlinks",
      "es-ES": "Enlaces del proyecto",
    },
    githubLink: {
      "zh-CN": "GitHub 地址",
      "zh-TW": toTraditionalChinese("GitHub 地址"),
      "en-US": "GitHub",
      "ja-JP": "GitHub",
      "de-DE": "GitHub",
      "es-ES": "GitHub",
    },
    reportIssues: {
      "zh-CN": "提 Issue",
      "zh-TW": toTraditionalChinese("提 Issue"),
      "en-US": "Report Issues",
      "ja-JP": "Issue を報告",
      "de-DE": "Issues melden",
      "es-ES": "Reportar incidencias",
    },
    authorBlog: {
      "zh-CN": "作者博客",
      "zh-TW": toTraditionalChinese("作者博客"),
      "en-US": "Author Blog",
      "ja-JP": "作者ブログ",
      "de-DE": "Autorenblog",
      "es-ES": "Blog del autor",
    },
    contactEmail: {
      "zh-CN": "联系邮箱",
      "zh-TW": toTraditionalChinese("联系邮箱"),
      "en-US": "Contact Email",
      "ja-JP": "連絡先メール",
      "de-DE": "Kontakt-E-Mail",
      "es-ES": "Correo de contacto",
    },
    versionHistory: {
      "zh-CN": "版本历史",
      "zh-TW": toTraditionalChinese("版本历史"),
      "en-US": "Version History",
      "ja-JP": "バージョン履歴",
      "de-DE": "Versionsverlauf",
      "es-ES": "Historial de versiones",
    },
    previewRateLimitError: {
      "zh-CN": "GitHub 请求已被限流，已切换到手动查看模式。",
      "zh-TW": toTraditionalChinese("GitHub 请求已被限流，已切换到手动查看模式。"),
      "en-US": "GitHub API rate limit exceeded. Please check the release page manually.",
      "ja-JP": "GitHub API のレート制限に達しました。Release ページを手動で確認してください。",
      "de-DE": "GitHub-API-Rate-Limit überschritten. Bitte prüfe die Release-Seite manuell.",
      "es-ES": "Se superó el límite de la API de GitHub. Revisa la página de releases manualmente.",
    },
    historyV117: {
      "zh-CN": "恢复发布流水线依赖的 Homebrew cask 渲染脚本，修复 tag 发布后 tap 更新阶段失败的问题。",
      "zh-TW": toTraditionalChinese("恢复发布流水线依赖的 Homebrew cask 渲染脚本，修复 tag 发布后 tap 更新阶段失败的问题。"),
      "en-US": "Restored the Homebrew cask rendering script required by the release workflow, fixing tap update failures after tag releases.",
      "ja-JP": "リリースワークフローに必要な Homebrew cask 生成スクリプトを復元し、タグ公開後の tap 更新失敗を修正しました。",
      "de-DE": "Stellt das für den Release-Workflow benötigte Homebrew-Cask-Rendering-Skript wieder her und behebt Tap-Update-Fehler nach Tag-Releases.",
      "es-ES": "Restaura el script de renderizado del cask de Homebrew requerido por el flujo de release y corrige fallos al actualizar el tap tras publicar tags.",
    },
    historyV116: {
      "zh-CN": "新增更新检查、配置导入导出、Profile 对比、全局搜索、快捷切换和变更历史，并修复跨机器恢复 Profile、托盘图标开关立即生效及错误边界测试问题。",
      "zh-TW": toTraditionalChinese("新增更新检查、配置导入导出、Profile 对比、全局搜索、快捷切换和变更历史，并修复跨机器恢复 Profile、托盘图标开关立即生效及错误边界测试问题。"),
      "en-US": "Added update controls, config import/export, Profile comparison, global search, quick switch, and change history, with fixes for cross-machine Profile restore, immediate tray toggling, and ErrorBoundary tests.",
      "ja-JP": "更新操作、設定のインポート/エクスポート、Profile 比較、グローバル検索、クイックスイッチ、変更履歴を追加し、別マシン復元時の Profile、トレイ切り替え、ErrorBoundary テストを修正しました。",
      "de-DE": "Ergänzt Update-Steuerung, Konfigurationsimport/-export, Profilvergleich, globale Suche, Schnellwechsel und Änderungsverlauf sowie Fixes für Profilwiederherstellung, Tray-Umschaltung und ErrorBoundary-Tests.",
      "es-ES": "Añade controles de actualización, importación/exportación, comparación de perfiles, búsqueda global, cambio rápido e historial, y corrige restauración de perfiles, bandeja y pruebas de ErrorBoundary.",
    },
    historyV115: {
      "zh-CN": "修复 Homebrew 打包后 iTerm2 打开 Kimi 依赖 System Events 发送按键导致权限失败的问题。",
      "zh-TW": toTraditionalChinese("修复 Homebrew 打包后 iTerm2 打开 Kimi 依赖 System Events 发送按键导致权限失败的问题。"),
      "en-US": "Fixed iTerm2 launch failures in Homebrew builds by avoiding System Events simulated keystrokes.",
      "ja-JP": "Homebrew ビルドで iTerm2 起動時に System Events の疑似キー入力へ依存して権限エラーになる問題を修正しました。",
      "de-DE": "Behebt iTerm2-Startfehler in Homebrew-Builds, indem simulierte System-Events-Tastatureingaben vermieden werden.",
      "es-ES": "Corrige fallos al abrir iTerm2 en builds de Homebrew evitando pulsaciones simuladas con System Events.",
    },
    historyV114: {
      "zh-CN": "新增侧边栏展开/收缩状态持久化，面板会在下次启动时恢复上一次的侧边栏状态。",
      "zh-TW": toTraditionalChinese("新增侧边栏展开/收缩状态持久化，面板会在下次启动时恢复上一次的侧边栏状态。"),
      "en-US": "Persisted the sidebar expanded/collapsed state so the panel restores the previous sidebar state on next launch.",
      "ja-JP": "サイドバーの展開/折りたたみ状態を保存し、次回起動時に復元するようにしました。",
      "de-DE": "Speichert den ausgeklappten/eingeklappten Zustand der Seitenleiste und stellt ihn beim nächsten Start wieder her.",
      "es-ES": "Persiste el estado expandido/contraído de la barra lateral para restaurarlo al iniciar de nuevo.",
    },
    historyV113: {
      "zh-CN": "修复正式打包环境下 preload 初始化主题时 documentElement 为空导致 API 注入失败的问题，解决启动后提示 Electron preload API 不可用的严重回归。",
      "zh-TW": toTraditionalChinese("修复正式打包环境下 preload 初始化主题时 documentElement 为空导致 API 注入失败的问题，解决启动后提示 Electron preload API 不可用的严重回归。"),
      "en-US": "Fixed a packaged preload crash caused by a missing documentElement during initial theme setup, resolving the Electron preload API unavailable startup regression.",
      "ja-JP": "パッケージ版で初期テーマ設定時に documentElement がなく preload がクラッシュし、Electron preload API が利用不可になる問題を修正しました。",
      "de-DE": "Behebt einen Preload-Absturz im Paketbuild durch fehlendes documentElement beim Theme-Setup und damit die Regression mit nicht verfügbarer Electron-preload-API.",
      "es-ES": "Corrige un fallo de preload en la versión empaquetada por documentElement ausente durante el tema inicial, resolviendo la regresión de API preload no disponible.",
    },
    updateFailedTitle: {
      "zh-CN": "检查更新失败",
      "zh-TW": toTraditionalChinese("检查更新失败"),
      "en-US": "Update Check Failed",
      "ja-JP": "更新確認に失敗",
      "de-DE": "Update-Prüfung fehlgeschlagen",
      "es-ES": "Error al buscar actualizaciones",
    },
    updateAvailableTitle: {
      "zh-CN": "发现新版本",
      "zh-TW": toTraditionalChinese("发现新版本"),
      "en-US": "Update Available",
      "ja-JP": "新しいバージョンがあります",
      "de-DE": "Update verfügbar",
      "es-ES": "Actualización disponible",
    },
    updateCurrentTitle: {
      "zh-CN": "当前已是最新版本",
      "zh-TW": toTraditionalChinese("当前已是最新版本"),
      "en-US": "You're Up to Date",
      "ja-JP": "最新バージョンです",
      "de-DE": "Du bist auf dem neuesten Stand",
      "es-ES": "Ya tienes la última versión",
    },
    statusFailed: {
      "zh-CN": "状态: 检查失败",
      "zh-TW": toTraditionalChinese("状态: 检查失败"),
      "en-US": "Status: Check Failed",
      "ja-JP": "状態: 確認失敗",
      "de-DE": "Status: Prüfung fehlgeschlagen",
      "es-ES": "Estado: comprobación fallida",
    },
    statusAvailable: {
      "zh-CN": "状态: 可更新",
      "zh-TW": toTraditionalChinese("状态: 可更新"),
      "en-US": "Status: Update Available",
      "ja-JP": "状態: 更新可能",
      "de-DE": "Status: Update verfügbar",
      "es-ES": "Estado: actualización disponible",
    },
    statusCurrent: {
      "zh-CN": "状态: 已最新",
      "zh-TW": toTraditionalChinese("状态: 已最新"),
      "en-US": "Status: Up To Date",
      "ja-JP": "状態: 最新",
      "de-DE": "Status: Aktuell",
      "es-ES": "Estado: actualizado",
    },
    updateRecommended: {
      "zh-CN": "建议更新",
      "zh-TW": toTraditionalChinese("建议更新"),
      "en-US": "Update Recommended",
      "ja-JP": "更新推奨",
      "de-DE": "Update empfohlen",
      "es-ES": "Actualización recomendada",
    },
    manualCheckNeeded: {
      "zh-CN": "需要人工处理",
      "zh-TW": toTraditionalChinese("需要人工处理"),
      "en-US": "Manual Check Needed",
      "ja-JP": "手動確認が必要",
      "de-DE": "Manuelle Prüfung nötig",
      "es-ES": "Comprobación manual necesaria",
    },
    currentVersion: {
      "zh-CN": "当前版本",
      "zh-TW": toTraditionalChinese("当前版本"),
      "en-US": "Current",
      "ja-JP": "現在",
      "de-DE": "Aktuell",
      "es-ES": "Actual",
    },
    latestVersion: {
      "zh-CN": "最新版本",
      "zh-TW": toTraditionalChinese("最新版本"),
      "en-US": "Latest",
      "ja-JP": "最新",
      "de-DE": "Neueste",
      "es-ES": "Última",
    },
    homebrewCommand: {
      "zh-CN": "Homebrew 更新命令",
      "zh-TW": toTraditionalChinese("Homebrew 更新命令"),
      "en-US": "Homebrew Upgrade Command",
      "ja-JP": "Homebrew 更新コマンド",
      "de-DE": "Homebrew-Update-Befehl",
      "es-ES": "Comando de actualización de Homebrew",
    },
    manualReleaseTip: {
      "zh-CN": "你也可以直接打开 GitHub Release 页面手动查看最新版本。",
      "zh-TW": toTraditionalChinese("你也可以直接打开 GitHub Release 页面手动查看最新版本。"),
      "en-US": "You can also open the GitHub Releases page and check manually.",
      "ja-JP": "GitHub Releases ページを開いて手動で最新バージョンを確認することもできます。",
      "de-DE": "Du kannst auch die GitHub-Releases-Seite öffnen und manuell prüfen.",
      "es-ES": "También puedes abrir la página de GitHub Releases y comprobarlo manualmente.",
    },
    copiedCommand: {
      "zh-CN": "已复制命令",
      "zh-TW": toTraditionalChinese("已复制命令"),
      "en-US": "Copied",
      "ja-JP": "コピーしました",
      "de-DE": "Kopiert",
      "es-ES": "Copiado",
    },
    copyHomebrewCommand: {
      "zh-CN": "复制 Homebrew 命令",
      "zh-TW": toTraditionalChinese("复制 Homebrew 命令"),
      "en-US": "Copy Homebrew Command",
      "ja-JP": "Homebrew コマンドをコピー",
      "de-DE": "Homebrew-Befehl kopieren",
      "es-ES": "Copiar comando de Homebrew",
    },
    releaseUrlCopied: {
      "zh-CN": "已复制 Release 链接",
      "zh-TW": toTraditionalChinese("已复制 Release 链接"),
      "en-US": "Release URL Copied",
      "ja-JP": "Release リンクをコピーしました",
      "de-DE": "Release-URL kopiert",
      "es-ES": "URL de Release copiada",
    },
    openGithubRelease: {
      "zh-CN": "打开 GitHub Release",
      "zh-TW": toTraditionalChinese("打开 GitHub Release"),
      "en-US": "Open GitHub Release",
      "ja-JP": "GitHub Release を開く",
      "de-DE": "GitHub Release öffnen",
      "es-ES": "Abrir GitHub Release",
    },
    checking: {
      "zh-CN": "检查中",
      "zh-TW": toTraditionalChinese("检查中"),
      "en-US": "Checking",
      "ja-JP": "確認中",
      "de-DE": "Prüfe",
      "es-ES": "Comprobando",
    },
    retryIn: {
      "zh-CN": "{seconds}s 后重试",
      "zh-TW": toTraditionalChinese("{seconds}s 后重试"),
      "en-US": "Retry in {seconds}s",
      "ja-JP": "{seconds}s 後に再試行",
      "de-DE": "Erneut in {seconds}s",
      "es-ES": "Reintentar en {seconds}s",
    },
    checkUpdates: {
      "zh-CN": "检查更新",
      "zh-TW": toTraditionalChinese("检查更新"),
      "en-US": "Check Updates",
      "ja-JP": "更新を確認",
      "de-DE": "Updates prüfen",
      "es-ES": "Buscar actualizaciones",
    },
    updateCheckFailedDescription: {
      "zh-CN": "当前版本 v{currentVersion}。检查更新时发生错误：{errorMessage}",
      "zh-TW": toTraditionalChinese("当前版本 v{currentVersion}。检查更新时发生错误：{errorMessage}"),
      "en-US": "You're on v{currentVersion}. The update check failed: {errorMessage}",
      "ja-JP": "現在のバージョンは v{currentVersion} です。更新確認でエラーが発生しました: {errorMessage}",
      "de-DE": "Du verwendest v{currentVersion}. Die Update-Prüfung ist fehlgeschlagen: {errorMessage}",
      "es-ES": "Estás en v{currentVersion}. La comprobación de actualización falló: {errorMessage}",
    },
    noUpdateDescription: {
      "zh-CN": "当前版本 v{currentVersion}，未检测到更新。",
      "zh-TW": toTraditionalChinese("当前版本 v{currentVersion}，未检测到更新。"),
      "en-US": "You're on v{currentVersion}. No newer release was found.",
      "ja-JP": "現在のバージョンは v{currentVersion} です。新しいリリースは見つかりませんでした。",
      "de-DE": "Du verwendest v{currentVersion}. Es wurde kein neueres Release gefunden.",
      "es-ES": "Estás en v{currentVersion}. No se encontró una versión más reciente.",
    },
    homebrewUpdateDescription: {
      "zh-CN": "当前版本 v{currentVersion}，最新版本 {releaseName}。建议通过 Homebrew 更新。",
      "zh-TW": toTraditionalChinese("当前版本 v{currentVersion}，最新版本 {releaseName}。建议通过 Homebrew 更新。"),
      "en-US": "You're on v{currentVersion}. The latest release is {releaseName}. Update via Homebrew.",
      "ja-JP": "現在のバージョンは v{currentVersion}、最新は {releaseName} です。Homebrew での更新を推奨します。",
      "de-DE": "Du verwendest v{currentVersion}. Das neueste Release ist {releaseName}. Aktualisiere über Homebrew.",
      "es-ES": "Estás en v{currentVersion}. La última versión es {releaseName}. Actualiza con Homebrew.",
    },
    developmentUpdateDescription: {
      "zh-CN": "当前版本 v{currentVersion}，最新版本 {releaseName}。当前是开发构建，请前往 GitHub Release 页面查看正式版本。",
      "zh-TW": toTraditionalChinese("当前版本 v{currentVersion}，最新版本 {releaseName}。当前是开发构建，请前往 GitHub Release 页面查看正式版本。"),
      "en-US": "You're on v{currentVersion}. The latest release is {releaseName}. This is a development build, so check the GitHub release page for the packaged app.",
      "ja-JP": "現在のバージョンは v{currentVersion}、最新は {releaseName} です。これは開発ビルドのため、GitHub Release ページで正式版を確認してください。",
      "de-DE": "Du verwendest v{currentVersion}. Das neueste Release ist {releaseName}. Dies ist ein Entwicklungsbuild; prüfe die GitHub-Release-Seite für die paketierte App.",
      "es-ES": "Estás en v{currentVersion}. La última versión es {releaseName}. Esta es una compilación de desarrollo; revisa la página de GitHub Releases para la app empaquetada.",
    },
    manualUpdateDescription: {
      "zh-CN": "当前版本 v{currentVersion}，最新版本 {releaseName}。请前往 GitHub Release 页面下载安装包。",
      "zh-TW": toTraditionalChinese("当前版本 v{currentVersion}，最新版本 {releaseName}。请前往 GitHub Release 页面下载安装包。"),
      "en-US": "You're on v{currentVersion}. The latest release is {releaseName}. Download the installer from the GitHub release page.",
      "ja-JP": "現在のバージョンは v{currentVersion}、最新は {releaseName} です。GitHub Release ページからインストーラーをダウンロードしてください。",
      "de-DE": "Du verwendest v{currentVersion}. Das neueste Release ist {releaseName}. Lade den Installer von der GitHub-Release-Seite herunter.",
      "es-ES": "Estás en v{currentVersion}. La última versión es {releaseName}. Descarga el instalador desde la página de GitHub Releases.",
    },
  };
  const template = dictionary[key]?.[locale] ?? dictionary[key]?.["en-US"] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, valueKey: string) => String(values[valueKey] ?? ""));
}

function getApi() {
  return typeof window !== "undefined" ? window.kimiSwitch : undefined;
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
  if (source === "homebrew") {
    return "Homebrew";
  }
  if (source === "manual") {
    return aboutText(locale, "installManual");
  }
  if (source === "development") {
    return aboutText(locale, "installDevelopment");
  }
  return aboutText(locale, "installDetecting");
}

function getUpdateDescription(locale: Locale, result: UpdateCheckResult, hasUpdate: boolean, hasError: boolean): string {
  const values = {
    currentVersion: result.currentVersion,
    releaseName: result.releaseName,
    errorMessage: result.errorMessage ?? "",
  };
  if (hasError) {
    return aboutText(locale, "updateCheckFailedDescription", values);
  }

  if (!hasUpdate) {
    return aboutText(locale, "noUpdateDescription", values);
  }

  if (result.installSource === "homebrew") {
    return aboutText(locale, "homebrewUpdateDescription", values);
  }
  if (result.installSource === "development") {
    return aboutText(locale, "developmentUpdateDescription", values);
  }
  return aboutText(locale, "manualUpdateDescription", values);
}

function createPreviewUpdateResult(locale: Locale, kind: UpdateDialogPreviewKind): UpdateCheckResult {
  const baseResult: UpdateCheckResult = {
    currentVersion: ABOUT_INFO.version,
    latestVersion: "1.2.0",
    hasUpdate: true,
    releaseUrl: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.2.0`,
    releaseName: "v1.2.0",
    publishedAt: "",
    homebrewCommand: "brew upgrade --cask kimi-code-switch-gui",
    installSource: "manual",
  };

  if (kind === "current") {
    return {
      ...baseResult,
      latestVersion: ABOUT_INFO.version,
      hasUpdate: false,
      releaseUrl: `${ABOUT_INFO.repositoryUrl}/releases/tag/v${ABOUT_INFO.version}`,
      releaseName: `v${ABOUT_INFO.version}`,
    };
  }

  if (kind === "available-homebrew") {
    return {
      ...baseResult,
      installSource: "homebrew",
    };
  }

  if (kind === "error") {
    return {
      ...baseResult,
      latestVersion: "",
      hasUpdate: false,
      releaseUrl: `${ABOUT_INFO.repositoryUrl}/releases`,
      releaseName: "",
      errorMessage: aboutText(locale, "previewRateLimitError"),
    };
  }

  return baseResult;
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

  const hasError = Boolean(props.result.errorMessage);
  const hasUpdate = props.result.hasUpdate || compareReleaseVersions(props.result.latestVersion, props.result.currentVersion) > 0;
  const isUpToDate = !hasError && !hasUpdate;
  const title = hasError
    ? aboutText(props.locale, "updateFailedTitle")
    : hasUpdate
      ? aboutText(props.locale, "updateAvailableTitle")
      : aboutText(props.locale, "updateCurrentTitle");
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
        className={[
          "confirm-dialog",
          "update-dialog",
          "glass-panel",
          isUpToDate ? "update-dialog-compact update-dialog-current" : "",
          hasError ? "update-dialog-error" : "",
          hasUpdate ? "update-dialog-available" : "",
        ].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
      >
        <div className="update-dialog-topline" aria-hidden="true">
          <span className="update-dialog-topline-label">
            {hasError
              ? aboutText(props.locale, "statusFailed")
              : hasUpdate
                ? aboutText(props.locale, "statusAvailable")
                : aboutText(props.locale, "statusCurrent")}
          </span>
          {!isUpToDate ? (
            <span className="update-dialog-topline-version">
              v{props.result.currentVersion}
            </span>
          ) : null}
        </div>
        <div className="confirm-dialog-header update-dialog-header">
          <div
            className={[
              "confirm-dialog-icon",
              "update-dialog-icon",
              isUpToDate ? "update-dialog-icon-current" : "",
              hasError ? "update-dialog-icon-error" : "",
            ].filter(Boolean).join(" ")}
          >
            {isUpToDate ? <Check size={22} strokeWidth={2.6} /> : <RefreshCw size={20} />}
          </div>
          <div className="confirm-dialog-copy update-dialog-copy">
            <div className="update-dialog-title-row">
              <h3 id="update-dialog-title">{title}</h3>
              {hasUpdate ? (
                <span className="update-dialog-badge">
                  {aboutText(props.locale, "updateRecommended")}
                </span>
              ) : null}
              {hasError ? (
                <span className="update-dialog-badge update-dialog-badge-error">
                  {aboutText(props.locale, "manualCheckNeeded")}
                </span>
              ) : null}
            </div>
            {hasUpdate ? (
              <div className="update-dialog-version-row">
                <div className="update-dialog-version-card">
                  <span>{aboutText(props.locale, "currentVersion")}</span>
                  <strong>v{props.result.currentVersion}</strong>
                </div>
                <div className="update-dialog-version-separator" aria-hidden="true">
                  →
                </div>
                <div className="update-dialog-version-card">
                  <span>{aboutText(props.locale, "latestVersion")}</span>
                  <strong>v{props.result.latestVersion}</strong>
                </div>
              </div>
            ) : null}
            <div className="update-dialog-body">
              <p>{description}</p>
            </div>
            {showHomebrewCommand ? (
              <div className="update-dialog-command-block">
                <span className="update-dialog-command-label">
                  {aboutText(props.locale, "homebrewCommand")}
                </span>
                <code>{props.result.homebrewCommand}</code>
              </div>
            ) : null}
            {hasError ? (
              <div className="update-dialog-error-tip">
                {aboutText(props.locale, "manualReleaseTip")}
              </div>
            ) : null}
          </div>
        </div>
        <div className="confirm-dialog-actions update-dialog-actions">
          {showHomebrewCommand ? (
            <button className="action-button update-dialog-button update-dialog-button-secondary" type="button" onClick={props.onCopyCommand}>
              {props.copiedCommand ? aboutText(props.locale, "copiedCommand") : aboutText(props.locale, "copyHomebrewCommand")}
            </button>
          ) : null}
          {hasUpdate || hasError ? (
            <button className="action-button update-dialog-button update-dialog-button-primary" type="button" onClick={props.onOpenRelease}>
              {props.copiedReleaseUrl
                ? aboutText(props.locale, "releaseUrlCopied")
                : aboutText(props.locale, "openGithubRelease")}
            </button>
          ) : null}
          <button
            className={isUpToDate ? "action-button update-dialog-button update-dialog-button-primary" : "action-button update-dialog-button update-dialog-button-ghost"}
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
  const isDev = import.meta.env.DEV;
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
      label: aboutText(props.locale, "githubLink"),
      value: ABOUT_INFO.repositoryUrl,
    },
    {
      icon: Bug,
      label: aboutText(props.locale, "reportIssues"),
      value: ABOUT_INFO.issuesUrl,
    },
    {
      icon: ExternalLink,
      label: aboutText(props.locale, "authorBlog"),
      value: ABOUT_INFO.authorBlogUrl,
    },
    {
      icon: Mail,
      label: aboutText(props.locale, "contactEmail"),
      value: `mailto:${ABOUT_INFO.contactEmail}`,
      displayValue: ABOUT_INFO.contactEmail,
    },
  ];
  const historyTexts: Record<string, Record<Locale, string>> = {
    "v1.1.2": {
      "zh-CN": "新增在终端打开 Kimi 能力，支持当前激活 Profile 与列表行 Profile 分别启动；优化 Terminal.app 和 iTerm2 新标签页执行方式，并补充图文 README。",
      "zh-TW": toTraditionalChinese("新增在终端打开 Kimi 能力，支持当前激活 Profile 与列表行 Profile 分别启动；优化 Terminal.app 和 iTerm2 新标签页执行方式，并补充图文 README。"),
      "en-US": "Added Open Kimi in Terminal support for both the active profile and row-specific profiles; improved Terminal.app and iTerm2 new-tab execution, and refreshed the README with screenshots.",
      "ja-JP": "有効な Profile と行単位の Profile の両方で Kimi をターミナルから起動できるようにし、Terminal.app / iTerm2 の新規タブ実行とスクリーンショット付き README を改善しました。",
      "de-DE": "Fügte das Öffnen von Kimi im Terminal für aktive und zeilenspezifische Profile hinzu, verbesserte neue Tabs in Terminal.app und iTerm2 und aktualisierte die README mit Screenshots.",
      "es-ES": "Añadió abrir Kimi en terminal para el perfil activo y perfiles de fila, mejoró la ejecución en nuevas pestañas de Terminal.app/iTerm2 y actualizó el README con capturas.",
    },
    "v1.1.1": {
      "zh-CN": "新增快捷键管理与快捷键备份，继续拆分主进程和渲染层模块，并优化更新检查弹框状态、GitHub Release 兜底检查与 README 功能说明。",
      "zh-TW": toTraditionalChinese("新增快捷键管理与快捷键备份，继续拆分主进程和渲染层模块，并优化更新检查弹框状态、GitHub Release 兜底检查与 README 功能说明。"),
      "en-US": "Added shortcut management and shortcut backups, continued splitting main and renderer modules, and refined update dialog states, GitHub Release fallback checks, and README feature coverage.",
      "ja-JP": "ショートカット管理とバックアップを追加し、main / renderer モジュール分割を継続。更新ダイアログ、GitHub Release フォールバック、README 説明を改善しました。",
      "de-DE": "Ergänzte Shortcut-Verwaltung und -Backups, setzte die Aufteilung von Main- und Renderer-Modulen fort und verbesserte Update-Dialoge, GitHub-Release-Fallback und README.",
      "es-ES": "Añadió gestión y copias de atajos, continuó separando módulos main/renderer y refinó diálogos de actualización, fallback de GitHub Release y README.",
    },
    "v1.1.0": {
      "zh-CN": "新增发布更新闭环，支持按安装来源提示更新方式；同时拆分渲染层大文件，提升 App.tsx 可维护性，并修复外链与空值类型边界问题。",
      "zh-TW": toTraditionalChinese("新增发布更新闭环，支持按安装来源提示更新方式；同时拆分渲染层大文件，提升 App.tsx 可维护性，并修复外链与空值类型边界问题。"),
      "en-US": "Added the release update loop with install-source-aware guidance; split renderer modules for a more maintainable App.tsx, and fixed external-link and nullable-state boundaries.",
      "ja-JP": "インストール元に応じた更新案内を含むリリース更新フローを追加。renderer の大きなファイルを分割し、外部リンクと null 状態の境界を修正しました。",
      "de-DE": "Fügte den Release-Update-Loop mit installationsquellenabhängigen Hinweisen hinzu, teilte Renderer-Module für wartbareres App.tsx auf und korrigierte Link- und Null-Grenzfälle.",
      "es-ES": "Añadió el flujo cerrado de publicación/actualización con guía según origen, dividió módulos renderer para mantener App.tsx y corrigió enlaces externos y estados nulos.",
    },
    "v1.0.4": {
      "zh-CN": "新增托盘语言与主题快捷切换，补齐备份恢复能力，并继续优化 Skills 工作区浏览、详情展示和 frontmatter 解析兼容性。",
      "zh-TW": toTraditionalChinese("新增托盘语言与主题快捷切换，补齐备份恢复能力，并继续优化 Skills 工作区浏览、详情展示和 frontmatter 解析兼容性。"),
      "en-US": "Added tray shortcuts for language and theme switching, introduced backup restore support, and further refined the Skills workspace, detail presentation, and frontmatter parsing compatibility.",
      "ja-JP": "トレイから言語とテーマを素早く切り替えられるようにし、バックアップ復元を追加。Skills ワークスペースと frontmatter 互換性も改善しました。",
      "de-DE": "Fügte Tray-Schnellwechsel für Sprache und Design sowie Backup-Wiederherstellung hinzu und verbesserte Skills-Arbeitsbereich, Details und frontmatter-Kompatibilität.",
      "es-ES": "Añadió cambios rápidos de idioma/tema desde la bandeja, soporte de restauración de copias y mejoras en Skills, detalles y compatibilidad de frontmatter.",
    },
    "v1.0.3": {
      "zh-CN": "重构 Skills 工作区与详情查看体验，新增界面字体大小设置，统一 Skills 自动发现流程，并修复多个页面无法打开与内容区高度未撑满的问题。",
      "zh-TW": toTraditionalChinese("重构 Skills 工作区与详情查看体验，新增界面字体大小设置，统一 Skills 自动发现流程，并修复多个页面无法打开与内容区高度未撑满的问题。"),
      "en-US": "Refined the Skills workspace and detail viewer, added interface font size settings, unified Skills auto discovery, and fixed multi-page navigation crashes plus the workspace height fill issue.",
      "ja-JP": "Skills ワークスペースと詳細表示を改善し、UI フォントサイズ設定と自動検出を統一。ページ遷移クラッシュと高さ不足を修正しました。",
      "de-DE": "Verbesserte Skills-Arbeitsbereich und Detailansicht, ergänzte UI-Schriftgrößen, vereinheitlichte Auto-Erkennung und behob Navigationsabstürze sowie Höhenprobleme.",
      "es-ES": "Mejoró el espacio de Skills y sus detalles, añadió tamaño de fuente, unificó autodetección y corrigió fallos de navegación y altura del área de trabajo.",
    },
    "v1.0.2": {
      "zh-CN": "补齐备份记录查看与删除流程，修复 MCP 面板配置反复写入导致的结构与缩进异常，并更新项目文档介绍。",
      "zh-TW": toTraditionalChinese("补齐备份记录查看与删除流程，修复 MCP 面板配置反复写入导致的结构与缩进异常，并更新项目文档介绍。"),
      "en-US": "Added backup record viewing and deletion, fixed repeated MCP panel writes causing structure and indentation issues, and refreshed the project documentation overview.",
      "ja-JP": "バックアップ履歴の表示/削除を追加し、MCP パネルの繰り返し書き込みによる構造とインデント異常を修正。ドキュメントも更新しました。",
      "de-DE": "Ergänzte Anzeige und Löschen von Backup-Einträgen, korrigierte Struktur-/Einrückungsfehler durch wiederholte MCP-Schreibvorgänge und aktualisierte die Dokumentation.",
      "es-ES": "Añadió vista y eliminación de copias, corrigió estructura/indentación por escrituras repetidas del panel MCP y actualizó la documentación.",
    },
    "v1.0.1": {
      "zh-CN": "集中优化设置页、首页总览和 MCP 管理交互，并更新整套透明品牌 Logo 与 macOS 图标资源。",
      "zh-TW": toTraditionalChinese("集中优化设置页、首页总览和 MCP 管理交互，并更新整套透明品牌 Logo 与 macOS 图标资源。"),
      "en-US": "Polished settings, overview, and MCP management flows, and refreshed the transparent brand logo and macOS icon assets.",
      "ja-JP": "設定、概要、MCP 管理の操作を改善し、透明ブランドロゴと macOS アイコン素材を更新しました。",
      "de-DE": "Verbesserte Einstellungen, Übersicht und MCP-Verwaltung und aktualisierte transparentes Markenlogo sowie macOS-Icon-Ressourcen.",
      "es-ES": "Pulió ajustes, resumen y gestión MCP, y actualizó el logo transparente y recursos de icono de macOS.",
    },
    "v1.0.0": {
      "zh-CN": "首个桌面版本，包含 Provider、Model、Profile 管理、配置预览与 Diff、状态栏菜单，以及修复后的 GitHub Release 发布流程。",
      "zh-TW": toTraditionalChinese("首个桌面版本，包含 Provider、Model、Profile 管理、配置预览与 Diff、状态栏菜单，以及修复后的 GitHub Release 发布流程。"),
      "en-US": "Initial desktop release with Provider, Model, Profile management, config preview, diff, tray menu, and the fixed GitHub Release pipeline.",
      "ja-JP": "初回デスクトップ版。Provider、Model、Profile 管理、設定プレビュー、Diff、トレイメニュー、修正済み GitHub Release フローを含みます。",
      "de-DE": "Erstes Desktop-Release mit Provider-, Modell- und Profilverwaltung, Konfigurationsvorschau, Diff, Tray-Menü und korrigierter GitHub-Release-Pipeline.",
      "es-ES": "Primer lanzamiento de escritorio con gestión de Provider, Model y Profile, vista previa, diff, menú de bandeja y pipeline de GitHub Release corregido.",
    },
  };
  const historyText = (version: string): string =>
    historyTexts[version]?.[props.locale] ?? historyTexts[version]?.["en-US"] ?? "";
  const history = [
    {
      version: "v1.1.7",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.1.7`,
      text: aboutText(props.locale, "historyV117"),
    },
    {
      version: "v1.1.6",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.1.6`,
      text: aboutText(props.locale, "historyV116"),
    },
    {
      version: "v1.1.5",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.1.5`,
      text: aboutText(props.locale, "historyV115"),
    },
    {
      version: "v1.1.4",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.1.4`,
      text: aboutText(props.locale, "historyV114"),
    },
    {
      version: "v1.1.3",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.1.3`,
      text: aboutText(props.locale, "historyV113"),
    },
    {
      version: "v1.1.2",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.1.2`,
      text: historyText("v1.1.2"),
    },
    {
      version: "v1.1.1",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.1.1`,
      text: historyText("v1.1.1"),
    },
    {
      version: "v1.1.0",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.1.0`,
      text: historyText("v1.1.0"),
    },
    {
      version: "v1.0.4",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.4`,
      text: historyText("v1.0.4"),
    },
    {
      version: "v1.0.3",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.3`,
      text: historyText("v1.0.3"),
    },
    {
      version: "v1.0.2",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.2`,
      text: historyText("v1.0.2"),
    },
    {
      version: "v1.0.1",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.1`,
      text: historyText("v1.0.1"),
    },
    {
      version: "v1.0.0",
      url: `${ABOUT_INFO.repositoryUrl}/releases/tag/v1.0.0`,
      text: historyText("v1.0.0"),
    },
  ];
  const visibleHistory = history.slice(0, 3);
  const hasPendingUpdate =
    pendingUpdateVersion.length > 0 && compareReleaseVersions(pendingUpdateVersion, ABOUT_INFO.version) > 0;
  const isCheckOnCooldown = cooldownRemainingSeconds > 0;
  const updateDialogPreviewItems: Array<{ kind: UpdateDialogPreviewKind; label: string }> = [
    { kind: "error", label: aboutText(props.locale, "previewFailure") },
    { kind: "available-homebrew", label: aboutText(props.locale, "previewHomebrewUpdate") },
    { kind: "available-manual", label: aboutText(props.locale, "previewManualUpdate") },
    { kind: "current", label: aboutText(props.locale, "previewCurrent") },
  ];

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
          ? aboutText(props.locale, "previewRateLimitError")
          : rawMessage;
        setUpdateDialog({
          currentVersion: ABOUT_INFO.version,
          latestVersion: "",
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

  const openPreviewDialog = (kind: UpdateDialogPreviewKind): void => {
    setCopiedUpdateCommand(false);
    setCopiedReleaseUrl(false);
    setUpdateDialog(createPreviewUpdateResult(props.locale, kind));
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
          <p>{aboutText(props.locale, "aboutDescription")}</p>
          <p className="about-meta-summary">
            {aboutText(props.locale, "aboutMeta", {
              author: ABOUT_INFO.author,
              license: ABOUT_INFO.license,
              source: formatInstallSource(props.locale, installSource),
            })}
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
                ? aboutText(props.locale, "checking")
                : isCheckOnCooldown
                  ? aboutText(props.locale, "retryIn", { seconds: cooldownRemainingSeconds })
                  : aboutText(props.locale, "checkUpdates")}
            </span>
          </button>
        </div>
      </div>

      {isDev ? (
        <section className="about-preview-panel">
          <div className="section-title about-section-title">
            <RefreshCw size={16} />
            <span>{aboutText(props.locale, "updatePreviewTitle")}</span>
          </div>
          <div className="about-preview-copy">
            <span>{aboutText(props.locale, "updatePreviewDescription")}</span>
          </div>
          <div className="about-preview-actions">
            {updateDialogPreviewItems.map((item) => (
              <button
                key={item.kind}
                className="action-button compact about-preview-button"
                type="button"
                onClick={() => openPreviewDialog(item.kind)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="about-grid">
        <section className="about-section about-section-wide">
          <div className="section-title about-section-title">
            <ExternalLink size={16} />
            <span>{aboutText(props.locale, "projectLinks")}</span>
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
          <div className="section-title about-section-title">
            <History size={16} />
            <span>{aboutText(props.locale, "versionHistory")}</span>
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
