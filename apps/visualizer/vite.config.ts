import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

const require = createRequire(import.meta.url);
const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const elkjsBrowserEntry = require.resolve("elkjs/lib/elk.bundled.js");
const isProduction = process.env.NODE_ENV === "production";
const visualizerBasePath =
  process.env.VITE_VISUALIZER_BASE_PATH ?? (isProduction ? "/lite-fsm/visualizer/" : "/");
const playgroundDevOrigin = process.env.VITE_PLAYGROUND_DEV_ORIGIN ?? "http://localhost:3000";

export default defineConfig({
  base: visualizerBasePath,
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      "elkjs": elkjsBrowserEntry,
      "@lite-fsm/graph/simulator": fromRoot("../../packages/graph/src/simulator/index.ts"),
      "@lite-fsm/graph/view-model": fromRoot("../../packages/graph/src/view-model/index.ts"),
      "@lite-fsm/graph": fromRoot("../../packages/graph/src/index.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/visualizer-ir": {
        target: playgroundDevOrigin,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4174,
  },
});
