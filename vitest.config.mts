import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      // Next aliases `server-only` in its own compiler; Vitest does not, so point
      // it at the no-op shim Next ships. Keeping the import means the real
      // build-time client-bundle guard stays in force.
      "server-only": "next/dist/compiled/server-only/empty.js",
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
