import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  entry: {
    index: "src/index.ts",
    react: "src/react/index.ts",
  },
  external: ["@lite-fsm/core", "@lite-fsm/react", "react"],
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
