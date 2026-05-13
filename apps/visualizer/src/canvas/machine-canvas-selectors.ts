import { buildMachineFlowModel, type GraphVisualizerModel, type MachineFlowModel } from "@lite-fsm/graph/view-model";
import { createSelector } from "../workbench/selectors";
import type { WorkbenchSelector } from "../workbench/types";
import type { MachineCanvasBoardState } from "./types";

export type MachineCanvasBoardView =
  | { status: "not-opened"; reason: "not-opened" }
  | {
      status: "missing-model";
      reason: "missing-model";
      board: MachineCanvasBoardState;
    }
  | {
      status: "missing-machine";
      sourceVersion: number;
      machineId: string;
    }
  | {
      status: "ready";
      sourceVersion: number;
      machineId: string;
      flow: Extract<MachineFlowModel, { status: "ready" }>;
    };

export const mapMachineFlowToBoardView = (
  board: MachineCanvasBoardState | undefined,
  model: GraphVisualizerModel | undefined,
): MachineCanvasBoardView => {
  if (!board) return { status: "not-opened", reason: "not-opened" };
  if (!model) return { status: "missing-model", reason: "missing-model", board };

  const flow = buildMachineFlowModel({ model, machineId: board.machineId });
  if (flow.status === "missing-machine") {
    return {
      status: "missing-machine",
      sourceVersion: board.sourceVersion,
      machineId: flow.machineId,
    };
  }

  return {
    status: "ready",
    sourceVersion: board.sourceVersion,
    machineId: board.machineId,
    flow,
  };
};

export const selectMachineCanvasBoard: WorkbenchSelector<MachineCanvasBoardView> = createSelector(
  (snapshot) => ({
    board: snapshot.state.canvas.machineBoard,
    model: snapshot.state.model.model,
  }),
  ({ board, model }) => mapMachineFlowToBoardView(board, model),
);
