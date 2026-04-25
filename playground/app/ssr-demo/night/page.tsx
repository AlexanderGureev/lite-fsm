import { getDemoScreen } from "@/src/ssr-demo";

import SSRDemoScreen from "../_components/SSRDemoScreen";

export default function NightSSRDemoPage() {
  return <SSRDemoScreen screen={getDemoScreen("night")} />;
}
