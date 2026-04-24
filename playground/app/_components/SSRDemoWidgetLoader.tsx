import { loadWidgetSeed, type DemoContentType, type DemoWidgetConfig, type WidgetSeed } from "@/src/ssr-demo";

import SSRDemoWidgetView from "./SSRDemoWidget";
import SSRDemoWidgetInitialize from "./SSRDemoWidgetInitialize";

const fetchWidget: Record<DemoContentType, (widget: DemoWidgetConfig) => Promise<WidgetSeed>> = {
  mock_feed: loadWidgetSeed,
};

export default async function SSRDemoWidgetLoader({ widget }: { widget: DemoWidgetConfig }) {
  const seed = await fetchWidget[widget.contentType](widget);

  return (
    <SSRDemoWidgetInitialize seed={seed}>
      <SSRDemoWidgetView widget={widget} seed={seed} />
    </SSRDemoWidgetInitialize>
  );
}
