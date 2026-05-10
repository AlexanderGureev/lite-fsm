import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      "@lite-fsm/graph/simulator": fromRoot("../../packages/graph/src/simulator/index.ts"),
      "@lite-fsm/graph/view-model": fromRoot("../../packages/graph/src/view-model/index.ts"),
      "@lite-fsm/graph": fromRoot("../../packages/graph/src/index.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
  },
  preview: {
    host: "127.0.0.1",
    port: 4174,
  },
});
