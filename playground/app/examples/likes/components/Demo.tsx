"use client";

import { TrackVotesDemo, type TrackVoteItem } from "@/app/examples/components/TrackVotes";

import { useSelector, useTransition } from "../store";

export function Demo() {
  const transition = useTransition();
  const likes = useSelector((rootState) => rootState.likes);
  const likesPending = useSelector((rootState) => rootState.likesPending);
  const items = Object.values(likes.context.items).map<TrackVoteItem>((item) => ({
    ...item,
    pending: item.current !== item.committed,
  }));
  const pendingCount = likesPending.context.pendingCount;

  return (
    <TrackVotesDemo
      items={items}
      pendingCount={pendingCount}
      error={likes.context.lastError}
      onLike={(itemId) => transition({ type: "LIKE", payload: { itemId } })}
      onDislike={(itemId) => transition({ type: "DISLIKE", payload: { itemId } })}
    />
  );
}
