import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Banner, Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import "nextra-theme-docs/style.css";
import Image from "next/image";
import type { ReactNode } from "react";

const logoStyles = `
  .logo-light { display: block; }
  .logo-dark { display: none; }
  html.dark .logo-light { display: none; }
  html.dark .logo-dark { display: block; }
`;

const assetPrefix = process.env.NODE_ENV === "production" ? "/lite-fsm" : "";

export const metadata = {
  metadataBase: new URL("https://alexandergureev.github.io/lite-fsm"),
  title: {
    default: "lite-fsm - Легковесная библиотека конечных автоматов",
    template: "%s | lite-fsm",
  },
  description: "Документация для lite-fsm - легковесной библиотеки конечных автоматов для JavaScript и TypeScript",
  openGraph: {
    title: "lite-fsm - Легковесная библиотека конечных автоматов",
    description: "Документация для lite-fsm - легковесной библиотеки конечных автоматов для JavaScript и TypeScript",
    type: "website",
    images: [{ url: `${assetPrefix}/logo.svg`, width: 240, height: 240 }],
  },
  icons: {
    icon: [
      { url: `${assetPrefix}/favicon.svg`, media: "(prefers-color-scheme: light)" },
      { url: `${assetPrefix}/favicon-dark.svg`, media: "(prefers-color-scheme: dark)" },
    ],
  },
};

const banner = <Banner storageKey="lite-fsm-banner">👋 Добро пожаловать в документацию lite-fsm!</Banner>;

const navbar = (
  <Navbar
    logo={
      <div className="flex items-center">
        <div className="mr-2">
          <div className="relative w-[62px] h-[62px]">
            <Image
              src={`${assetPrefix}/logo.svg`}
              alt="lite-fsm logo"
              className="logo-light absolute top-0 left-0"
              width={62}
              height={62}
            />
            <Image
              src={`${assetPrefix}/logo-dark.svg`}
              alt="lite-fsm logo"
              className="logo-dark absolute top-0 left-0"
              width={62}
              height={62}
            />
          </div>
        </div>
      </div>
    }
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

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ru" dir="ltr" suppressHydrationWarning>
      <Head>
        <style>{logoStyles}</style>
      </Head>
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
