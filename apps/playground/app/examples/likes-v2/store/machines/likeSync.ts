import type { FSMEvent } from "@lite-fsm/core";

import { createMachine } from "../create-machine";
import type { LikeV2Action } from "./likesV2";

export type LikeSyncEvent =
  | LikeV2Action
  | FSMEvent<"LIKE_SYNC_OK", LikeV2Action>
  | FSMEvent<"LIKE_SYNC_FAIL", LikeV2Action & { error: string }>
  | FSMEvent<"CANCEL">;

type LikeSyncContext = {
  itemId: string;
  actionType: LikeV2Action["type"] | null;
};

const WAIT_MIN_MS = 2500;
const initialContext: LikeSyncContext = {
  itemId: "",
  actionType: null,
};

const wait = (ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));

const cleanLikeAction = (action: LikeV2Action): LikeV2Action => {
  return action.type === "LIKE_V2"
    ? { type: "LIKE_V2", payload: action.payload }
    : { type: "DISLIKE_V2", payload: action.payload };
};

export const likeSync = createMachine({
  groupTag: "likeSync",
  config: {
    __INIT: {
      LIKE_V2: "PENDING",
      DISLIKE_V2: "PENDING",
    },
    PENDING: {
      LIKE_SYNC_OK: "__RESOLVED",
      LIKE_SYNC_FAIL: "__REJECTED",
    },
    "*": {
      CANCEL: "__CANCELLED",
    },
  },
  initialState: "__INIT",
  initialContext,
  reducer: (state, action, meta) => {
    if (action.type === "LIKE_V2" || action.type === "DISLIKE_V2") {
      state.state = meta.nextState;
      state.context.itemId = action.payload.itemId;
      state.context.actionType = action.type;
      return;
    }

    state.state = meta.nextState;
  },
  effects: {
    PENDING: async ({ action, transition }) => {
      const payload = cleanLikeAction(action);

      try {
        await wait(WAIT_MIN_MS);
        transition({ type: "LIKE_SYNC_OK", payload });
      } catch (error) {
        transition({
          type: "LIKE_SYNC_FAIL",
          payload: {
            ...payload,
            error: error instanceof Error ? error.message : "Не удалось сохранить реакцию",
          },
        });
      }
    },
  },
});
