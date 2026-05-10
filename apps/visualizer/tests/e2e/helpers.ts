import type { Page } from "@playwright/test";
import { VISUALIZER_TEST_IDS } from "../../src/test-ids";

const ids = VISUALIZER_TEST_IDS;

export const openVisualizer = async (page: Page) => {
  await page.goto("/");
};

export const tabButton = (page: Page, tab: keyof typeof ids.tabs.trigger) => page.getByTestId(ids.tabs.trigger[tab]);
