"use client";

import { Clock3, Radio, ThumbsDown, ThumbsUp } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type TrackVoteValue = "like" | "dislike" | null;

export type TrackVoteItem = {
  id: string;
  title: string;
  likes: number;
  dislikes: number;
  current: TrackVoteValue;
  pending: boolean;
};

type TrackMeta = {
  artist: string;
  duration: string;
  tag: string;
};

const numberFormatter = new Intl.NumberFormat("ru-RU");
const posterSrc = "/examples/likes/track-poster-placeholder.png";

const trackMetaById: Partial<Record<string, TrackMeta>> = {
  "item-1": {
    artist: "Nora Bay",
    duration: "3:18",
    tag: "ночной поп",
  },
  "item-2": {
    artist: "June Circuit",
    duration: "2:54",
    tag: "garage house",
  },
  "item-3": {
    artist: "Kito Yard",
    duration: "4:06",
    tag: "warm electronica",
  },
};

const fallbackTrackMeta: TrackMeta = {
  artist: "lite radio",
  duration: "3:00",
  tag: "fresh cut",
};

function SyncDot({ pending }: { pending?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex size-2 rounded-full", pending ? "animate-pulse bg-primary" : "bg-[#16a36a]")}
    />
  );
}

function SyncBadge({ pendingCount }: { pendingCount: number }) {
  const isPending = pendingCount > 0;

  return (
    <Badge
      variant="secondary"
      aria-live="polite"
      className={cn(
        "h-auto gap-2 rounded-full border border-ink/10 bg-canvas px-3 py-2 text-xs font-semibold text-ink-muted-80 shadow-card",
        isPending && "border-primary/20 bg-primary/10 text-primary",
      )}
    >
      <SyncDot pending={isPending} />
      <span>{isPending ? `Сохраняем выбор: ${pendingCount}` : "Все оценки сохранены"}</span>
    </Badge>
  );
}

function VoteButton({
  kind,
  count,
  active,
  trackTitle,
  onClick,
}: {
  kind: "like" | "dislike";
  count: number;
  active: boolean;
  trackTitle: string;
  onClick: () => void;
}) {
  const Icon = kind === "like" ? ThumbsUp : ThumbsDown;
  const label = kind === "like" ? "Лайк" : "Дизлайк";

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      aria-label={`${label}: ${trackTitle}`}
      aria-pressed={active}
      title={`${label}: ${trackTitle}`}
      className={cn(
        "h-10 min-w-[4.5rem] rounded-full border border-transparent bg-canvas-parchment/75 px-3 text-sm font-semibold text-ink-muted-80 shadow-none transition-all duration-150",
        "hover:border-ink/10 hover:bg-canvas hover:text-ink hover:shadow-card",
        "active:scale-[0.96]",
        active &&
          kind === "like" &&
          "border-[#149968]/30 bg-[#e7fff4] text-[#08754f] hover:border-[#149968]/40 hover:bg-[#e7fff4] hover:text-[#08754f]",
        active &&
          kind === "dislike" &&
          "border-[#d65a48]/30 bg-[#fff0ed] text-[#a83a2c] hover:border-[#d65a48]/40 hover:bg-[#fff0ed] hover:text-[#a83a2c]",
      )}
    >
      <span className="flex items-center gap-2">
        <Icon aria-hidden className="size-4" />
        <span className="tabular-nums">{numberFormatter.format(count)}</span>
      </span>
    </Button>
  );
}

function TrackArtwork() {
  return (
    <div className="relative size-20 shrink-0 overflow-hidden rounded-[8px] bg-canvas-parchment shadow-card sm:size-24">
      <img src={posterSrc} alt="" aria-hidden className="size-full object-cover" />
    </div>
  );
}

function PreferenceBadge({ value, pending }: { value: TrackVoteValue; pending: boolean }) {
  if (pending) {
    return (
      <Badge className="h-auto rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
        сохраняется
      </Badge>
    );
  }

  if (value === "like") {
    return (
      <Badge className="h-auto rounded-full bg-[#e7fff4] px-2 py-1 text-xs font-semibold text-[#08754f]">
        понравилось
      </Badge>
    );
  }

  if (value === "dislike") {
    return (
      <Badge className="h-auto rounded-full bg-[#fff0ed] px-2 py-1 text-xs font-semibold text-[#a83a2c]">
        меньше похожих
      </Badge>
    );
  }

  return null;
}

function TrackCard({
  item,
  index,
  onLike,
  onDislike,
}: {
  item: TrackVoteItem;
  index: number;
  onLike: (itemId: string) => void;
  onDislike: (itemId: string) => void;
}) {
  const meta = trackMetaById[item.id] ?? fallbackTrackMeta;

  return (
    <Card
      className={cn(
        "gap-0 rounded-[8px] border border-hairline bg-canvas py-0 shadow-card ring-0 transition-all duration-200",
        "hover:border-ink-muted-48/35",
        item.pending && "border-primary/35 bg-[#f7fbff] ring-2 ring-primary/15",
      )}
    >
      <CardContent className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <TrackArtwork />

        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="rounded-full bg-canvas-parchment px-2 py-1 text-xs font-semibold leading-none text-ink-muted-48">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="truncate font-display text-xl font-semibold leading-tight text-ink">{item.title}</h3>
            <PreferenceBadge value={item.current} pending={item.pending} />
          </div>
          <p className="mt-1 truncate text-sm leading-5 text-ink-muted-48">{meta.artist}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium leading-none text-ink-muted-48">
            <span className="inline-flex items-center gap-1 rounded-full bg-canvas-parchment px-2 py-1.5">
              <Clock3 aria-hidden className="size-3.5" />
              {meta.duration}
            </span>
            <span className="rounded-full bg-canvas-parchment px-2 py-1.5">{meta.tag}</span>
          </div>
        </div>

        <div className="col-start-2 flex items-center justify-start gap-2 sm:col-start-auto sm:justify-end sm:pl-2">
          <VoteButton
            kind="like"
            count={item.likes}
            active={item.current === "like"}
            trackTitle={item.title}
            onClick={() => onLike(item.id)}
          />
          <VoteButton
            kind="dislike"
            count={item.dislikes}
            active={item.current === "dislike"}
            trackTitle={item.title}
            onClick={() => onDislike(item.id)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function TrackVotesDemo({
  items,
  pendingCount,
  error,
  onLike,
  onDislike,
}: {
  items: TrackVoteItem[];
  pendingCount: number;
  error: string | null;
  onLike: (itemId: string) => void;
  onDislike: (itemId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-5">
      {error ? (
        <Alert className="rounded-[8px] border-hairline bg-canvas text-sm leading-5 text-ink">{error}</Alert>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Badge className="mb-3 h-auto gap-2 rounded-full bg-[#101318] px-3 py-1.5 text-xs font-semibold text-white">
            <Radio aria-hidden className="size-3.5" />
            lite radio
          </Badge>
          <h2 className="font-display text-3xl font-semibold leading-tight text-ink">Мини-подборка треков</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted-48">
            Три свежих релиза из ночной ротации, собранные в компактный фид.
          </p>
        </div>

        <SyncBadge pendingCount={pendingCount} />
      </div>

      <div className="grid gap-3">
        {items.map((item, index) => (
          <TrackCard key={item.id} item={item} index={index} onLike={onLike} onDislike={onDislike} />
        ))}
      </div>
    </section>
  );
}
