import SSRDemoScreen from "@/app/_components/SSRDemoScreen";
import { getDemoScreen } from "@/src/ssr-demo";

export default function FeaturedSSRDemoPage() {
  return <SSRDemoScreen screen={getDemoScreen("featured")} />;
}
