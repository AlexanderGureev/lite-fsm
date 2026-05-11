import type { GraphSourceAnchor } from "@lite-fsm/graph/view-model";
import { describe, expect, it } from "vitest";
import { buildWorkbenchCardModel } from "./build";

const sourceAnchor = { kind: "machine", editable: false } as GraphSourceAnchor;

const workbench = (rows: readonly unknown[], globalBehavior: readonly unknown[] = []) =>
  ({
    machineId: "player",
    title: "player",
    kind: "domain",
    sourceAnchors: [sourceAnchor],
    globalBehavior,
    states: [
      {
        badges: [{ kind: "initial", label: "initial" }, { kind: "initial", label: "initial" }],
        rows,
      },
    ],
  }) as never;

describe("построитель карточек workbench", () => {
  it("строит sections, actions и отключенный intent редактирования исходника", () => {
    const card = buildWorkbenchCardModel(
      workbench([
        { kind: "config" },
        { kind: "reducer" },
        { kind: "effect" },
        { kind: "diagnostic" },
        { kind: "unknown" },
      ]),
    );

    expect(card.cardId).toBe("machine-card:player");
    expect(card.origin).toEqual({
      kind: "ir",
      ref: { kind: "machine", machineId: "player" },
      sourceAnchors: [sourceAnchor],
    });
    expect(card.sections.map((section) => [section.kind, section.rows.length])).toEqual([
      ["accepted-events", 2],
      ["effects", 1],
      ["diagnostics", 1],
      ["unknown", 1],
    ]);
    expect(card.badges).toEqual([{ kind: "initial", label: "initial" }]);
    expect(card.actions.find((action) => action.kind === "propose-source-edit")).toMatchObject({
      enabled: false,
      intent: { kind: "add-state", machineId: "player", stateKey: "" },
    });
    expect(card.actions.find((action) => action.kind === "select-source")).toEqual({
      kind: "select-source",
      anchors: [sourceAnchor],
    });
    expect(card.editable).toEqual({ kind: "readonly", reason: "analysis-only" });
  });

  it("включает global behavior rows в те же sections", () => {
    const card = buildWorkbenchCardModel(workbench([{ kind: "config" }], [{ kind: "effect" }, { kind: "unknown" }]));

    expect(card.sections.map((section) => [section.sectionId, section.title, section.rows.map((row) => row.kind)])).toEqual([
      ["player:accepted-events", "Accepted events", ["config"]],
      ["player:effects", "Effects", ["effect"]],
      ["player:unknown", "Unknown", ["unknown"]],
    ]);
  });

  it("не добавляет пустые sections", () => {
    expect(buildWorkbenchCardModel(workbench([])).sections).toEqual([]);
  });
});
