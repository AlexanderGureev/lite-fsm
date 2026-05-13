import { expect, test, type Page } from "@playwright/test";
import { VISUALIZER_TEST_IDS } from "../../src/test-ids";
import {
  machineCanvasOnboardingSource,
  machineCanvasXstateSource,
} from "../fixtures/machine-canvas-sources";
import { openVisualizer, tabButton } from "./helpers";

const ids = VISUALIZER_TEST_IDS;

const openSourceModel = async (page: Page) => {
  await page.getByTestId(ids.source.open).click();
  await expect(page.getByTestId(ids.source.status)).toHaveAttribute("data-status", "ready");
};

const sourceEditor = (page: Page) => page.getByTestId(ids.source.editor);
const sourceEditorContent = (page: Page) => sourceEditor(page).locator(".cm-content");

const fillSource = async (page: Page, source: string) => {
  await sourceEditorContent(page).fill(source);
};

const systemMachine = (page: Page, machineId: string) =>
  page.locator(`[data-testid="${ids.system.machineRow}"][data-machine-id="${machineId}"]`);

const machineCard = (page: Page, machineId: string) =>
  page.locator(`[data-testid="${ids.workbench.machineCard}"][data-machine-id="${machineId}"]`);

const openMachineCanvas = async (page: Page, source: string, machineId: string) => {
  await fillSource(page, source);
  await openSourceModel(page);
  await systemMachine(page, machineId).click();
  await page.getByTestId(ids.system.openInWorkbench).click();
  await expect(tabButton(page, "machines")).toHaveAttribute("aria-selected", "true");
  await expect(machineCard(page, machineId)).toBeVisible();
  await machineCard(page, machineId).getByTestId(ids.canvas.openAction).click();
  await expect(page.getByTestId(ids.canvas.board)).toBeVisible();
  await expect(page.getByTestId(ids.canvas.graph)).toHaveAttribute("data-density", /^(normal|dense|very-dense)$/);
};

const stateNodeByRef = (page: Page, ref: string) =>
  page.locator(`[data-testid="${ids.canvas.stateNode}"][data-node-ref="${ref}"]`);

const edgeLabel = (page: Page, text: string) => page.getByTestId(ids.canvas.edgeLabel).filter({ hasText: text });

const expectEdgeLabelsOutsideStateNodes = async (page: Page) => {
  const overlaps = await page.evaluate(
    ({ edgeLabelTestId, stateNodeTestId }) => {
      const edgeLabels = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${edgeLabelTestId}"]`));
      const stateNodes = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${stateNodeTestId}"]`));

      return edgeLabels.flatMap((label) => {
        const labelRect = label.getBoundingClientRect();
        return stateNodes
          .filter((node) => {
            const nodeRect = node.getBoundingClientRect();
            return (
              labelRect.left < nodeRect.right - 1 &&
              labelRect.right > nodeRect.left + 1 &&
              labelRect.top < nodeRect.bottom - 1 &&
              labelRect.bottom > nodeRect.top + 1
            );
          })
          .map((node) => ({
            label: label.textContent,
            node: node.getAttribute("data-node-ref"),
          }));
      });
    },
    {
      edgeLabelTestId: ids.canvas.edgeLabel,
      stateNodeTestId: ids.canvas.stateNode,
    },
  );

  expect(overlaps).toEqual([]);
};

const expectNoHorizontalOverflow = async (page: Page) => {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));

  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
};

test("12h Machine Canvas hardening показывает onboarding story без dispatch из graph", async ({ page }) => {
  await openVisualizer(page);
  await openMachineCanvas(page, machineCanvasOnboardingSource, "onboarding");

  await expect(stateNodeByRef(page, "wildcard-state")).toBeVisible();
  await expect(stateNodeByRef(page, "wildcard-effect")).toBeVisible();
  await expect(edgeLabel(page, "SUBSCRIPTION_HYDRATED")).toContainText("+1");
  await expect(edgeLabel(page, "PING")).toHaveAttribute("data-edge-direction", "self");
  await expect(edgeLabel(page, "CHECK_ONBOARDING_RESOLVE")).toHaveAttribute("data-edge-kind", "self-emitted-transition");
  await expect(edgeLabel(page, "CHECK_ONBOARDING_REJECT")).toHaveAttribute("data-edge-kind", "self-emitted-transition");
  await expect(page.getByTestId(ids.canvas.emissionChip)).toHaveAttribute("title", /ONBOARDING_TRACE/);
  await expect(edgeLabel(page, "ONBOARDING_TRACE")).toHaveCount(0);
  await expectEdgeLabelsOutsideStateNodes(page);

  await edgeLabel(page, "CHECK_ONBOARDING_RESOLVE").hover();
  await expect(page.getByTestId(ids.canvas.edgePopover)).toContainText("self-emitted");
  await expect(page.getByTestId(ids.canvas.edgePopover)).toContainText("onboarding.CHECK_ONBOARDING");

  const timelineCount = await page.getByTestId(ids.workbench.timelineStep).count();
  await page.getByTestId(ids.canvas.stateNode).first().click({ force: true });
  await edgeLabel(page, "CHECK_ONBOARDING_RESOLVE").click();
  await expect(page.getByTestId(ids.workbench.timelineStep)).toHaveCount(timelineCount);
  await expect(page.getByTestId(ids.canvas.board)).toContainText("current IDLE");

  await expect(page.locator(".react-flow__controls")).toBeVisible();
  expect(await page.locator(".react-flow__controls-button").count()).toBeGreaterThanOrEqual(2);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 760 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId(ids.canvas.board)).toBeVisible();
    await expect(page.getByTestId(ids.canvas.stateNode).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  await page.keyboard.press("Escape");
  await expect(page.getByTestId(ids.canvas.board)).toHaveCount(0);

  await machineCard(page, "onboarding").getByTestId(ids.canvas.openAction).click();
  await expect(page.getByTestId(ids.canvas.board)).toBeVisible();
  await page.getByTestId(ids.canvas.close).click();
  await expect(page.getByTestId(ids.canvas.board)).toHaveCount(0);

  await machineCard(page, "onboarding").getByTestId(ids.canvas.openAction).click();
  await expect(page.getByTestId(ids.canvas.board)).toBeVisible();
  await tabButton(page, "source").click();
  await fillSource(page, "export const changed = 1;");
  await expect(page.getByTestId(ids.source.status)).toHaveAttribute("data-status", "idle");
  await tabButton(page, "machines").click();
  await expect(page.getByTestId(ids.canvas.board)).toHaveCount(0);
});

test("12h Machine Canvas hardening показывает actor template из xstate fixture", async ({ page }) => {
  await openVisualizer(page);
  await openMachineCanvas(page, machineCanvasXstateSource, "actorTemplate");

  await expect(page.getByTestId(ids.canvas.board)).toContainText("actor");
  await expect(page.getByTestId(ids.canvas.board)).toContainText("tag:jobs");
  await expect(edgeLabel(page, "COMPLETE").first()).toHaveAttribute("data-edge-kind", "self-emitted-transition");
  await edgeLabel(page, "COMPLETE").first().hover();
  await expect(page.getByTestId(ids.canvas.edgePopover)).toContainText("actor:job-1");

  await expect(page.getByTestId(ids.canvas.stateNode).filter({ hasText: "__INIT" })).toHaveAttribute("data-node-role", "current");
  await expect(page.getByTestId(ids.canvas.stateNode).filter({ hasText: "__INIT" })).toContainText("spawn");
  await expect(page.getByTestId(ids.canvas.stateNode).filter({ hasText: "__RESOLVED" })).toHaveAttribute("data-node-role", "terminal");
  await expect(page.getByTestId(ids.canvas.stateNode).filter({ hasText: "__REJECTED" })).toHaveAttribute("data-node-role", "terminal");
  await expect(page.getByTestId(ids.canvas.stateNode).filter({ hasText: "__CANCELLED" })).toHaveAttribute("data-node-role", "terminal");
  await expect(page.getByTestId(ids.canvas.stateNode).filter({ hasText: "job-1" })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 760 });
  await expect(page.getByTestId(ids.canvas.graph)).toHaveAttribute("data-density", /^(normal|dense|very-dense)$/);
  await expect(page.getByTestId(ids.canvas.stateNode).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
