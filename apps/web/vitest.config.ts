/**
 * Vitest configuration for FactoryOS tests.
 *
 * Scoped to factoryos/tests/ only — does not run ShortsFactory tests.
 * Uses Node environment (no browser, no DOM).
 */
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    include: ["factoryos/tests/**/*.test.ts", "tests/**/*.test.ts", "shortforge/tests/**/*.test.ts", "../../testing/tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    reporters: ["verbose"],
    testTimeout: 60000,
    fileParallelism: true,
  },
});
