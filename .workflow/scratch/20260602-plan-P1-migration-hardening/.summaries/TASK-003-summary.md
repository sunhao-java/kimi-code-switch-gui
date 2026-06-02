# TASK-003: 知识文档同步到 Tauri v2 架构

## Changes
- `.workflow/project.md`:
  - What This Is：「Electron 桌面应用」→「Tauri v2 (Rust + 系统 WebView) 桌面应用」
  - Context：「electron-vite 构建，三进程架构(main/preload/renderer)」「better-sqlite3 存储用量」→「薄 Rust 壳 + 前端业务逻辑（src-tauri Rust 命令 + src/renderer 适配层 + src/shared 纯逻辑）」「用量数据由 Rust 后端经 rusqlite 存入 SQLite」
  - Tech Stack：Runtime「Electron 35 + Node.js」→「Tauri v2 + Rust + 系统 WebView」；Build「electron-vite + esbuild」→「Tauri CLI + Vite (vite.config.ts → dist/)」；Storage 的 better-sqlite3 → Rust rusqlite
  - Key Decisions：「IPC 模块化注册」行 → 「薄 Rust 壳 + 前端业务逻辑」（Rust 仅暴露 IO/系统集成原语，src/shared 在渲染层复用）
- `.workflow/specs/architecture-constraints.md`:
  - Module Structure：main/preload/renderer 三进程 → src-tauri/src（fs_access/system/usage/tray）+ src/renderer/src/tauri 适配层 + src/shared
  - Layer Boundaries / Dependency Rules：IPC ipcMain/ipcRenderer、preload context bridge → window.kimiSwitch（`__TAURI_INTERNALS__` 注入）经 invoke() 调 Tauri command + listen() 收事件；FileAccess 接口抽象文件 IO
  - Technology Constraints：Runtime → Tauri v2 + Rust + system WebView；Build → Tauri CLI + Vite；Backend storage → SQLite via rusqlite
- `.workflow/specs/coding-conventions.md`:
  - Patterns 行「IPC registration: registerXxxIpc(ipcMain, ctx)」→「Backend bridge: Tauri adapters call Rust commands via invoke()/listen()，exposed through window.kimiSwitch」（清除 specs 内最后一处 ipcMain）
- `.workflow/specs/quality-rules.md`:
  - Build Gate「electron-vite build」「No esbuild transform errors」→「npm run build (Tauri CLI + Vite)」「cargo build (src-tauri)」

## Verification
- [x] `.workflow/project.md` contains 'Tauri'：`grep -c 'Tauri' .workflow/project.md` → 4
- [x] `grep -c 'Electron' .workflow/project.md` returns 0：实测 → 0
- [x] `grep -rn 'electron-vite' .workflow/project.md` returns nothing：exit=1（无输出）
- [x] `grep -rln 'ipcMain\|preload' .workflow/specs/` returns nothing：exit=1（无输出）
- [x] `.workflow/specs` contains 'src-tauri' or 'invoke' or 'Tauri'：3 个文件均命中（architecture-constraints / coding-conventions / quality-rules）

## Tests
- [x] `grep -rn 'electron-vite\|ipcMain\|preload' .workflow/project.md .workflow/specs/`：exit=1（无输出），陈旧 Electron 描述清零
- [x] 附加：`grep -rn 'Electron\|electron' .workflow/specs/`：exit=1（无输出），specs 内 Electron 残留清零

## Deviations
- 任务原文 read_first 主要点名 architecture-constraints.md，但 convergence 的 `grep -rln 'ipcMain\|preload' .workflow/specs/` 与 test.commands 的 `electron-vite` 检查覆盖整个 specs/ 目录。为达成收敛，额外清理了 `coding-conventions.md`（ipcMain 注册行）与 `quality-rules.md`（electron-vite/esbuild Build Gate）。两处改动仍严格以 CLAUDE.md 为真源，未引入新事实。
- `quality-rules.md` 中「Error handling: IPC handlers return { ok: true, ... }」语句保留：CLAUDE.md Key Patterns 仍逐字记录该 IPC 返回约定，且 "IPC" 一词不触发任何 convergence grep（仅匹配 ipcMain/preload/Electron/electron-vite），保留以避免越过 CLAUDE.md 引入新事实。

## Notes
- 单一真源原则：所有改写事实均取自项目根 CLAUDE.md 的 Architecture / Key Patterns / Testing 段，未引入 CLAUDE.md 以外的新事实。
- 后续 maestro analyze/plan 加载的架构上下文（project.md + specs/arch）现已与现实（Tauri v2）一致。
