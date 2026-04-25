import { getDemoScreen } from "@/src/ssr-demo";

import SSRDemoScreen from "../_components/SSRDemoScreen";

export default function FeaturedSSRDemoPage() {
  return <SSRDemoScreen screen={getDemoScreen("featured")} />;
}
