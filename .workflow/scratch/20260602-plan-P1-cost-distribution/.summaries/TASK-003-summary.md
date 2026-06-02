# TASK-003: 未签名 macOS 分发体验优化（不做公证）

## Changes
- `scripts/render_homebrew_cask.py`: 校对 cask caveat —— 现有模板已准确包含两种去隔离方式（`sudo xattr -rd com.apple.quarantine "/Applications/Kimi Code Switch GUI.app"` 与 `brew install --cask --no-quarantine kimi-code-switch-gui`），措辞清晰准确，无需改动。
- `README.md`: 新增「macOS 首次打开」小节（line 193 起），中文为主、附英文说明。解释未签名/未公证原因（个人免费工具、隐私优先、未购买 Apple 开发者证书）以及两种去隔离方法，与 cask caveat 完全一致。

## Verification
- [x] `scripts/render_homebrew_cask.py contains 'com.apple.quarantine'`：grep 命中 line 32
- [x] `scripts/render_homebrew_cask.py contains 'no-quarantine'`：grep 命中 line 34、35
- [x] `README.md contains 'quarantine' or 'xattr' or '去隔离'`：grep 命中 line 195/197/199/202/205/208/211
- [x] `README macOS first-open guidance section`：grep 命中 `## macOS 首次打开`（line 193），小节正文完整

## Tests
- [x] `grep -in 'quarantine\|xattr\|去隔离' README.md scripts/render_homebrew_cask.py`：双文件均命中，去隔离指引齐全且一致。grep 实证：
  - cask: `32: sudo xattr -rd com.apple.quarantine "..."`、`34/35: --no-quarantine` `brew install --cask --no-quarantine kimi-code-switch-gui`
  - README: `## macOS 首次打开`（193）、xattr 命令（202）、`--no-quarantine` brew 命令（208）、英文段（211）

## Deviations
- `scripts/render_homebrew_cask.py` 未实际改动：现有 caveat 已准确且措辞清晰，符合任务「当前模板已有，校对措辞与准确性即可」的描述，无需修改即满足 convergence。
- 任务 action 中「可选：在 about 页补一句」未做（标注为可选项，且属 src 范围，超出 docs scope，故略过）。

## Notes
- README 小节同时覆盖中英文，与 cask caveat 文案完全对齐（同一套 xattr + --no-quarantine 命令），未签名 DMG 用户从任一入口都能一眼看到解法。
- 全程未引入签名 CI、未改 `src-tauri/tauri.conf.json` 签名配置。
