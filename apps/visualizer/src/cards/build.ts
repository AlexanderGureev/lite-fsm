import type { GraphMachineWorkbenchModel, GraphWorkbenchRow } from "@lite-fsm/graph/view-model";
import type { CardSection, WorkbenchCardModel } from "./types";

const rowsOfKind = (
  rows: readonly GraphWorkbenchRow[],
  kinds: readonly GraphWorkbenchRow["kind"][],
): readonly GraphWorkbenchRow[] => rows.filter((row) => kinds.includes(row.kind));

const section = (
  sectionId: string,
  kind: CardSection["kind"],
  title: string,
  rows: readonly GraphWorkbenchRow[],
): CardSection | undefined => (rows.length > 0 ? { sectionId, kind, title, rows } : undefined);

export const buildWorkbenchCardModel = (workbench: GraphMachineWorkbenchModel): WorkbenchCardModel => {
  const rows = [
    ...workbench.globalBehavior,
    ...workbench.states.flatMap((state) => state.rows),
  ];
  const sections = [
    section(
      `${workbench.machineId}:accepted-events`,
      "accepted-events",
      "Accepted events",
      rowsOfKind(rows, ["config", "reducer"]),
    ),
    section(`${workbench.machineId}:effects`, "effects", "Effects", rowsOfKind(rows, ["effect"])),
    section(`${workbench.machineId}:diagnostics`, "diagnostics", "Diagnostics", rowsOfKind(rows, ["diagnostic"])),
    section(`${workbench.machineId}:unknown`, "unknown", "Unknown", rowsOfKind(rows, ["unknown"])),
  ].filter((candidate): candidate is CardSection => Boolean(candidate));

  return {
    cardId: `machine-card:${workbench.machineId}`,
    origin: {
      kind: "ir",
      ref: { kind: "machine", machineId: workbench.machineId },
      sourceAnchors: workbench.sourceAnchors,
    },
    title: workbench.title,
    badges: workbench.states.flatMap((state) => state.badges).filter((badge, index, all) =>
      all.findIndex((candidate) => candidate.kind === badge.kind && candidate.label === badge.label) === index,
    ),
    sections,
    actions: [
      { kind: "inspect", ref: { kind: "machine", machineId: workbench.machineId } },
      { kind: "select-source", anchors: workbench.sourceAnchors },
      {
        kind: "propose-source-edit",
        enabled: false,
        intent: { kind: "add-state", machineId: workbench.machineId, stateKey: "" },
      },
    ],
    editable: { kind: "readonly", reason: "analysis-only" },
  };
};
