import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "agentic",
    globals: true,
    environment: "node",
  },
});
