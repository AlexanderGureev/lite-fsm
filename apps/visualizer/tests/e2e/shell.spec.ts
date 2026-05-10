import { expect, test } from "@playwright/test";
import { VISUALIZER_TEST_IDS } from "../../src/test-ids";
import { openVisualizer, tabButton } from "./helpers";

const ids = VISUALIZER_TEST_IDS;

const fixtureSource = `import { createMachine } from "@lite-fsm/core";

const REVIEW_GROUP = "reviewers";

export const flowMachine = createMachine({
  config: {
    idle: {
      START: null,
    },
    loading: {
      DONE: "done",
      DYNAMIC: "done",
      UNKNOWN: "failed",
      FAIL: "failed",
    },
    done: {
      RESET: "idle",
    },
    failed: {
      RESET: "idle",
    },
  },
  initialState: "idle",
  initialContext: {},
  reducer: (state, action, { nextState }) => {
    if (action.type === "START" && action.payload.fast) {
      state.state = "done";
      return;
    }

    if (action.type === "START") {
      state.state = "loading";
      return;
    }

    state.state = nextState;
  },
  effects: {
    loading: ({ transition, action }) => {
      transition({ type: "DONE", meta: { groupTag: REVIEW_GROUP } });
      transition({ type: "DYNAMIC", meta: { groupTag: action.payload.group } });
      transition({ type: "UNKNOWN", meta: action.meta });
    },
  },
});

export const workerMachine = createMachine({
  groupTag: "reviewers",
  config: {
    idle: {
      DONE: "done",
      DYNAMIC: "done",
    },
    done: {},
  },
  initialState: "idle",
  initialContext: {},
});

export const auditMachine = createMachine({
  config: {
    idle: {
      PING: "idle",
    },
  },
  initialState: "idle",
  initialContext: {},
});
`;

const openSourceModel = async (page: import("@playwright/test").Page) => {
  await page.getByTestId(ids.source.open).click();
  await expect(page.getByTestId(ids.source.status)).toHaveAttribute("data-status", "ready");
};

const sourceEditor = (page: import("@playwright/test").Page) => page.getByTestId(ids.source.editor);
const sourceEditorContent = (page: import("@playwright/test").Page) => sourceEditor(page).locator(".cm-content");

const fillSource = async (page: import("@playwright/test").Page, source: string) => {
  await sourceEditorContent(page).fill(source);
};

const systemMachine = (page: import("@playwright/test").Page, machineId: string) =>
  page.locator(`[data-testid="${ids.system.machineRow}"][data-machine-id="${machineId}"]`);

const systemTopic = (page: import("@playwright/test").Page, eventType: string) =>
  page.locator(`[data-testid="${ids.system.topicRow}"][data-event-type="${eventType}"]`);

const eventTopic = (page: import("@playwright/test").Page, eventType: string) =>
  page.locator(`[data-testid="${ids.events.topicRow}"][data-event-type="${eventType}"]`);

const expectCodeMirrorSourceEditor = async (page: import("@playwright/test").Page) => {
  const editor = page.getByTestId(ids.source.editor);
  await expect(editor.locator(".cm-editor")).toBeVisible();
  await expect(editor.locator(".cm-lineNumbers")).toBeVisible();
  await expect(editor.locator(".cm-line").first()).toBeVisible();

  const metrics = await editor.locator(".cm-editor").evaluate((element) => {
    const editorStyle = getComputedStyle(element);
    const scroller = element.querySelector(".cm-scroller");
    const gutter = element.querySelector(".cm-gutters");

    return {
      color: editorStyle.color,
      backgroundColor: editorStyle.backgroundColor,
      fontSize: editorStyle.fontSize,
      lineHeight: scroller ? getComputedStyle(scroller).lineHeight : "",
      gutterColor: gutter ? getComputedStyle(gutter).color : "",
    };
  });

  expect(metrics.fontSize).toBe("13px");
  expect(Number.parseFloat(metrics.lineHeight)).toBeGreaterThan(18);
  expect(metrics.color).not.toBe(metrics.backgroundColor);
  expect(metrics.gutterColor).not.toBe(metrics.backgroundColor);
};

test("12c Source editor is CodeMirror and source edits invalidate the ready model", async ({ page }) => {
  await openVisualizer(page);

  await expectCodeMirrorSourceEditor(page);
  await expect(sourceEditor(page).locator(".cm-line").first()).toBeVisible();

  await openSourceModel(page);
  await tabButton(page, "source").click();
  await expect(page.getByTestId(ids.source.status)).toHaveAttribute("data-status", "ready");

  await fillSource(page, "export const changed = 1;");

  await expect(page.getByTestId(ids.source.status)).toHaveAttribute("data-status", "idle");
  await expect(page.getByTestId(ids.source.summary)).toHaveAttribute("data-version", "2");
  await expect(page.getByTestId(ids.tabs.trigger.system)).toHaveAttribute("data-count", "0");
  await expect(page.getByTestId(ids.tabs.trigger.events)).toHaveAttribute("data-count", "0");

  await page.getByTestId(ids.source.reset).click();
  await expect(sourceEditor(page).locator(".cm-line").first()).toBeVisible();
  await expect(page.getByTestId(ids.source.status)).toHaveAttribute("data-status", "idle");
  await expect(page.getByTestId(ids.source.summary)).toHaveAttribute("data-version", "3");
});

test("12d sample source opens real System inventory with search, highlight and source overlay", async ({ page }) => {
  await openVisualizer(page);

  await expect(page.getByTestId(ids.shell.root)).toBeVisible();
  await expect(sourceEditor(page).locator(".cm-line").first()).toBeVisible();
  await expect(page.getByTestId(ids.source.status)).toHaveAttribute("data-status", "idle");

  await openSourceModel(page);

  await expect(tabButton(page, "system")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId(ids.system.panel)).toBeVisible();
  await expect(page.getByTestId(ids.system.machineRow)).toHaveCount(1);
  await expect(page.getByTestId(ids.system.topicRow)).toHaveCount(3);
  await expect(page.getByTestId(ids.tabs.trigger.system)).toHaveAttribute("data-count", "1");
  await expect(page.getByTestId(ids.tabs.trigger.events)).toHaveAttribute("data-count", "3");

  const firstMachineId = await page.getByTestId(ids.system.machineRow).first().getAttribute("data-machine-id");
  const firstTopicType = await page.getByTestId(ids.system.topicRow).first().getAttribute("data-event-type");
  if (!firstMachineId || !firstTopicType) throw new Error("Sample projection is missing row identifiers.");

  await page.getByTestId(ids.system.machineSearch).fill(firstMachineId);
  await expect(systemMachine(page, firstMachineId)).toBeVisible();
  await page.getByTestId(ids.system.topicSearch).fill(firstTopicType);
  await expect(systemTopic(page, firstTopicType)).toBeVisible();
  await expect(page.getByTestId(ids.system.topicRow)).toHaveCount(1);
  await page.getByTestId(ids.system.topicSearch).fill("");
  await page.getByTestId(ids.system.machineSearch).fill("");

  const sampleMachine = systemMachine(page, firstMachineId);

  await sampleMachine.hover();
  const relatedTopic = page.locator(`[data-testid="${ids.system.topicRow}"][data-relation-state="related"]`).first();
  await expect(relatedTopic).toBeVisible();
  const relatedTopicType = await relatedTopic.getAttribute("data-event-type");
  if (!relatedTopicType) throw new Error("Sample projection is missing related topic identifier.");

  await relatedTopic.hover();
  await expect(sampleMachine).toHaveAttribute("data-relation-state", "related");

  await sampleMachine.click();
  await expect(page.getByTestId(ids.system.details)).toHaveAttribute("data-detail-kind", "machine");
  await expect(systemTopic(page, relatedTopicType)).toHaveAttribute("data-relation-state", "related");
  await systemTopic(page, relatedTopicType).click();
  await expect(sampleMachine).toHaveAttribute("data-relation-state", "related");
  await sampleMachine.click();

  await page.getByTestId(ids.system.viewSource).click();
  await expect(page.getByTestId(ids.source.overlay)).toBeVisible();
  await expect(page.getByTestId(ids.source.snippet).locator(".cm-editor")).toBeVisible();
  await expect(page.getByTestId(ids.source.snippet).locator(".cm-lineNumbers")).toBeVisible();
  await expect(page.getByTestId(ids.source.snippet)).toHaveAttribute("data-readonly", "true");
  await page.getByTestId(ids.source.overlayClose).click();
  await expect(page.getByTestId(ids.source.overlay)).toBeHidden();

  const machineCount = await page.getByTestId(ids.tabs.trigger.system).getAttribute("data-count");
  await page.getByTestId(ids.system.openInWorkbench).click();
  await expect(tabButton(page, "machines")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId(ids.workbench.panel)).toBeVisible();
  await expect(page.getByTestId(ids.tabs.trigger.machines)).toHaveAttribute("data-count", `1/${machineCount}`);
});

test("12d controlled fixture exposes L1 to L2 navigation, routing, branches and unknown rows", async ({ page }) => {
  await openVisualizer(page);

  await fillSource(page, fixtureSource);
  await openSourceModel(page);

  await expect(systemMachine(page, "flowMachine")).toBeVisible();
  await expect(systemMachine(page, "auditMachine")).toBeVisible();
  await expect(systemTopic(page, "DYNAMIC")).toBeVisible();

  await systemTopic(page, "DONE").click();
  await expect(page.getByTestId(ids.system.details)).toHaveAttribute("data-detail-kind", "topic");
  await expect(page.getByTestId(ids.system.detailProducers)).toHaveAttribute("data-values", "flowMachine");
  await expect(page.getByTestId(ids.system.detailConsumers)).toHaveAttribute("data-values", "flowMachine|workerMachine");
  await page.getByTestId(ids.system.openInEvents).click();

  await expect(tabButton(page, "events")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId(ids.events.panel)).toBeVisible();
  await expect(page.getByTestId(ids.events.detailTopic)).toHaveAttribute("data-event-type", "DONE");
  await expect(page.locator(`[data-testid="${ids.events.routingValue}"][data-label="tag:reviewers"]`)).toHaveAttribute(
    "data-confidence",
    "exact",
  );
  await expect(page.locator(`[data-testid="${ids.events.producerRow}"][data-machine-id="flowMachine"]`).first()).toBeVisible();
  await expect(page.locator(`[data-testid="${ids.events.consumerRow}"][data-machine-id="workerMachine"]`).first()).toBeVisible();

  await eventTopic(page, "START").click();
  await expect(page.locator(`[data-testid="${ids.events.consumerRow}"][data-branch-count="3"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="${ids.events.consumerBranch}"][data-target-label="done"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="${ids.events.consumerBranch}"][data-target-label="loading"]`)).toBeVisible();

  await eventTopic(page, "DYNAMIC").click();
  await expect(
    page.locator(`[data-testid="${ids.events.routingValue}"][data-label="tag:LFG_UNSUPPORTED_EXPRESSION"]`),
  ).toHaveAttribute("data-confidence", "unknown");
  await expect(page.locator(`[data-testid="${ids.events.producerRow}"][data-confidence="partial"]`).first()).toBeVisible();

  await eventTopic(page, "UNKNOWN").click();
  await expect(page.locator(`[data-testid="${ids.events.routingValue}"][data-label="action.meta"]`)).toHaveAttribute(
    "data-confidence",
    "unknown",
  );
  await expect(page.locator(`[data-testid="${ids.events.producerRow}"][data-confidence="unknown"]`).first()).toBeVisible();

  await page.getByTestId(ids.events.search).fill("ping");
  await expect(eventTopic(page, "PING")).toBeVisible();
  await expect(eventTopic(page, "DONE")).toHaveCount(0);
});

test("12d diagnostics remain in the shared console and navigate to source anchors", async ({ page }) => {
  await openVisualizer(page);

  await fillSource(page, "export const broken = ;");
  await openSourceModel(page);
  await tabButton(page, "source").click();
  await expect(page.getByTestId(ids.source.summary)).not.toHaveAttribute("data-diagnostic-count", "0");

  await page.getByTestId(ids.console.toggle).click();
  await page.getByTestId(ids.console.channelDiagnostics).click();
  await expect(page.getByTestId(ids.console.entries)).toHaveAttribute("data-empty", "false");
  await page.locator(`[data-testid="${ids.console.entry}"][data-channel="diagnostics"]`).first().click();
  await expect(page.getByTestId(ids.source.overlay)).toBeVisible();
  await expect(page.getByTestId(ids.source.snippet).locator(".cm-editor")).toBeVisible();
  await expect(page.getByTestId(ids.source.snippet)).toHaveAttribute("data-readonly", "true");

  await fillSource(page, "export const fixed = 1;");
  await expect(page.getByTestId(ids.source.overlay)).toBeHidden();
  await expect(page.getByTestId(ids.source.status)).toHaveAttribute("data-status", "idle");
});

test("12d console controls, focus and responsive floor remain stable", async ({ page }) => {
  await openVisualizer(page);

  await page.getByTestId(ids.console.toggle).focus();
  await expect(page.getByTestId(ids.console.toggle)).toBeFocused();

  await openSourceModel(page);

  await expect(page.getByTestId(ids.console.panel)).toBeHidden();
  await page.getByTestId(ids.console.toggle).click();
  await expect(page.getByTestId(ids.console.panel)).toBeVisible();
  await page.getByTestId(ids.console.close).click();
  await expect(page.getByTestId(ids.console.panel)).toBeHidden();
  await page.getByTestId(ids.console.toggle).click();
  await expect(page.getByTestId(ids.console.panel)).toBeVisible();

  await page.getByTestId(ids.console.channelSystem).click();
  await expect(page.getByTestId(ids.console.entries)).toHaveAttribute("data-empty", "false");
  await page.getByTestId(ids.console.channelDiagnostics).click();
  await expect(page.getByTestId(ids.console.entries)).toHaveAttribute("data-empty", "true");
  await expect(page.locator('a[href*="docs"]')).toHaveCount(0);
  await expect(page.locator('a[href*="playground"]')).toHaveCount(0);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 560 },
    { width: 360, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId(ids.shell.root)).toBeVisible();
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  }
});
