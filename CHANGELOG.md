# 变更日志 / Changelog

每个版本的变更记录按语言拆分维护，请按需查看：

| Locale | File |
|--------|------|
| 简体中文 | [CHANGELOGS/zh-CN.md](CHANGELOGS/zh-CN.md) |
| 繁體中文 | [CHANGELOGS/zh-TW.md](CHANGELOGS/zh-TW.md) |
| English | [CHANGELOGS/en-US.md](CHANGELOGS/en-US.md) |
| 日本語 | [CHANGELOGS/ja-JP.md](CHANGELOGS/ja-JP.md) |
| Deutsch | [CHANGELOGS/de-DE.md](CHANGELOGS/de-DE.md) |
| Español | [CHANGELOGS/es-ES.md](CHANGELOGS/es-ES.md) |

GitHub Release 描述同时包含中文 (`zh-CN`) 和英文 (`en-US`) 两段，由 `.github/workflows/release.yml` 自动提取并写入。

桌面应用内的「关于」页和「检查更新」对话框会按当前界面语言展示对应版本的变更说明：首次启动会从 GitHub `raw.githubusercontent.com` 拉取最新译文缓存到 `~/.kimi/.panel/changelog-cache/`，失败时回退到打包内文件。

发布新版本流程见 [CLAUDE.md](CLAUDE.md#发布新版本--release-a-new-version--cut-a-release)。
