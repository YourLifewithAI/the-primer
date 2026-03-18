import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tsconfigPaths({ root: __dirname })],
  test: {
    name: "web",
    globals: true,
    environment: "node",
    setupFiles: [path.resolve(__dirname, "src/__tests__/setup.ts")],
  },
});
