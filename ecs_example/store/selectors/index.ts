import type { AppState } from "..";

export type GameGateStatus = {
  frame: number;
  enemyRows: number;
  blinkActors: number;
  alerts: number;
};

export const selectGameGateStatus = (state: AppState): GameGateStatus => ({
  frame: state.worldMachine.context.frame,
  enemyRows: state.enemyActor.count,
  blinkActors: Object.keys(state.blinkActor).length,
  alerts: state.worldMachine.context.alerts,
});
