import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appRoot, "../..");
const isProduction = process.env.NODE_ENV === "production";
const basePath = isProduction ? "/lite-fsm/playground" : "";

/** @type {import('next').NextConfig} */
const config = {
  ...(isProduction ? { output: "export" } : {}),
  basePath,
  assetPrefix: basePath,
  env: {
    NEXT_PUBLIC_PLAYGROUND_BASE_PATH: basePath,
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
