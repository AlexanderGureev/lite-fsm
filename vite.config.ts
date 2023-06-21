import { defineConfig } from "vite";

import typescript from "@rollup/plugin-typescript";
import path from "path";
import { typescriptPaths } from "rollup-plugin-typescript-paths";
// import packageJSON from "./package.json";
import dts from "vite-plugin-dts";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
    }),
  ],
  resolve: {
    alias: [
      {
        find: "~",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
  build: {
    manifest: true,
    minify: true,
    reportCompressedSize: true,
    lib: {
      entry: {
        core: path.resolve(__dirname, "src/core/index.ts"),
        react: path.resolve(__dirname, "src/react/index.ts"),
        middleware: path.resolve(__dirname, "src/middleware/index.ts"),
      },
    },
    rollupOptions: {
      plugins: [
        typescriptPaths({
          preserveExtensions: true,
        }),
        typescript({
          sourceMap: false,
          declaration: true,
          outDir: "dist",
        }),
      ],
      external: ["react", "react-dom", "immer"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          immer: "immer",
        },
      },
    },
  },
});
