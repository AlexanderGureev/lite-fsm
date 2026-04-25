import { getDemo2Screen } from "@/src/ssr-demo-2";

import SSRDemo2Screen from "../_components/SSRDemo2Screen";

export default function FeaturedSSRDemo2Page() {
  return <SSRDemo2Screen screen={getDemo2Screen("featured")} />;
}
