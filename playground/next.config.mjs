const isProduction = process.env.NODE_ENV === "production";
const basePath = isProduction ? "/lite-fsm/playground" : "";

/** @type {import('next').NextConfig} */
const config = {
  output: "export",
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
    root: import.meta.dirname,
  },
};

export default config;
