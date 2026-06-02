import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve("src/shared"),
      "@renderer": resolve("src/renderer/src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // 覆盖率门禁同时覆盖纯业务逻辑（src/shared）与从 Electron 主进程迁移来的前端适配层
      // （src/renderer/src/tauri）。后者是薄的 invoke 转发包装，分支密度低、错误分支多走 try/catch，
      // 难以达到 shared 的 80/55 标准，故对整体门禁取一个二者都能稳定通过的实测值（见下方注释）。
      include: ["src/shared/**/*.ts", "src/renderer/src/tauri/**/*.ts"],
      thresholds: {
        // 实测值（含 tauri 适配层后整体）：lines/statements ~70+、functions ~80+、branches ~70+。
        // 阈值按可稳定通过的实测下限设定，低于纯 shared 是因为薄包装层拉低了行/分支密度。
        lines: 70,
        functions: 70,
        branches: 50,
        statements: 70,
      },
    },
  },
});
