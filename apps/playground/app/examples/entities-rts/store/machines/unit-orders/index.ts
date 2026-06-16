import type { EntityIndex } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import { RTS_MAP } from "../../spawn/placement";
import type { AppEvents, Point, SelectionRect } from "../../types";
import { UNIT_COMMAND, UNIT_SELECTION } from "../../unit-model";
import { createUnitCommandAssignmentBatch, createUnitSelectionBatch } from "./batches";
import { createFormationTargets } from "./formation";

const FORMATION_SPACING = 28;

type Context = {};

export type Events = AppEvents;

const initialContext: Context = {};

const asEntityIndex = (index: number) => index as EntityIndex;

const columnLength = (column: ArrayLike<number>) => column.length;

const clampToMap = (value: number, max: number) => Math.min(max, Math.max(0, value));

const normalizedRect = (rect: SelectionRect) => {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  return {
    minX: Math.min(rect.x, right),
    maxX: Math.max(rect.x, right),
    minY: Math.min(rect.y, bottom),
    maxY: Math.max(rect.y, bottom),
  };
};

export const unitOrders = createMachine({
  config: {
    READY: {
      SELECT_RECT: "SELECTING_BY_RECT",
      ISSUE_MOVE: "ISSUING_COMMAND",
      ISSUE_ATTACK_MOVE: "ISSUING_COMMAND",
      GAME_RESTART: null,
    },
    SELECTING_BY_RECT: {
      UNIT_SELECTION_RESOLVED: "READY",
      GAME_RESTART: "READY",
    },
    ISSUING_COMMAND: {
      UNIT_COMMAND_RESOLVED: "READY",
      GAME_RESTART: "READY",
    },
  },
  initialState: "READY",
  initialContext,
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
  effects: {
    SELECTING_BY_RECT: ({ action, entities, transition }) => {
      if (action.type !== "SELECT_RECT") {
        transition({ type: "UNIT_SELECTION_RESOLVED" });
        return;
      }

      const rect = normalizedRect(action.payload);
      const access = entities();
      const movement = access.get("unitMovement");
      const health = access.get("unitHealth");
      const selection = access.get("unitSelection");
      const capacity = columnLength(movement.x as ArrayLike<number>);
      const batch = createUnitSelectionBatch(capacity);

      for (let index = 0; index < capacity; index += 1) {
        const entity = asEntityIndex(index);
        if (!selection.has(entity) || !movement.has(entity) || !health.has(entity)) continue;
        if (health.state(entity) !== "ALIVE" || health.hp[entity] <= 0) continue;

        const isInside =
          movement.x[entity] >= rect.minX &&
          movement.x[entity] <= rect.maxX &&
          movement.y[entity] >= rect.minY &&
          movement.y[entity] <= rect.maxY;

        batch.touched[entity] = 1;
        batch.selected[entity] = isInside ? UNIT_SELECTION.SELECTED : UNIT_SELECTION.UNSELECTED;
      }

      transition({ type: "UNIT_SELECTION_UPDATED", payload: batch });
      transition({ type: "UNIT_SELECTION_RESOLVED" });
    },
    ISSUING_COMMAND: ({ action, entities, transition }) => {
      if (action.type !== "ISSUE_MOVE" && action.type !== "ISSUE_ATTACK_MOVE") {
        transition({ type: "UNIT_COMMAND_RESOLVED" });
        return;
      }

      const access = entities();
      const movement = access.get("unitMovement");
      const health = access.get("unitHealth");
      const selection = access.get("unitSelection");
      const command = access.get("unitCommand");
      const capacity = columnLength(movement.x as ArrayLike<number>);
      let selectedCount = 0;

      for (let index = 0; index < capacity; index += 1) {
        const entity = asEntityIndex(index);
        if (!command.has(entity) || !selection.has(entity) || !health.has(entity)) continue;
        if (health.state(entity) !== "ALIVE" || health.hp[entity] <= 0) continue;
        if (selection.selected[entity] === UNIT_SELECTION.SELECTED) selectedCount += 1;
      }

      if (selectedCount === 0) {
        transition({ type: "UNIT_COMMAND_RESOLVED" });
        return;
      }

      const target: Point = action.payload;
      const targets = createFormationTargets(target, selectedCount, { spacing: FORMATION_SPACING });
      const batch = createUnitCommandAssignmentBatch(capacity);
      const nextCommand = action.type === "ISSUE_MOVE" ? UNIT_COMMAND.MOVE : UNIT_COMMAND.ATTACK_MOVE;
      let targetIndex = 0;

      for (let index = 0; index < capacity; index += 1) {
        const entity = asEntityIndex(index);
        if (!command.has(entity) || !selection.has(entity) || !health.has(entity)) continue;
        if (health.state(entity) !== "ALIVE" || health.hp[entity] <= 0) continue;
        if (selection.selected[entity] !== UNIT_SELECTION.SELECTED) continue;

        const targetX = clampToMap(targets.x[targetIndex], RTS_MAP.width);
        const targetY = clampToMap(targets.y[targetIndex], RTS_MAP.height);

        batch.touched[entity] = 1;
        batch.command[entity] = nextCommand;
        batch.targetX[entity] = targetX;
        batch.targetY[entity] = targetY;
        batch.formationOffsetX[entity] = targetX - target.x;
        batch.formationOffsetY[entity] = targetY - target.y;
        targetIndex += 1;
      }

      transition({ type: "UNIT_COMMAND_ASSIGNED", payload: batch });
      transition({ type: "UNIT_COMMAND_RESOLVED" });
    },
  },
});
