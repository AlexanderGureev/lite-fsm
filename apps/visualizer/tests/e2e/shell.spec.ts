import { expect, test } from "@playwright/test";
import { openVisualizer, tabButton } from "./helpers";

test("12b shell shows visualizer primitives and style fixture", async ({ page }) => {
  await openVisualizer(page);

  await expect(page.getByRole("heading", { name: "Stage 12b style fixture" })).toBeVisible();
  await expect(tabButton(page, "Source")).toBeVisible();
  await expect(tabButton(page, "System")).toBeVisible();
  await expect(tabButton(page, "Events")).toBeVisible();
  await expect(tabButton(page, "Machines")).toBeVisible();
  await expect(page.getByRole("region", { name: "Visualizer console" })).toBeVisible();
  await expect(page.getByLabel("Representative source snippet")).toBeVisible();
  await expect(page.getByLabel("Representative machine card")).toBeVisible();
  await expect(page.getByLabel("Representative console entries")).toBeVisible();
  await expect(page.getByText("cfg", { exact: true })).toBeVisible();
  await expect(page.getByText("eff", { exact: true })).toBeVisible();
  await expect(page.getByText("sim", { exact: true })).toBeVisible();
  await expect(page.locator(".badge--routing", { hasText: "routing actor" })).toBeVisible();
  await expect(page.getByText("Reducer branch is visible as a diagnostic badge.")).toBeVisible();
  await expect(page.getByText("PLAYER_TRACK_BUFFERING_PROGRESS_REPORTED_FROM_ACTOR_TEMPLATE_INSTANCE")).toBeVisible();
  await expect(page.getByText("docs")).toHaveCount(0);
  await expect(page.getByText("playground")).toHaveCount(0);

  await tabButton(page, "System").click();
  await expect(page.getByRole("heading", { name: "System inventory" })).toBeVisible();

  await page.getByRole("button", { name: "Console" }).click();
  await expect(page.getByRole("region", { name: "Visualizer console" })).toBeHidden();
});

test("12b fixture keeps focus states and responsive floor", async ({ page }) => {
  await openVisualizer(page);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Console" })).toBeFocused();

  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(desktopOverflow).toBe(false);

  await page.setViewportSize({ width: 360, height: 720 });
  await expect(page.getByRole("heading", { name: "Stage 12b style fixture" })).toBeVisible();
  await expect(page.getByText("PLAYER_TRACK_BUFFERING_PROGRESS_REPORTED_FROM_ACTOR_TEMPLATE_INSTANCE")).toBeVisible();

  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(mobileOverflow).toBe(false);
});
