import type { Page } from "@playwright/test";
import { VISUALIZER_TEST_IDS } from "../../src/test-ids";

const ids = VISUALIZER_TEST_IDS;

export const openVisualizer = async (
  page: Page,
  options: { visualizerPipelineDelayMs?: number } = {},
) => {
  const params = new URLSearchParams();
  if (options.visualizerPipelineDelayMs) {
    params.set("visualizerPipelineDelayMs", String(options.visualizerPipelineDelayMs));
  }

  await page.goto(params.size > 0 ? `/?${params.toString()}` : "/");
};

export const tabButton = (page: Page, tab: keyof typeof ids.tabs.trigger) => page.getByTestId(ids.tabs.trigger[tab]);
