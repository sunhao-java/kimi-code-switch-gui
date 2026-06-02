# TASK-002: Rust tauri 命令契约/集成测试 + CI 接入 cargo test

## Changes
- `src-tauri/src/fs_access.rs`: 新增 `#[cfg(test)] mod tests`，覆盖既有纯函数 `resolve_home`（`~/` 展开、单独 `~`、绝对路径原样、相对路径原样、路径中间 `~` 不展开）与 `DirEntry` 的 serde `isDirectory` camelCase 序列化。未改动任何命令行为。
- `src-tauri/src/usage.rs`: 新增 `mod tests`，覆盖 `json_to_sql`（null/bool/int/float/string/复合→text）、`sql_to_json`（null/int/text）、`resolve_home`，并用 in-memory SQLite 验证 `bind_named` 的命名参数映射：多行结果、空结果、未使用键被静默跳过。
- `src-tauri/src/system.rs`: 提取纯函数 `build_http_request(client, method, url, headers, body) -> reqwest::Request`，`http_request` 命令改为调用它再 `client.execute(req)`（行为等价）。新增 `mod tests`：方法大写归一化、WebDAV 非标准方法（PROPFIND/MKCOL/DELETE/PUT）、头部+body 构造、非法方法报错、`resolve_home`、`augmented_path` 去重且含 homebrew 路径。
- `src-tauri/src/tray.rs`: 新增 `mod tests`，覆盖 `MenuItemSpec` JSON 解析契约：最小可点项、分隔符、checked 标志、嵌套 submenu、顶层 `Vec<MenuItemSpec>`（与 `set_tray` 的 menu 参数同构）。runtime 相关的 `build_menu_items`/`set_tray` 不强测（依赖 AppHandle）。
- `.github/workflows/release.yml`: test job 追加 `dtolnay/rust-toolchain@stable` + `swatinem/rust-cache@v2`(workspaces `./src-tauri -> target`) + `npm run build:web`（产出 frontendDist）+ `cd src-tauri && cargo test`。

## Verification (convergence 逐条实证)
- [x] C1 `grep -rln '#\[cfg(test)\]' src-tauri/src/` 命中 4 文件（fs_access/system/tray/usage），≥3 ✔
- [x] C2 `src-tauri/src/fs_access.rs` 含 `mod tests`（grep -c = 1）✔
- [x] C3 `src-tauri/src/usage.rs` 含 `mod tests`（grep -c = 1）✔
- [x] C4 `cd src-tauri && cargo test` 退出码 0：`test result: ok. 26 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out`（另两套 main.rs / doc-tests 各 0 passed 0 failed）✔
- [x] C5 `.github/workflows/release.yml` 含 `cargo test`（第 48 行 `run: cd src-tauri && cargo test`），且 `python3 -c "import yaml;yaml.safe_load(...)"` 输出 `YAML OK` ✔

## Tests
- [x] `cd src-tauri && cargo test`: 通过。末尾结果行：`test result: ok. 26 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s`

## Deviations
- **CI test job 额外增加 `npm run build:web` 步骤（计划未显式列出）**：`tauri::generate_context!()` 在编译期校验 `frontendDist`（`../dist`）必须存在，否则 lib 编译失败（本地首跑即遇此报错）。故 cargo test 前必须先构建渲染层产出 `dist/`。这是让 cargo test 在 CI 真正可跑的必要前置，非范围外改动。
- 本地为验证 cargo test 执行了 `npm ci` + `npm approve-scripts esbuild/fsevents` + `npm rebuild esbuild` + `npm run build:web`（此前无 node_modules / dist）。这些是验证环境准备，未改动仓库受控文件（`dist/` 已被 .gitignore 忽略，node_modules 同理）。

## Residual
- 无未纯化模块。fs_access / usage / system 三个核心模块均有可过测试；tray 也补了 JSON 解析契约测试。
- 未覆盖需 Tauri runtime 的端到端路径（`set_tray`/`build_menu_items` 的实际菜单构建、`exec_command`/`http_request` 的真实 IO、SQLite 命令的 `tauri::State` 注入），符合任务 tradeoff（留待后续 e2e 里程碑）。

## Notes
- `build_http_request` 是新抽出的纯 helper，后续若要为 WebDAV 调用补更多契约测试可直接复用，无需起 runtime。
- CI test job 现同时跑 `npm test` 与 `cargo test`；rust-cache 复用 `./src-tauri -> target` 编译缓存以控制时长。
- 未执行 git commit（按任务要求）。
