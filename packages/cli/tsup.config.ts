import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  entry: ["src/**/*.ts"],
  external: ["@lite-fsm/graph", "commander", "typescript"],
  format: ["esm"],
  outDir: "dist",
  bundle: false,
  sourcemap: false,
  splitting: false,
  minify: false,
  target: "es2022",
  tsconfig: "./tsconfig.json",
});
