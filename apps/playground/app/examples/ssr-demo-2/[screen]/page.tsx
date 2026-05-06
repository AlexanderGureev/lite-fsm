import { notFound } from "next/navigation";

import { Screen } from "../components/Screen";
import { getScreen, screenConfigs, type ScreenId } from "../store/ssr";

export function generateStaticParams() {
  return screenConfigs.map((screen) => ({ screen: screen.id }));
}

export default async function SSRDemo2ScreenPage({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  const config = getScreen(screen as ScreenId);
  if (!config) notFound();
  return <Screen screen={config} />;
}
