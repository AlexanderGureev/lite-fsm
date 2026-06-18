import { u8 } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import type { AppEvents } from "../../types";
import { UNIT_KIND, UNIT_SELECTION } from "../../unit-model";

export type Events = AppEvents;

export const unitSelection = createMachine({
  storage: "entity",
  despawnOn: "REMOVED",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ACTIVE",
    },
    ACTIVE: {
      UNIT_SELECTION_UPDATED: null,
      SELECT_ENTITY: null,
      CLEAR_SELECTION: null,
      UNIT_DEAD: "DISABLED",
    },
    DISABLED: {},
    REMOVED: {},
  },
  initialState: "__INIT",
  initialContext: {
    selected: u8({ default: UNIT_SELECTION.UNSELECTED }),
  },
  spawnSchema: {
    selected: u8(),
  },
  reducer: (_state, action, { entities, payloadFor, self }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) self.selected[entity] = payloadFor(entity).selected;
        return;

      case "UNIT_SELECTION_UPDATED":
        for (const entity of self.indices) {
          if (action.payload.touched[entity] !== 1) continue;
          self.selected[entity] = action.payload.selected[entity];
        }
        return;

      case "SELECT_ENTITY":
        for (const entity of self.indices) {
          self.selected[entity] =
            self.entityId(entity) === action.payload.entityId ? UNIT_SELECTION.SELECTED : UNIT_SELECTION.UNSELECTED;
        }
        return;

      case "CLEAR_SELECTION":
        for (const entity of self.indices) self.selected[entity] = UNIT_SELECTION.UNSELECTED;
        return;

      case "UNIT_DEAD": {
        const identity = entities().get("unitIdentity");

        for (const entity of self.indices) {
          self.selected[entity] = UNIT_SELECTION.UNSELECTED;
          if (identity.kind[entity] !== UNIT_KIND.HERO) self.stateCode[entity] = self.states.REMOVED;
        }
        return;
      }
    }
  },
});
