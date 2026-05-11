import { expect, test, type Page } from "@playwright/test";
import { VISUALIZER_TEST_IDS } from "../../src/test-ids";
import { openVisualizer, tabButton } from "./helpers";

const ids = VISUALIZER_TEST_IDS;

const sourceEditor = (page: Page) => page.getByTestId(ids.source.editor);
const sourceEditorContent = (page: Page) => sourceEditor(page).locator(".cm-content");

const fillSource = async (page: Page, source: string) => {
  await sourceEditorContent(page).fill(source);
};

const openSourceModel = async (page: Page) => {
  await page.getByTestId(ids.source.open).click();
  await expect(page.getByTestId(ids.source.status)).toHaveAttribute("data-status", "ready");
};

const systemMachine = (page: Page, machineId: string) =>
  page.locator(`[data-testid="${ids.system.machineRow}"][data-machine-id="${machineId}"]`);

const systemTopic = (page: Page, eventType: string) =>
  page.locator(`[data-testid="${ids.system.topicRow}"][data-event-type="${eventType}"]`);

const eventTopic = (page: Page, eventType: string) =>
  page.locator(`[data-testid="${ids.events.topicRow}"][data-event-type="${eventType}"]`);

const workbenchRow = (page: Page, testId: string, eventType: string) =>
  page.locator(`[data-testid="${testId}"][data-event-type="${eventType}"]`);

const timelineStep = (page: Page, eventType: string) =>
  page.locator(`[data-testid="${ids.workbench.timelineStep}"][data-event-type="${eventType}"]`);

const expectNoHorizontalOverflow = async (page: Page) => {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasOverflow).toBe(false);
};

const longLabelSource = `import { createMachine } from "@lite-fsm/core";

export const extremelyLongMachineNameForStageTwelveFinalRegressionAndWrappingAudit = createMachine({
  groupTag: "extremely-long-group-tag-for-stage-twelve-final-regression",
  config: {
    "idle_state_with_a_very_long_name_that_must_wrap_without_breaking_the_panel": {
      "EXTREMELY_LONG_EVENT_NAME_FOR_STAGE_TWELVE_FINAL_REGRESSION_THAT_MUST_WRAP_WITHOUT_HORIZONTAL_OVERFLOW":
        "loading_state_with_a_very_long_name_that_must_wrap_without_breaking_the_panel",
    },
    "loading_state_with_a_very_long_name_that_must_wrap_without_breaking_the_panel": {
      "RESET_EVENT_WITH_A_VERY_LONG_NAME_THAT_SHOULD_STAY_READABLE": "idle_state_with_a_very_long_name_that_must_wrap_without_breaking_the_panel",
    },
  },
  initialState: "idle_state_with_a_very_long_name_that_must_wrap_without_breaking_the_panel",
  initialContext: {},
  reducer: (state, action, { nextState }) => {
    if (
      action.type === "EXTREMELY_LONG_EVENT_NAME_FOR_STAGE_TWELVE_FINAL_REGRESSION_THAT_MUST_WRAP_WITHOUT_HORIZONTAL_OVERFLOW" &&
      action.payload.guardFlagWithAnIntentionallyLongNameForWrapping === true
    ) {
      state.state = "loading_state_with_a_very_long_name_that_must_wrap_without_breaking_the_panel";
      return;
    }

    state.state = nextState;
  },
});
`;

test("12f regression проходит source -> L1 -> L2 -> L3 -> simulation -> source overlay", async ({ page }) => {
  await openVisualizer(page);
  await openSourceModel(page);

  await expect(tabButton(page, "system")).toHaveAttribute("aria-selected", "true");
  await systemTopic(page, "APP_READY").click();
  await page.getByTestId(ids.system.openInEvents).click();
  await expect(tabButton(page, "events")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId(ids.events.detailTopic)).toHaveAttribute("data-event-type", "APP_READY");

  await page.getByTestId(ids.events.openInWorkbench).click();
  await expect(tabButton(page, "machines")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId(ids.workbench.machineCard).first()).toBeVisible();
  await page.getByTestId(ids.workbench.sourceAction).first().click();
  await expect(page.getByTestId(ids.source.overlay)).toBeVisible();
  await expect(page.getByTestId(ids.source.overlayDescription)).not.toHaveAttribute("data-location-label", "");
  await page.getByTestId(ids.source.overlayClose).click();

  await workbenchRow(page, ids.workbench.row.config, "APP_READY").click();
  await expect(timelineStep(page, "APP_READY")).toHaveAttribute("data-source", "manual cfg");
  await timelineStep(page, "APP_READY").click();
  await expect(timelineStep(page, "APP_READY")).toHaveAttribute("data-selected", "true");
  await expect(workbenchRow(page, ids.workbench.row.config, "APP_READY")).toHaveAttribute("data-inspected", "true");

  await page.getByTestId(ids.console.toggle).click();
  await page.getByTestId(ids.console.channelSystem).click();
  await expect(page.getByTestId(ids.console.entries)).toHaveAttribute("data-empty", "false");
  await expectNoHorizontalOverflow(page);
});

test("12f diagnostics badges показывают errors, line/column и переход к source overlay", async ({ page }) => {
  await openVisualizer(page);

  await fillSource(page, "export const broken = ;");
  await page.getByTestId(ids.source.open).click();
  await tabButton(page, "source").click();

  await expect(page.getByTestId(ids.source.summary)).not.toHaveAttribute("data-diagnostic-count", "0");
  await expect(tabButton(page, "source")).not.toHaveAttribute("data-diagnostic-count", "0");
  await expect(tabButton(page, "source")).toHaveAttribute("data-has-error", "true");
  await expect(page.locator(`[data-testid="${ids.tabs.diagnosticBadge}"][data-tab="source"]`)).toBeVisible();

  await page.getByTestId(ids.console.toggle).click();
  await page.getByTestId(ids.console.channelDiagnostics).click();
  const entry = page.locator(`[data-testid="${ids.console.entry}"][data-channel="diagnostics"]`).first();
  await expect(entry).toBeVisible();
  await expect(entry).toContainText(/line \d+, column \d+/);

  await entry.click();
  await expect(page.getByTestId(ids.source.overlay)).toBeVisible();
  await expect(page.getByTestId(ids.source.overlayDescription)).not.toHaveAttribute("data-location-label", "");
  await expect(page.getByTestId(ids.source.snippet).locator(".cm-lineNumbers")).toBeVisible();
});

test("12f empty и loading states проходят через обычный Source flow", async ({ page }) => {
  await openVisualizer(page, { visualizerPipelineDelayMs: 650 });

  await page.getByTestId(ids.source.open).click();
  await expect(page.getByTestId(ids.source.summary)).toHaveAttribute("data-compile-status", "running");
  await expect(page.getByTestId(ids.source.open)).toBeDisabled();
  await expect(page.getByTestId(ids.source.status)).toHaveAttribute("data-status", "ready");

  await tabButton(page, "source").click();
  await fillSource(page, "export const noMachinesHere = 1;");
  await openSourceModel(page);
  await expect(page.getByTestId(ids.system.machineEmpty)).toBeVisible();
  await expect(page.getByTestId(ids.system.topicEmpty)).toBeVisible();

  await tabButton(page, "events").click();
  await expect(page.getByTestId(ids.events.listEmpty)).toBeVisible();
  await expect(page.getByTestId(ids.events.detailEmpty)).toBeVisible();

  await tabButton(page, "machines").click();
  await expect(page.getByTestId(ids.workbench.machinePicker)).toContainText("Open the visualizer");
  await expect(page.getByTestId(ids.workbench.timeline)).toHaveAttribute("data-empty", "true");
  await expectNoHorizontalOverflow(page);
});

test("12f long labels остаются читаемыми без horizontal overflow на desktop/tablet", async ({ page }) => {
  await openVisualizer(page);

  await fillSource(page, longLabelSource);
  await openSourceModel(page);

  await systemMachine(page, "extremelyLongMachineNameForStageTwelveFinalRegressionAndWrappingAudit").click();
  await systemTopic(
    page,
    "EXTREMELY_LONG_EVENT_NAME_FOR_STAGE_TWELVE_FINAL_REGRESSION_THAT_MUST_WRAP_WITHOUT_HORIZONTAL_OVERFLOW",
  ).click();
  await page.getByTestId(ids.system.openInEvents).click();
  await eventTopic(
    page,
    "EXTREMELY_LONG_EVENT_NAME_FOR_STAGE_TWELVE_FINAL_REGRESSION_THAT_MUST_WRAP_WITHOUT_HORIZONTAL_OVERFLOW",
  ).click();
  await expect(page.locator(`[data-testid="${ids.workbench.longLabel}"][data-label-kind="guard"]`).first()).toContainText(
    "guard",
  );
  await page.getByTestId(ids.events.openInWorkbench).click();

  await expect(page.getByTestId(ids.workbench.longLabel).first()).toBeVisible();
  await expect(page.locator(`[data-testid="${ids.workbench.longLabel}"][data-label-kind="event"]`).first()).toContainText(
    "EXTREMELY_LONG_EVENT_NAME_FOR_STAGE_TWELVE_FINAL_REGRESSION",
  );
  await expect(page.locator(`[data-testid="${ids.workbench.longLabel}"][data-label-kind="state"]`).first()).toContainText(
    "idle_state_with_a_very_long_name",
  );

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 560 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId(ids.shell.root)).toBeVisible();
    await expect(page.getByTestId(ids.workbench.longLabel).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});
