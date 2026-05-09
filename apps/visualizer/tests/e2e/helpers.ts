import type { Page } from "@playwright/test";

export const openVisualizer = async (page: Page) => {
  await page.goto("/");
};

export const tabButton = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(name) });
