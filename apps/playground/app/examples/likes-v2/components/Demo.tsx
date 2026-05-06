"use client";

import { TrackVotesDemo, type TrackVoteItem } from "@/app/examples/components/TrackVotes";

import { useSelector, useTransition } from "../store";

export function Demo() {
  const transition = useTransition();
  const likes = useSelector((rootState) => rootState.likesV2);
  const actors = useSelector((rootState) => rootState.likeSync);
  const pendingItemIds = new Set(Object.values(actors).map((slice) => slice.context.itemId));
  const items = Object.values(likes.context.items).map<TrackVoteItem>((item) => ({
    ...item,
    pending: pendingItemIds.has(item.id),
  }));
  const pendingCount = Object.keys(actors).length;

  return (
    <TrackVotesDemo
      items={items}
      pendingCount={pendingCount}
      error={likes.context.lastError}
      onLike={(itemId) => transition({ type: "LIKE_V2", payload: { itemId } })}
      onDislike={(itemId) => transition({ type: "DISLIKE_V2", payload: { itemId } })}
    />
  );
}
