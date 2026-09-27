import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Separate config for /lib/agent/evals/*.eval.ts — these hit the real
 * Anthropic API (ANTHROPIC_API_KEY) and cost real money/time, so they're
 * deliberately excluded from vitest.config.mts / `npm test`. Run with
 * `npm run evals`. See /lib/agent/evals/README.md.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./lib/testing/serverOnlyStub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["lib/agent/evals/**/*.eval.ts"],
    exclude: ["node_modules/**", ".next/**"],
    testTimeout: 120_000,
  },
});
