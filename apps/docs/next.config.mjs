import nextra from "nextra";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appRoot, "../..");

// Определение, находимся ли мы в production
const isProduction = process.env.NODE_ENV === "production";
const basePath = isProduction ? "/lite-fsm" : "";
const playgroundBasePath = process.env.NEXT_PUBLIC_PLAYGROUND_BASE_PATH ?? `${basePath}/playground`;

// Настраиваем Nextra с ее конфигурацией
const withNextra = nextra({
  // Дополнительные опции Nextra
  search: {
    codeblocks: true,
  },
});

// Экспортируем конечную конфигурацию Next.js с Nextra
export default withNextra({
  // Настройки для GitHub Pages
  output: "export",
  images: {
    unoptimized: true,
  },
  // Если проект размещен не в корне, нужно добавить basePath и assetPrefix
  basePath: basePath,
  assetPrefix: basePath,
  env: {
    NEXT_PUBLIC_PLAYGROUND_BASE_PATH: playgroundBasePath,
  },
  turbopack: {
    root: repoRoot,
    resolveAlias: {
      "next-mdx-import-source-file": "./mdx-components.jsx",
    },
  },
});
