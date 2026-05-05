import type { FSMEvent } from "lite-fsm";

export type ChatPeer = {
  id: string;
  name: string;
  shortName: string;
  color: string;
};

export type ChatMessage = {
  id: string;
  peerId: string;
  author: string;
  color: string;
  text: string;
  sentAt: number;
};

export type ChatThreadContext = {
  messages: ChatMessage[];
  updatedAt: number | null;
  lastClearedAt: number | null;
};

export type ChatComposerContext = {
  draft: string;
  lastSubmittedAt: number | null;
};

export type ChatSessionContext = {
  peer: ChatPeer;
  openedAt: number | null;
};

export type AppEvents =
  | FSMEvent<"SESSION_STARTED", { peer: ChatPeer; openedAt: number }>
  | FSMEvent<"DRAFT_CHANGED", { value: string }>
  | FSMEvent<"DRAFT_CLEARED">
  | FSMEvent<"MESSAGE_SENT", { message: ChatMessage }>
  | FSMEvent<"HISTORY_CLEARED", { clearedAt: number }>;

export type AppDeps = Record<string, never>;
