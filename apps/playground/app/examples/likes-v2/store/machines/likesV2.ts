import type { FSMEvent, ManagerAction } from "@lite-fsm/core";

import { createMachine } from "../create-machine";

type LikeValue = "like" | "dislike" | null;
export type LikeV2Action = FSMEvent<"LIKE_V2", { itemId: string }> | FSMEvent<"DISLIKE_V2", { itemId: string }>;

export type LikesV2Event =
  | LikeV2Action
  | FSMEvent<"LIKE_SYNC_OK", LikeV2Action>
  | FSMEvent<"LIKE_SYNC_FAIL", LikeV2Action & { error: string }>;

export type LikeV2Item = {
  id: string;
  title: string;
  likes: number;
  dislikes: number;
  committedLikes: number;
  committedDislikes: number;
  current: LikeValue;
  committed: LikeValue;
};

type LikesV2Context = {
  items: Record<string, LikeV2Item>;
  lastError: string | null;
};

const initialItems = [
  { id: "item-1", title: "Late Checkout", likes: 284, dislikes: 12, committed: null },
  { id: "item-2", title: "Neon Butter", likes: 517, dislikes: 23, committed: "like" as const },
  { id: "item-3", title: "Velvet Metro", likes: 431, dislikes: 18, committed: null },
] as const;

const createLikeItem = (item: (typeof initialItems)[number]): LikeV2Item => ({
  id: item.id,
  title: item.title,
  likes: item.likes,
  dislikes: item.dislikes,
  committedLikes: item.likes,
  committedDislikes: item.dislikes,
  current: item.committed,
  committed: item.committed,
});

const initialContext: LikesV2Context = {
  items: initialItems.reduce<LikesV2Context["items"]>((acc, item) => {
    acc[item.id] = createLikeItem(item);
    return acc;
  }, {}),
  lastError: null,
};

const getNextValue = (type: LikeV2Action["type"]): Exclude<LikeValue, null> => {
  return type === "LIKE_V2" ? "like" : "dislike";
};

const applyOptimisticValue = (item: LikeV2Item, nextValue: Exclude<LikeValue, null>) => {
  if (item.current === "like") item.likes -= 1;
  if (item.current === "dislike") item.dislikes -= 1;
  if (nextValue === "like") item.likes += 1;
  if (nextValue === "dislike") item.dislikes += 1;
  item.current = nextValue;
};

const commitValue = (item: LikeV2Item, nextValue: Exclude<LikeValue, null>) => {
  if (item.committed === "like") item.committedLikes -= 1;
  if (item.committed === "dislike") item.committedDislikes -= 1;
  if (nextValue === "like") item.committedLikes += 1;
  if (nextValue === "dislike") item.committedDislikes += 1;
  item.committed = nextValue;
};

const getActionPayload = (action: ManagerAction<LikesV2Event>) => {
  if (action.type === "LIKE_V2" || action.type === "DISLIKE_V2") return action.payload;
  return action.payload.payload;
};

export const likesV2 = createMachine({
  config: {
    READY: {
      LIKE_V2: null,
      DISLIKE_V2: null,
      LIKE_SYNC_OK: null,
      LIKE_SYNC_FAIL: null,
    },
  },
  initialState: "READY",
  initialContext,
  reducer: (state, action) => {
    switch (action.type) {
      case "LIKE_V2":
      case "DISLIKE_V2": {
        const item = state.context.items[action.payload.itemId];
        if (!item) return;

        applyOptimisticValue(item, getNextValue(action.type));
        state.context.lastError = null;
        break;
      }

      case "LIKE_SYNC_OK": {
        const item = state.context.items[getActionPayload(action).itemId];
        if (!item) return;

        commitValue(item, getNextValue(action.payload.type));
        state.context.lastError = null;
        break;
      }

      case "LIKE_SYNC_FAIL": {
        const item = state.context.items[getActionPayload(action).itemId];
        if (!item) return;

        item.likes = item.committedLikes;
        item.dislikes = item.committedDislikes;
        item.current = item.committed;
        state.context.lastError = action.payload.error;
        break;
      }
    }
  },
});
