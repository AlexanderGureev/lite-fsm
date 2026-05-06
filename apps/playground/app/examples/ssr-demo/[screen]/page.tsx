import { notFound } from "next/navigation";

import { Screen } from "../components/Screen";
import { demoScreens, getDemoScreen, type DemoScreenId } from "../store/ssr";

export function generateStaticParams() {
  return demoScreens.map((screen) => ({ screen: screen.id }));
}

export default async function SSRDemoScreenPage({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  const config = getDemoScreen(screen as DemoScreenId);
  if (!config) notFound();
  return <Screen screen={config} />;
}
