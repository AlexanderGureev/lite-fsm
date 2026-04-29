import type { FSMEvent } from "lite-fsm";

import { createMachine } from "../create-machine";

type LikeValue = "like" | "dislike" | null;
type LikeAction = FSMEvent<"LIKE", { itemId: string }> | FSMEvent<"DISLIKE", { itemId: string }>;

export type LikesEvent =
  | LikeAction
  | FSMEvent<"SYNC_LIKE_STATE_STARTED">
  | FSMEvent<"SYNC_LIKE_STATE_RESOLVE", LikeAction>
  | FSMEvent<"SYNC_LIKE_STATE_REJECT", LikeAction & { error: string }>;

export type LikeItem = {
  id: string;
  title: string;
  likes: number;
  dislikes: number;
  committedLikes: number;
  committedDislikes: number;
  current: LikeValue;
  committed: LikeValue;
};

type LikesContext = {
  items: Record<string, LikeItem>;
  lastError: string | null;
};

const initialItems = [
  { id: "item-1", title: "#1", likes: 24, dislikes: 2, committed: null },
  { id: "item-2", title: "#2", likes: 17, dislikes: 1, committed: "like" as const },
  { id: "item-3", title: "#3", likes: 31, dislikes: 4, committed: null },
] as const;

const WAIT_MIN_MS = 2500;

const wait = (ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));

const createLikeItem = (item: (typeof initialItems)[number]): LikeItem => ({
  id: item.id,
  title: item.title,
  likes: item.likes,
  dislikes: item.dislikes,
  committedLikes: item.likes,
  committedDislikes: item.dislikes,
  current: item.committed,
  committed: item.committed,
});

const initialContext: LikesContext = {
  items: initialItems.reduce<LikesContext["items"]>((acc, item) => {
    acc[item.id] = createLikeItem(item);
    return acc;
  }, {}),
  lastError: null,
};

const getNextValue = (type: LikeAction["type"]): Exclude<LikeValue, null> => {
  return type === "LIKE" ? "like" : "dislike";
};

export const likes = createMachine({
  config: {
    "*": {
      LIKE: "SYNC_LIKE_STATE_PENDING",
      DISLIKE: "SYNC_LIKE_STATE_PENDING",
      SYNC_LIKE_STATE_RESOLVE: "READY",
      SYNC_LIKE_STATE_REJECT: "READY",
    },
    READY: {},
    SYNC_LIKE_STATE_PENDING: {
      SYNC_LIKE_STATE_STARTED: "READY",
    },
  },
  initialState: "READY",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "LIKE":
      case "DISLIKE": {
        const item = state.context.items[action.payload.itemId];
        if (!item) return;

        const nextValue = getNextValue(action.type);

        if (item.current === "like") item.likes -= 1;
        if (item.current === "dislike") item.dislikes -= 1;
        if (nextValue === "like") item.likes += 1;
        if (nextValue === "dislike") item.dislikes += 1;

        item.current = nextValue;
        state.context.lastError = null;
        break;
      }

      case "SYNC_LIKE_STATE_RESOLVE": {
        const item = state.context.items[action.payload.payload.itemId];
        if (!item) return;

        const nextValue = getNextValue(action.payload.type);

        if (item.committed === "like") item.committedLikes -= 1;
        if (item.committed === "dislike") item.committedDislikes -= 1;
        if (nextValue === "like") item.committedLikes += 1;
        if (nextValue === "dislike") item.committedDislikes += 1;

        item.committed = nextValue;
        state.context.lastError = null;
        break;
      }

      case "SYNC_LIKE_STATE_REJECT": {
        const item = state.context.items[action.payload.payload.itemId];
        if (!item) return;

        item.likes = item.committedLikes;
        item.dislikes = item.committedDislikes;
        item.current = item.committed;
        state.context.lastError = action.payload.error;
        break;
      }
    }
  },
  effects: {
    SYNC_LIKE_STATE_PENDING: async ({ action, transition }) => {
      transition({ type: "SYNC_LIKE_STATE_STARTED" });

      try {
        await wait(WAIT_MIN_MS);
        transition({ type: "SYNC_LIKE_STATE_RESOLVE", payload: action });
      } catch (error) {
        transition({
          type: "SYNC_LIKE_STATE_REJECT",
          payload: {
            ...action,
            error: error instanceof Error ? error.message : "Не удалось сохранить реакцию",
          },
        });
      }
    },
  },
});
