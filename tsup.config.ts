import { defineConfig } from "tsup";

const external = [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "immer",
  "use-sync-external-store",
  "use-sync-external-store/shim/with-selector",
];

export default defineConfig({
  clean: true,
  entry: {
    core: "src/core.ts",
    react: "src/react.ts",
    middleware: "src/middleware.ts",
    "middleware/devTools": "src/middleware/devTools.ts",
    "middleware/immer": "src/middleware/immer.ts",
  },
  external,
  format: ["esm", "cjs"],
  outDir: "dist",
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".js",
    };
  },
  sourcemap: false,
  splitting: false,
  target: "es2020",
  tsconfig: "./tsconfig.json",
});
