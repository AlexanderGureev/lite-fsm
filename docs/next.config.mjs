import nextra from "nextra";

// Определение, находимся ли мы в production
const isProduction = process.env.NODE_ENV === "production";
const basePath = isProduction ? "/lite-fsm" : "";

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
});
