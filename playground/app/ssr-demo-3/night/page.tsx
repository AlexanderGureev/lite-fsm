import { getDemo3Screen } from "@/src/ssr-demo-3";

import SSRDemo3Screen from "../_components/SSRDemo3Screen";

export default function SSRDemo3NightPage() {
  return <SSRDemo3Screen screen={getDemo3Screen("night")} />;
}
