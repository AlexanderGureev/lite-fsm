import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appRoot, "../..");
const isProduction = process.env.NODE_ENV === "production";
const siteBasePath = isProduction ? "/lite-fsm" : "";
const basePath = isProduction ? `${siteBasePath}/playground` : "";
const visualizerBasePath =
  process.env.NEXT_PUBLIC_VISUALIZER_BASE_PATH ?? (isProduction ? `${siteBasePath}/visualizer` : "http://localhost:5174");
const playgroundPublicOrigin = process.env.NEXT_PUBLIC_PLAYGROUND_PUBLIC_ORIGIN ?? "";

/** @type {import('next').NextConfig} */
const config = {
  ...(isProduction ? { output: "export" } : {}),
  basePath,
  assetPrefix: basePath,
  env: {
    NEXT_PUBLIC_PLAYGROUND_BASE_PATH: basePath,
    NEXT_PUBLIC_PLAYGROUND_PUBLIC_ORIGIN: playgroundPublicOrigin,
    NEXT_PUBLIC_VISUALIZER_BASE_PATH: visualizerBasePath,
  },
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: repoRoot,
  },
};

export default config;
