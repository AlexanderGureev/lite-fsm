import { expect, test } from "@playwright/test";
import { VISUALIZER_TEST_IDS } from "../../src/test-ids";
import { openVisualizer, tabButton } from "./helpers";

const ids = VISUALIZER_TEST_IDS;

const openSourceModel = async (page: import("@playwright/test").Page) => {
  await page.getByTestId(ids.source.open).click();
  await expect(page.getByTestId(ids.source.status)).toContainText("model ready");
};

test("12c source pipeline builds the sample model and opens System", async ({ page }) => {
  await openVisualizer(page);

  await expect(page.getByRole("heading", { name: "Stage 12c source pipeline" })).toBeVisible();
  await expect(page.getByTestId(ids.source.panel)).toBeVisible();
  await expect(page.getByLabel("Source editor")).toContainText("playerMachine");
  await expect(page.getByTestId(ids.source.summary)).toContainText("version 1");
  await expect(page.getByTestId(ids.source.status)).toContainText("model idle");

  await openSourceModel(page);

  await expect(tabButton(page, "System")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "System inventory" })).toBeVisible();
  await expect(page.getByTestId(ids.source.summary)).toContainText("model ready");
  await expect(page.getByTestId(ids.source.summary)).toContainText("diagnostics 0");
  await expect(page.getByText("Model ready with 1 machines. L1 inventory rendering starts in stage 12d.")).toBeVisible();
  await expect(page.getByText("Machines").first()).toBeVisible();
  await expect(page.getByText("Topics").first()).toBeVisible();
  await expect(page.getByTestId(ids.tabs.trigger.system)).toContainText("1");
  await expect(page.getByTestId(ids.tabs.trigger.events)).toContainText("3");

  await expect(page.getByTestId(ids.console.channels)).toBeVisible();
  await expect(page.getByTestId(ids.console.channelAll)).toContainText("1");
  await expect(page.getByTestId(ids.console.channelSystem)).toContainText("1");
  await expect(page.getByTestId(ids.console.channelDiagnostics)).toContainText("0");
  await expect(page.getByTestId(ids.console.entries)).toContainText("Source pipeline started");
});

test("12c diagnostics, reset and source edit invalidation stay controlled", async ({ page }) => {
  await openVisualizer(page);

  await page.getByLabel("Source editor").fill("export const broken = ;");
  await page.getByTestId(ids.source.open).click();
  await expect(page.getByTestId(ids.source.status)).toContainText("model ready");
  await expect(page.getByTestId(ids.source.summary)).not.toContainText("diagnostics 0");

  await page.getByTestId(ids.console.channelDiagnostics).click();
  await expect(page.getByTestId(ids.console.entries)).toContainText("LFG_SOURCE_PARSE_ERROR");

  await page.getByTestId(ids.source.reset).click();
  await expect(page.getByLabel("Source editor")).toContainText("playerMachine");
  await expect(page.getByTestId(ids.source.status)).toContainText("model idle");
  await expect(page.getByTestId(ids.console.entries)).toContainText("No console entries in this channel.");

  await openSourceModel(page);
  await page.getByLabel("Source editor").fill("export const changed = 1;");

  await expect(page.getByTestId(ids.source.status)).toContainText("model idle");
  await expect(page.getByTestId(ids.tabs.trigger.system)).toContainText("0");
  await expect(page.getByTestId(ids.tabs.trigger.events)).toContainText("0");
  await expect(page.getByTestId(ids.console.entries)).toContainText("No console entries in this channel.");
});

test("12c source editor disables Open visualizer for blank source and reenables after text", async ({ page }) => {
  await openVisualizer(page);

  await page.getByLabel("Source editor").fill("   ");
  await expect(page.getByTestId(ids.source.open)).toBeDisabled();
  await expect(page.getByTestId(ids.source.status)).toContainText("model idle");
  await expect(page.getByTestId(ids.source.summary)).toContainText("version 2");

  await page.getByLabel("Source editor").fill("export const value = 1;");
  await expect(page.getByTestId(ids.source.open)).toBeEnabled();
  await page.getByTestId(ids.source.open).click();

  await expect(page.getByTestId(ids.source.status)).toContainText("model ready");
  await expect(page.getByRole("heading", { name: "System inventory" })).toBeVisible();
  await expect(page.getByTestId(ids.tabs.trigger.system)).toContainText("0");
  await expect(page.getByTestId(ids.tabs.trigger.events)).toContainText("0");
  await page.getByTestId(ids.console.channelSystem).click();
  await expect(page.getByTestId(ids.console.entries)).toContainText("Compiling sample.ts");
});

test("12c console controls, focus and responsive floor remain stable", async ({ page }) => {
  await openVisualizer(page);

  await page.keyboard.press("Tab");
  await expect(page.getByTestId(ids.console.toggle)).toBeFocused();

  await openSourceModel(page);

  await page.getByTestId(ids.console.close).click();
  await expect(page.getByTestId(ids.console.panel)).toBeHidden();
  await page.getByTestId(ids.console.toggle).click();
  await expect(page.getByTestId(ids.console.panel)).toBeVisible();

  await page.getByTestId(ids.console.channelSystem).click();
  await expect(page.getByTestId(ids.console.entries)).toContainText("Compiling sample.ts");
  await page.getByTestId(ids.console.channelDiagnostics).click();
  await expect(page.getByTestId(ids.console.entries)).toContainText("No console entries in this channel.");
  await expect(page.getByText("docs")).toHaveCount(0);
  await expect(page.getByText("playground")).toHaveCount(0);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 560 },
    { width: 360, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { name: "Stage 12c source pipeline" })).toBeVisible();
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  }
});
