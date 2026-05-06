import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  entry: {
    index: "src/index.ts",
  },
  external: [
    "@lite-fsm/core",
    "react",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "use-sync-external-store",
    "use-sync-external-store/shim",
    "use-sync-external-store/shim/with-selector",
  ],
  format: ["esm", "cjs"],
  outDir: "dist",
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".js",
    };
  },
  sourcemap: false,
  splitting: false,
  minify: true,
  target: "es2020",
  tsconfig: "./tsconfig.json",
});
