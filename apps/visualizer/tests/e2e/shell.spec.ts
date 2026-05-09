import { expect, test } from "@playwright/test";
import { openVisualizer, tabButton } from "./helpers";

test("12b shadcn shell shows visualizer primitives and style fixture", async ({ page }) => {
  await openVisualizer(page);

  await expect(page.getByRole("heading", { name: "Stage 12b shadcn foundation" })).toBeVisible();
  await expect(tabButton(page, "Source")).toBeVisible();
  await expect(tabButton(page, "System")).toBeVisible();
  await expect(tabButton(page, "Events")).toBeVisible();
  await expect(tabButton(page, "Machines")).toBeVisible();
  await expect(page.getByRole("region", { name: "Visualizer console" })).toBeVisible();
  const sourceSearch = page.getByLabel("Search source anchors");
  const eventSearch = page.getByLabel("Search event labels");
  await expect(sourceSearch).toBeVisible();
  await expect(eventSearch).toBeVisible();
  await expect(sourceSearch).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(eventSearch).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.getByRole("combobox", { name: "Select timeline source" })).toBeVisible();
  await expect(page.getByLabel("Representative source snippet")).toBeVisible();
  await expect(page.getByLabel("Representative machine card")).toBeVisible();
  await expect(page.getByLabel("Representative console entries")).toBeVisible();
  await expect(page.getByText("cfg", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("eff", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("sim", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("routing actor").first()).toBeVisible();
  await expect(page.getByText("diagnostic", { exact: true })).toBeVisible();
  await expect(page.getByText("Reducer branch is visible as a diagnostic badge.")).toBeVisible();
  await expect(page.getByLabel("Representative timeline")).toHaveCSS("margin-top", "12px");
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
  await expect(page.getByRole("heading", { name: "Stage 12b shadcn foundation" })).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Console" })).toBeFocused();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 560 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { name: "Stage 12b shadcn foundation" })).toBeVisible();
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  }

  await page.setViewportSize({ width: 360, height: 720 });
  await expect(page.getByRole("heading", { name: "Stage 12b shadcn foundation" })).toBeVisible();
  await expect(page.getByText("PLAYER_TRACK_BUFFERING_PROGRESS_REPORTED_FROM_ACTOR_TEMPLATE_INSTANCE")).toBeVisible();

  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(mobileOverflow).toBe(false);
});
