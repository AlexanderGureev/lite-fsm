import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Banner, Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import "nextra-theme-docs/style.css";

export const metadata = {
  title: {
    default: "lite-fsm - Легковесная библиотека конечных автоматов",
    template: "%s | lite-fsm",
  },
  description: "Документация для lite-fsm - легковесной библиотеки конечных автоматов для JavaScript и TypeScript",
  openGraph: {
    title: "lite-fsm - Легковесная библиотека конечных автоматов",
    description: "Документация для lite-fsm - легковесной библиотеки конечных автоматов для JavaScript и TypeScript",
    type: "website",
  },
};

const banner = <Banner storageKey="lite-fsm-banner">👋 Добро пожаловать в документацию lite-fsm!</Banner>;

const navbar = (
  <Navbar
    logo={<span className="font-bold text-xl">lite-fsm</span>}
    projectLink="https://github.com/AlexanderGureev/lite-fsm"
  />
);

const footer = (
  <Footer>
    <div className="flex items-center">
      <span>MIT {new Date().getFullYear()} © Alexander Gureev.</span>
    </div>
  </Footer>
);

export default async function RootLayout({ children }) {
  return (
    <html lang="ru" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          banner={banner}
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/AlexanderGureev/lite-fsm"
          editLink="Редактировать эту страницу на GitHub"
          sidebar={{ defaultMenuCollapseLevel: 1 }}
          footer={footer}
          // Дополнительные опции темы
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
