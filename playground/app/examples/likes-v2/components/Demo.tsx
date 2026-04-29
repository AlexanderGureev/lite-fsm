"use client";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { LikeV2Item } from "../store/machines/likesV2";
import { useSelector, useTransition } from "../store";

function PingDot() {
  return (
    <span className="relative inline-flex size-2">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" />
      <span className="relative inline-flex size-2 rounded-full bg-primary" />
    </span>
  );
}

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
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      aria-pressed={active}
      data-pending={pending}
      className={cn(
        "h-auto flex-1 justify-between gap-3 rounded-md border-hairline bg-canvas px-4 py-3 text-caption text-ink transition-colors duration-150",
        "hover:border-ink-muted-48/60 hover:bg-canvas-parchment hover:text-ink",
        "active:scale-[0.97]",
        active && "border-primary bg-primary/8 text-primary hover:border-primary hover:bg-primary/14 hover:text-primary",
        active && pending && "bg-primary/14",
      )}
    >
      <span className="flex items-center gap-2">
        <span className="text-caption-strong">{label}</span>
        {active && pending ? <PingDot /> : null}
      </span>
      <span
        className={cn(
          "font-mono text-caption tabular-nums",
          active ? "text-primary" : "text-ink-muted-80",
        )}
      >
        {count}
      </span>
    </Button>
  );
}

function LikeCard({ item, pending }: { item: LikeV2Item; pending: boolean }) {
  const transition = useTransition();

  return (
    <Card
      className={cn(
        "gap-0 rounded-lg bg-canvas py-0 ring-1 ring-hairline transition-all duration-200",
        pending && "shadow-card ring-primary/40",
      )}
    >
      <CardHeader className="px-5 pt-5">
        <p className="text-caption-strong text-ink-muted-48">{item.title}</p>
      </CardHeader>
      <CardContent className="flex gap-3 px-5 pb-5 pt-4">
        <VoteButton
          label="LIKE"
          count={item.likes}
          active={item.current === "like"}
          pending={pending && item.current === "like"}
          onClick={() => transition({ type: "LIKE_V2", payload: { itemId: item.id } })}
        />
        <VoteButton
          label="DISLIKE"
          count={item.dislikes}
          active={item.current === "dislike"}
          pending={pending && item.current === "dislike"}
          onClick={() => transition({ type: "DISLIKE_V2", payload: { itemId: item.id } })}
        />
      </CardContent>
    </Card>
  );
}

export function Demo() {
  const likes = useSelector((rootState) => rootState.likesV2);
  const actors = useSelector((rootState) => rootState.likeSync);
  const items = Object.values(likes.context.items);
  const pendingCount = Object.keys(actors).length;

  return (
    <section className="flex flex-col gap-6">
      {likes.context.lastError ? (
        <Alert className="rounded-lg border-hairline bg-canvas text-body text-ink">
          {likes.context.lastError}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Badge
          variant="secondary"
          className={cn(
            "flex items-center gap-2 rounded-pill bg-canvas-parchment px-3 py-1 text-caption text-ink-muted-80",
            pendingCount > 0 && "bg-primary/10 text-primary",
          )}
        >
          {pendingCount > 0 ? <PingDot /> : null}
          <span>{pendingCount > 0 ? `Live actors: ${pendingCount}` : "Всё синхронизировано"}</span>
        </Badge>
        <p className="text-caption text-ink-muted-48">
          pending = <code className="text-caption text-ink-muted-80">Object.keys(state.likeSync).length</code>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <LikeCard
            key={item.id}
            item={item}
            pending={Object.values(actors).some((slice) => slice.context.itemId === item.id)}
          />
        ))}
      </div>
    </section>
  );
}
