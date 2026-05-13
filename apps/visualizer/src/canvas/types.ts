import type { SourceEditIntent } from "../codegen";
import type { WorkbenchCardModel } from "../cards";

export type CanvasItemOrigin =
  | { kind: "card"; cardId: string; cardOrigin: WorkbenchCardModel["origin"] }
  | { kind: "diagnostic"; diagnosticId: string }
  | { kind: "draft"; draftId: string; intent: SourceEditIntent };

export type MachineCanvasBoardState = {
  sourceVersion: number;
  machineId: string;
};

export type CanvasAdapter =
  | { kind: "none" }
  | { kind: "machine-canvas" };

export type CanvasState = {
  adapter: CanvasAdapter;
  items: readonly CanvasItemOrigin[];
  machineBoard?: MachineCanvasBoardState;
};
