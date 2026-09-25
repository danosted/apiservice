import { defineConfig } from "vitest/config";

// Unit tests run in Node against injected fakes; the running-server checks live in scripts/verify.sh.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "services/*/worker/**/*.test.ts", "services/*/src/**/*.test.ts"],
    environment: "node",
  },
});
