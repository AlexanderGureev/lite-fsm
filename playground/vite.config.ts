import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const srcRoot = path.resolve(repoRoot, "src");

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom", "use-sync-external-store"],
    alias: [
      {
        find: "lite-fsm/middleware/devTools",
        replacement: path.resolve(srcRoot, "middleware/devTools.ts"),
      },
      {
        find: "lite-fsm/middleware/immer",
        replacement: path.resolve(srcRoot, "middleware/immer.ts"),
      },
      {
        find: "lite-fsm/react",
        replacement: path.resolve(srcRoot, "react/index.ts"),
      },
      {
        find: "lite-fsm/middleware",
        replacement: path.resolve(srcRoot, "middleware.ts"),
      },
      {
        find: "lite-fsm",
        replacement: path.resolve(srcRoot, "core/index.ts"),
      },
      {
        find: "~",
        replacement: srcRoot,
      },
    ],
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
});
