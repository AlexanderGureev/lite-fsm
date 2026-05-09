import { expect, test } from "@playwright/test";
import { openVisualizer, tabButton } from "./helpers";

test("12a shell shows tabs, empty panels and console", async ({ page }) => {
  await openVisualizer(page);

  await expect(page.getByRole("heading", { name: "Architecture foundation" })).toBeVisible();
  await expect(tabButton(page, "Source")).toBeVisible();
  await expect(tabButton(page, "System")).toBeVisible();
  await expect(tabButton(page, "Events")).toBeVisible();
  await expect(tabButton(page, "Machines")).toBeVisible();
  await expect(page.getByRole("region", { name: "Visualizer console" })).toBeVisible();
  await expect(page.getByText("No diagnostics yet.")).toBeVisible();
  await expect(page.getByText("docs")).toHaveCount(0);
  await expect(page.getByText("playground")).toHaveCount(0);

  await tabButton(page, "System").click();
  await expect(page.getByRole("heading", { name: "System inventory" })).toBeVisible();

  await page.getByRole("button", { name: "Console" }).click();
  await expect(page.getByRole("region", { name: "Visualizer console" })).toBeHidden();
});
