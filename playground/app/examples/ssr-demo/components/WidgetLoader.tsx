import { loadWidgetSeed, type DemoContentType, type DemoWidgetConfig, type WidgetSeed } from "../store/ssr";

import { Widget } from "./Widget";
import { WidgetInitialize } from "./WidgetInitialize";

const fetchWidget: Record<DemoContentType, (widget: DemoWidgetConfig) => Promise<WidgetSeed>> = {
  mock_feed: loadWidgetSeed,
};

export async function WidgetLoader({ widget }: { widget: DemoWidgetConfig }) {
  const seed = await fetchWidget[widget.contentType](widget);

  return (
    <WidgetInitialize seed={seed}>
      <Widget widget={widget} seed={seed} />
    </WidgetInitialize>
  );
}
