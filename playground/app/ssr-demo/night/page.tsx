import SSRDemoScreen from "@/app/_components/SSRDemoScreen";
import { getDemoScreen } from "@/src/ssr-demo";

export default function NightSSRDemoPage() {
  return <SSRDemoScreen screen={getDemoScreen("night")} />;
}
