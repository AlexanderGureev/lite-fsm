import nextra from "nextra";

// Настраиваем Nextra с ее конфигурацией
const withNextra = nextra({
  // Дополнительные опции Nextra
});

// Экспортируем конечную конфигурацию Next.js с Nextra
export default withNextra({
  // Настройки для GitHub Pages
  output: "export",
  images: {
    unoptimized: true,
  },
  // Если проект размещен не в корне, нужно добавить basePath
  // basePath: "/lite-fsm",
});
