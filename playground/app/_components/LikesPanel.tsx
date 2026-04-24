"use client";

import type { LikeItem } from "@/src/store/machines/likes";
import { useSelector, useTransition } from "@/src/store";

function VoteButton({
  label,
  count,
  active,
  pending,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  const base =
    "flex flex-1 items-center justify-between gap-2 rounded-[10px] border px-3 py-2 text-[13px] font-medium transition-[background,border-color,color] duration-150";
  const idle = "border-slate-400/15 bg-transparent text-slate-300 hover:bg-slate-400/10 hover:text-slate-200";
  const activeCls = "border-blue-400/50 bg-blue-600/15 text-blue-200";
  const pendingCls = "border-yellow-400/50 bg-yellow-400/10 text-yellow-200 animate-pending-flash";

  return (
    <button
      type="button"
      onClick={onClick}
      className={[base, active && !pending ? activeCls : "", active && pending ? pendingCls : "", !active ? idle : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="text-xs tracking-[0.04em]">{label}</span>
      <span className="font-[tabular-nums] text-[13px] opacity-90">{count}</span>
    </button>
  );
}

function LikeCard({ item }: { item: LikeItem }) {
  const transition = useTransition();
  const isPending = item.current !== item.committed;

  return (
    <article
      className={`relative rounded-[14px] border bg-slate-950/40 p-4 transition-colors duration-200 ${
        isPending ? "border-yellow-400/35" : "border-slate-400/10"
      }`}
    >
      <h3 className="mb-3 font-mono text-xs font-medium tracking-[0.05em] text-slate-500">{item.title}</h3>

      <div className="flex gap-2">
        <VoteButton
          label="LIKE"
          count={item.likes}
          active={item.current === "like"}
          pending={isPending && item.current === "like"}
          onClick={() => transition({ type: "LIKE", payload: { itemId: item.id } })}
        />
        <VoteButton
          label="DISLIKE"
          count={item.dislikes}
          active={item.current === "dislike"}
          pending={isPending && item.current === "dislike"}
          onClick={() => transition({ type: "DISLIKE", payload: { itemId: item.id } })}
        />
      </div>
    </article>
  );
}

export default function LikesPanel() {
  const likes = useSelector((rootState) => rootState.likes);
  const likesPending = useSelector((rootState) => rootState.likesPending);
  const items = Object.values(likes.context.items) as LikeItem[];
  const pendingCount = likesPending.context.pendingCount;

  return (
    <section className="w-[min(820px,100%)] rounded-[20px] border border-slate-400/15 bg-slate-900/70 p-7">
      <header className="mb-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-blue-400">
          Likes · parallel async effects
        </p>
        <h2 className="text-[22px] font-semibold leading-tight">Оптимистичное голосование</h2>
      </header>

      {likes.context.lastError ? <p className="mb-3 text-[13px] text-red-300">{likes.context.lastError}</p> : null}

      <div className="mb-4 flex items-center gap-2 text-[13px] text-slate-500">
        <span
          className={`h-2 w-2 rounded-full ${
            pendingCount > 0 ? "animate-pulse-dot bg-yellow-400" : "bg-slate-600"
          }`}
        />
        {pendingCount > 0 ? `Синхронизация: ${pendingCount}` : "Всё синхронизировано"}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        {items.map((item) => (
          <LikeCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
