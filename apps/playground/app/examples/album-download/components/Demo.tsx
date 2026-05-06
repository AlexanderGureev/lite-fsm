"use client";

import { Activity, CheckCircle2, Disc3, Download, HardDrive, Pause, Play, RotateCcw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { selectAlbumDownloadView, useSelector, useTransition, type LiveDownload, type TrackView } from "../store";
import type { DownloadStatus, TrackId } from "../store/types";

const statusLabel: Record<DownloadStatus, string> = {
  idle: "готов",
  downloading: "скачивается",
  paused: "пауза",
  complete: "готово",
};

const statusClasses: Record<DownloadStatus, string> = {
  idle: "bg-canvas-parchment text-ink-muted-48",
  downloading: "bg-[#dff8ff] text-[#005e73]",
  paused: "bg-[#fff3cf] text-[#7a5600]",
  complete: "bg-[#e5fff0] text-[#0b7441]",
};

const numberFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});

function ProgressBar({
  value,
  className,
  tone = "default",
}: {
  value: number;
  className?: string;
  tone?: "default" | "dark";
}) {
  return (
    <div
      className={cn(
        "h-2 overflow-hidden rounded-full",
        tone === "dark" ? "bg-white/16" : "bg-canvas-parchment",
        className,
      )}
      aria-hidden
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300",
          tone === "dark" ? "bg-[#9ee8f0]" : "bg-[#111318]",
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function IconButton({
  label,
  children,
  disabled,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="size-9 rounded-[8px] border border-hairline bg-canvas text-ink-muted-80 shadow-none transition-colors hover:border-ink/25 hover:bg-canvas-parchment hover:text-ink active:scale-[0.96]"
    >
      {children}
    </Button>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-t border-white/14 py-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-white/10 text-[#9ee8f0]">{icon}</span>
      <div className="min-w-0">
        <p className="text-fine-print uppercase text-white/48">{label}</p>
        <p className="truncate text-caption-strong text-white">{value}</p>
      </div>
    </div>
  );
}

function TrackControls({
  view,
  onStart,
  onPause,
  onResume,
  onCancel,
}: {
  view: TrackView;
  onStart: (trackId: TrackId) => void;
  onPause: (download: LiveDownload) => void;
  onResume: (download: LiveDownload) => void;
  onCancel: (trackId: TrackId, actorId?: string) => void;
}) {
  if (view.status === "complete") {
    return (
      <IconButton
        label={`Скачать заново: ${view.track.title}`}
        onClick={() => onCancel(view.track.id, view.live?.actorId)}
      >
        <RotateCcw className="size-4" strokeWidth={1.9} />
      </IconButton>
    );
  }

  if (!view.live) {
    return (
      <IconButton label={`Скачать трек: ${view.track.title}`} onClick={() => onStart(view.track.id)}>
        <Download className="size-4" strokeWidth={1.9} />
      </IconButton>
    );
  }

  if (view.live.state === "PAUSED") {
    return (
      <div className="flex items-center gap-2">
        <IconButton label={`Продолжить: ${view.track.title}`} onClick={() => onResume(view.live!)}>
          <Play className="size-4 fill-current" strokeWidth={1.9} />
        </IconButton>
        <IconButton label={`Отменить: ${view.track.title}`} onClick={() => onCancel(view.track.id, view.live?.actorId)}>
          <X className="size-4" strokeWidth={1.9} />
        </IconButton>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <IconButton label={`Пауза: ${view.track.title}`} onClick={() => onPause(view.live!)}>
        <Pause className="size-4 fill-current" strokeWidth={1.9} />
      </IconButton>
      <IconButton label={`Отменить: ${view.track.title}`} onClick={() => onCancel(view.track.id, view.live?.actorId)}>
        <X className="size-4" strokeWidth={1.9} />
      </IconButton>
    </div>
  );
}

function TrackRow({
  view,
  onStart,
  onPause,
  onResume,
  onCancel,
}: {
  view: TrackView;
  onStart: (trackId: TrackId) => void;
  onPause: (download: LiveDownload) => void;
  onResume: (download: LiveDownload) => void;
  onCancel: (trackId: TrackId, actorId?: string) => void;
}) {
  return (
    <article
      className={cn(
        "grid gap-4 rounded-[8px] border border-hairline bg-canvas p-3 shadow-card transition-colors sm:grid-cols-[minmax(15rem,18rem)_minmax(16rem,1fr)_5rem] sm:items-center xl:grid-cols-[minmax(17rem,22rem)_minmax(18rem,1fr)_5rem]",
        view.status === "downloading" && "border-[#9ee8f0] bg-[#f6fdff]",
        view.status === "paused" && "border-[#f2d880] bg-[#fffaf0]",
        view.status === "complete" && "border-[#b7ebca] bg-[#f7fff9]",
      )}
    >
      <div className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-center gap-4">
        <img
          src={view.track.cover}
          alt=""
          aria-hidden
          className="size-16 shrink-0 rounded-[8px] object-cover ring-1 ring-ink/10"
        />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-xs text-ink-muted-48">{view.track.number}</span>
            <h3 className="truncate text-body-strong text-ink">{view.track.title}</h3>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-ink-muted-48">
            <span>{view.track.duration}</span>
            <span aria-hidden className="size-1 rounded-full bg-ink-muted-48/35" />
            <span>{numberFormatter.format(view.track.sizeMb)} MB</span>
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-2 grid min-h-7 grid-cols-[auto_minmax(11.5rem,auto)] items-center gap-3">
          <Badge className={cn("h-auto rounded-full px-2 py-1 text-xs font-semibold", statusClasses[view.status])}>
            {statusLabel[view.status]}
          </Badge>
          <div className="grid justify-self-end font-mono text-xs text-ink-muted-48 [grid-template-columns:3rem_4.25rem_4.25rem]">
            <span className="text-right tabular-nums">{percentFormatter.format(view.progress)}%</span>
            <span className="text-right tabular-nums">{numberFormatter.format(view.downloadedMb)} MB</span>
            <span className="text-right tabular-nums">{view.speedKbps > 0 ? `${view.speedKbps} KB/s` : "0 KB/s"}</span>
          </div>
        </div>
        <ProgressBar value={view.progress} />
      </div>

      <div className="flex min-w-20 justify-end">
        <TrackControls view={view} onStart={onStart} onPause={onPause} onResume={onResume} onCancel={onCancel} />
      </div>
    </article>
  );
}

export function Demo() {
  const transition = useTransition();
  const view = useSelector(selectAlbumDownloadView);

  const startTrack = (trackId: TrackId) => {
    transition({ type: "START_TRACK_DOWNLOAD", payload: { trackId, progress: 0 } });
  };

  const pauseDownload = (download: LiveDownload) => {
    transition({
      type: "PAUSE_DOWNLOAD",
      payload: { trackId: download.trackId },
      meta: { actorId: download.actorId },
    });
  };

  const resumeDownload = (download: LiveDownload) => {
    transition({
      type: "RESUME_DOWNLOAD",
      payload: { trackId: download.trackId, progress: download.progress },
      meta: { actorId: download.actorId },
    });
  };

  const cancelDownload = (trackId: TrackId, actorId?: string) => {
    transition({
      type: "CANCEL_DOWNLOAD",
      payload: { trackId },
      meta: actorId ? { actorId } : undefined,
    });
  };

  const startAlbum = () => {
    for (const trackId of view.idleTrackIds) startTrack(trackId);
  };

  const pauseAlbum = () => {
    for (const download of view.liveDownloads) {
      if (download.state !== "PAUSED") pauseDownload(download);
    }
  };

  const resumeAlbum = () => {
    for (const download of view.liveDownloads) {
      if (download.state === "PAUSED") resumeDownload(download);
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <aside className="group relative isolate overflow-hidden rounded-[8px] border border-white/10 bg-[#0d1115]/95 text-white shadow-product">
        <div
          aria-hidden
          className="absolute inset-0 -z-20 opacity-80"
          style={{
            background:
              "radial-gradient(circle at 50% 8%, rgba(158, 232, 240, 0.24), transparent 34%), radial-gradient(circle at 95% 18%, rgba(250, 208, 70, 0.14), transparent 28%), linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0.01) 38%, rgba(0,0,0,0.24))",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-70"
          style={{
            background:
              "radial-gradient(520px circle at calc(var(--spot-x, -9999) * 1px) calc(var(--spot-y, -9999) * 1px), rgba(158, 232, 240, 0.07), rgba(250, 208, 70, 0.025) 36%, transparent 70%)",
            backgroundAttachment: "fixed",
          }}
        />
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-44 bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[8px] ring-1 ring-inset ring-white/12" />

        <div className="relative z-2 p-5">
          <div className="mx-auto w-full max-w-[186px] rounded-[8px] border border-white/14 bg-white/10 p-2 shadow-[0_22px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            <img
              src={view.album.cover}
              alt=""
              aria-hidden
              className="aspect-square w-full rounded-[6px] object-cover ring-1 ring-white/15"
            />
          </div>

          <div className="mt-6 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Badge className="mb-3 h-auto rounded-full border border-white/12 bg-white/12 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
                {view.album.releaseType} · {view.album.year}
              </Badge>
              <h2 className="truncate font-display text-2xl font-semibold leading-tight">{view.album.title}</h2>
              <p className="mt-1 truncate text-caption text-white/62">
                {view.album.artist} · {view.album.label}
              </p>
            </div>
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#9ee8f0]/45 bg-[#9ee8f0]/10 text-[#9ee8f0] backdrop-blur-md">
              <Disc3 className="size-5" strokeWidth={1.45} />
            </span>
          </div>

          <div className="mt-7">
            <div className="mb-3 flex items-end justify-between gap-3">
              <p className="text-fine-print uppercase text-white/48">прогресс альбома</p>
              <p className="font-mono text-sm text-white">{percentFormatter.format(view.albumProgress)}%</p>
            </div>
            <ProgressBar value={view.albumProgress} tone="dark" />
          </div>

          <div className="mt-6 grid">
            <Stat
              icon={<Activity className="size-4" strokeWidth={1.8} />}
              label="live actors"
              value={`${view.liveDownloads.length} total · ${view.runningCount} active · ${view.pausedCount} paused`}
            />
            <Stat
              icon={<HardDrive className="size-4" strokeWidth={1.8} />}
              label="скачано"
              value={`${numberFormatter.format(view.downloadedMb)} / ${numberFormatter.format(view.totalMb)} MB`}
            />
            <Stat
              icon={<CheckCircle2 className="size-4" strokeWidth={1.8} />}
              label="треки"
              value={`${view.completeCount} / ${view.trackCount} готово`}
            />
          </div>
        </div>

        <div className="relative z-2 grid gap-2 border-t border-white/14 bg-white/[0.035] p-4 backdrop-blur-xl sm:grid-cols-[1fr_auto_auto_auto]">
          <Button
            type="button"
            onClick={startAlbum}
            disabled={view.allComplete || view.idleTrackIds.length === 0}
            className="h-11 rounded-[8px] bg-white/90 px-4 text-sm font-semibold text-[#111318] shadow-[0_10px_30px_rgba(0,0,0,0.18)] hover:bg-[#dff8ff] active:scale-[0.98]"
          >
            <Download className="size-4" strokeWidth={1.9} />
            Скачать
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Поставить альбом на паузу"
            title="Поставить альбом на паузу"
            onClick={pauseAlbum}
            disabled={view.runningCount === 0}
            className="h-11 w-full rounded-[8px] border border-white/16 bg-white/[0.04] text-white hover:bg-white/12 sm:w-11"
          >
            <Pause className="size-4 fill-current" strokeWidth={1.8} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Продолжить альбом"
            title="Продолжить альбом"
            onClick={resumeAlbum}
            disabled={view.pausedCount === 0}
            className="h-11 w-full rounded-[8px] border border-white/16 bg-white/[0.04] text-white hover:bg-white/12 sm:w-11"
          >
            <Play className="size-4 fill-current" strokeWidth={1.8} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Сбросить закачки"
            title="Сбросить закачки"
            onClick={() => transition({ type: "RESET_DOWNLOADS" })}
            disabled={!view.hasAnyDownload}
            className="h-11 w-full rounded-[8px] border border-white/16 bg-white/[0.04] text-white hover:bg-white/12 sm:w-11"
          >
            <RotateCcw className="size-4" strokeWidth={1.8} />
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-4">
          <div className="min-w-0">
            <p className="text-caption-strong text-primary">actor downloads</p>
            <h1 className="mt-1 text-display-md text-ink">Страница релиза</h1>
          </div>
          <Badge className="h-auto rounded-full bg-canvas px-3 py-2 text-xs font-semibold text-ink-muted-80 shadow-card ring-1 ring-hairline">
            {view.trackCount} tracks · {numberFormatter.format(view.totalMb)} MB
          </Badge>
        </div>

        <div className="grid gap-3">
          {view.tracks.map((trackView) => (
            <TrackRow
              key={trackView.track.id}
              view={trackView}
              onStart={startTrack}
              onPause={pauseDownload}
              onResume={resumeDownload}
              onCancel={cancelDownload}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
