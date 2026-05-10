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
  await expect(page.getByTestId(ids.source.status)).toContainText("model ready");
};

test("12d sample source opens real System inventory with search, highlight and source overlay", async ({ page }) => {
  await openVisualizer(page);

  await expect(page.getByRole("heading", { name: "Stage 12d read-only graph views" })).toBeVisible();
  await expect(page.getByLabel("Source editor")).toContainText("playerMachine");
  await expect(page.getByTestId(ids.source.status)).toContainText("model idle");

  await openSourceModel(page);

  await expect(tabButton(page, "System")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId(ids.system.panel)).toBeVisible();
  await expect(page.getByTestId(ids.system.machineList)).toContainText("playerMachine");
  await expect(page.getByTestId(ids.system.topicList)).toContainText("PLAY");
  await expect(page.getByTestId(ids.system.topicList)).toContainText("STOP");
  await expect(page.getByTestId(ids.tabs.trigger.system)).toContainText("1");
  await expect(page.getByTestId(ids.tabs.trigger.events)).toContainText("3");

  await page.getByTestId(ids.system.machineSearch).fill("player");
  await expect(page.getByTestId(ids.system.machineList)).toContainText("playerMachine");
  await page.getByTestId(ids.system.topicSearch).fill("STOP");
  await expect(page.getByTestId(ids.system.topicList)).toContainText("STOP");
  await expect(page.getByTestId(ids.system.topicList)).not.toContainText("PAUSE");
  await page.getByTestId(ids.system.topicSearch).fill("");

  await page.getByRole("button", { name: /playerMachine/ }).click();
  await expect(page.getByTestId(ids.system.details)).toContainText("Consumed topics");
  await expect(page.getByTestId(ids.system.topicList).getByRole("button", { name: /STOP/ })).toHaveAttribute(
    "data-relation-state",
    "related",
  );

  await page.getByTestId(ids.system.viewSource).click();
  await expect(page.getByTestId(ids.source.overlay)).toBeVisible();
  await expect(page.getByTestId(ids.source.snippet)).toContainText("playerMachine");
  await page.getByTestId(ids.source.overlayClose).click();
  await expect(page.getByTestId(ids.source.overlay)).toBeHidden();
});

test("12d controlled fixture exposes L1 to L2 navigation, routing, branches and unknown rows", async ({ page }) => {
  await openVisualizer(page);

  await page.getByLabel("Source editor").fill(fixtureSource);
  await openSourceModel(page);

  await expect(page.getByTestId(ids.system.machineList)).toContainText("flowMachine");
  await expect(page.getByTestId(ids.system.machineList)).toContainText("auditMachine");
  await expect(page.getByTestId(ids.system.topicList)).toContainText("DYNAMIC");

  await page.getByRole("button", { name: /DONE/ }).first().click();
  await expect(page.getByTestId(ids.system.details)).toContainText("flowMachine");
  await expect(page.getByTestId(ids.system.details)).toContainText("workerMachine");
  await page.getByTestId(ids.system.openInEvents).click();

  await expect(tabButton(page, "Events")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId(ids.events.panel)).toBeVisible();
  await expect(page.getByTestId(ids.events.details)).toContainText("DONE");
  await expect(page.getByTestId(ids.events.routingValues)).toContainText("tag:reviewers");
  await expect(page.getByTestId(ids.events.producers)).toContainText("flowMachine");
  await expect(page.getByTestId(ids.events.consumers)).toContainText("workerMachine");

  await page.getByTestId(ids.events.list).getByRole("button", { name: /START/ }).click();
  await expect(page.getByTestId(ids.events.details)).toContainText("branches 3");
  await expect(page.getByTestId(ids.events.consumers)).toContainText("done");
  await expect(page.getByTestId(ids.events.consumers)).toContainText("loading");

  await page.getByTestId(ids.events.list).getByRole("button", { name: /DYNAMIC/ }).click();
  await expect(page.getByTestId(ids.events.routingValues)).toContainText("tag:LFG_UNSUPPORTED_EXPRESSION");
  await expect(page.getByTestId(ids.events.producers)).toContainText("partial");

  await page.getByTestId(ids.events.list).getByRole("button", { name: /UNKNOWN/ }).click();
  await expect(page.getByTestId(ids.events.routingValues)).toContainText("action.meta");
  await expect(page.getByTestId(ids.events.producers)).toContainText("unknown");

  await page.getByTestId(ids.events.search).fill("ping");
  await expect(page.getByTestId(ids.events.list)).toContainText("PING");
  await expect(page.getByTestId(ids.events.list)).not.toContainText("DONE");
});

test("12d diagnostics remain in the shared console and navigate to source anchors", async ({ page }) => {
  await openVisualizer(page);

  await page.getByLabel("Source editor").fill("export const broken = ;");
  await openSourceModel(page);
  await tabButton(page, "Source").click();
  await expect(page.getByTestId(ids.source.summary)).not.toContainText("diagnostics 0");

  await page.getByTestId(ids.console.toggle).click();
  await page.getByTestId(ids.console.channelDiagnostics).click();
  await expect(page.getByTestId(ids.console.entries)).toContainText("LFG_SOURCE_PARSE_ERROR");
  await page.getByRole("button", { name: /LFG_SOURCE_PARSE_ERROR/ }).click();
  await expect(page.getByTestId(ids.source.overlay)).toBeVisible();
  await expect(page.getByTestId(ids.source.snippet)).toContainText("export const broken");
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
    await expect(page.getByRole("heading", { name: "Stage 12d read-only graph views" })).toBeVisible();
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  }
});
