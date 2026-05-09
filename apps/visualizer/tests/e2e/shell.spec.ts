import { expect, test } from "@playwright/test";
import { VISUALIZER_TEST_IDS } from "../../src/test-ids";
import { openVisualizer, tabButton } from "./helpers";

test("12b shadcn shell shows visualizer primitives and style fixture", async ({ page }) => {
  await openVisualizer(page);
  const ids = VISUALIZER_TEST_IDS;

  await expect(page.getByRole("heading", { name: "Stage 12b shadcn foundation" })).toBeVisible();
  await expect(page.getByTestId(ids.shell.root)).toBeVisible();
  await expect(page.getByTestId(ids.shell.topbar)).toBeVisible();
  await expect(page.getByTestId(ids.shell.workspace)).toBeVisible();
  await expect(page.getByTestId(ids.tabs.root)).toBeVisible();
  await expect(tabButton(page, "Source")).toBeVisible();
  await expect(tabButton(page, "System")).toBeVisible();
  await expect(tabButton(page, "Events")).toBeVisible();
  await expect(tabButton(page, "Machines")).toBeVisible();
  await expect(page.getByTestId(ids.tabs.trigger.source)).toBeVisible();
  await expect(page.getByTestId(ids.tabs.trigger.system)).toBeVisible();
  await expect(page.getByTestId(ids.tabs.trigger.events)).toBeVisible();
  await expect(page.getByTestId(ids.tabs.trigger.machines)).toBeVisible();
  await expect(page.getByRole("region", { name: "Visualizer console" })).toBeVisible();
  await expect(page.getByTestId(ids.source.panel)).toBeVisible();
  await expect(page.getByTestId(ids.workbench.panel)).toBeVisible();
  await expect(page.getByTestId(ids.console.panel)).toBeVisible();
  const sourceSearch = page.getByLabel("Search source anchors");
  const eventSearch = page.getByLabel("Search event labels");
  await expect(sourceSearch).toBeVisible();
  await expect(eventSearch).toBeVisible();
  await expect(page.getByTestId(ids.source.search)).toBeVisible();
  await expect(page.getByTestId(ids.workbench.eventSearch)).toBeVisible();
  await expect(sourceSearch).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(eventSearch).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.getByRole("combobox", { name: "Select timeline source" })).toBeVisible();
  await expect(page.getByTestId(ids.workbench.eventSourceSelect)).toBeVisible();
  await expect(page.getByTestId(ids.source.reset)).toBeVisible();
  await expect(page.getByTestId(ids.source.editor)).toBeVisible();
  await expect(page.getByTestId(ids.source.open)).toBeVisible();
  await expect(page.getByLabel("Representative source snippet")).toBeVisible();
  await expect(page.getByTestId(ids.source.snippet)).toBeVisible();
  await expect(page.getByLabel("Representative machine card")).toBeVisible();
  await expect(page.getByTestId(ids.workbench.machineCard)).toBeVisible();
  await expect(page.getByTestId(ids.workbench.sourceAction)).toBeVisible();
  await expect(page.getByTestId(ids.workbench.currentState)).toBeVisible();
  await expect(page.getByLabel("Representative console entries")).toBeVisible();
  await expect(page.getByTestId(ids.console.entries)).toBeVisible();
  await expect(page.getByText("cfg", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("eff", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("sim", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId(ids.workbench.row.config)).toBeVisible();
  await expect(page.getByTestId(ids.workbench.row.effect)).toBeVisible();
  await expect(page.getByTestId(ids.workbench.row.simulation)).toBeVisible();
  await expect(page.getByText("routing actor").first()).toBeVisible();
  await expect(page.getByText("diagnostic", { exact: true })).toBeVisible();
  await expect(page.getByText("Reducer branch is visible as a diagnostic badge.")).toBeVisible();
  await expect(page.getByTestId(ids.console.analyzerAlert)).toBeVisible();
  await expect(page.getByTestId(ids.console.simulatorAlert)).toBeVisible();
  await expect(page.getByLabel("Representative timeline")).toHaveCSS("margin-top", "12px");
  await expect(page.getByTestId(ids.console.timeline)).toBeVisible();
  await expect(page.getByTestId(ids.console.timelineSend)).toBeVisible();
  await expect(page.getByTestId(ids.console.timelineStep)).toBeVisible();
  await expect(page.getByText("PLAYER_TRACK_BUFFERING_PROGRESS_REPORTED_FROM_ACTOR_TEMPLATE_INSTANCE")).toBeVisible();
  await expect(page.getByTestId(ids.workbench.longLabel)).toBeVisible();
  await expect(page.getByText("docs")).toHaveCount(0);
  await expect(page.getByText("playground")).toHaveCount(0);

  await page.getByTestId(ids.tabs.trigger.system).click();
  await expect(page.getByRole("heading", { name: "System inventory" })).toBeVisible();

  await page.getByTestId(ids.console.toggle).click();
  await expect(page.getByTestId(ids.console.panel)).toBeHidden();
});

test("12b fixture keeps focus states and responsive floor", async ({ page }) => {
  await openVisualizer(page);
  await expect(page.getByRole("heading", { name: "Stage 12b shadcn foundation" })).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByTestId(VISUALIZER_TEST_IDS.console.toggle)).toBeFocused();

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
