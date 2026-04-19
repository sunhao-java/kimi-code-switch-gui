import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/shared/configStore.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 55,
        statements: 80,
      },
    },
  },
});
