import type { AppState } from ".";
import { album, tracks, type DownloadStatus, type Track, type TrackId } from "./types";

export type LiveDownload = {
  actorId: string;
  state: "DOWNLOADING" | "PAUSED";
  trackId: TrackId;
  progress: number;
  speedKbps: number;
};

export type TrackView = {
  track: Track;
  live: LiveDownload | null;
  status: DownloadStatus;
  progress: number;
  downloadedMb: number;
  speedKbps: number;
};

export type AlbumDownloadView = {
  album: typeof album;
  tracks: TrackView[];
  liveDownloads: LiveDownload[];
  idleTrackIds: TrackId[];
  totalMb: number;
  downloadedMb: number;
  albumProgress: number;
  runningCount: number;
  pausedCount: number;
  completeCount: number;
  trackCount: number;
  allComplete: boolean;
  hasAnyDownload: boolean;
};

export const selectAlbumDownloadView = (state: AppState): AlbumDownloadView => {
  const liveDownloads = Object.entries(state.trackDownload).reduce<LiveDownload[]>((acc, [actorId, slice]) => {
    if (!slice.context.trackId) return acc;
    acc.push({
      actorId,
      state: slice.state,
      trackId: slice.context.trackId,
      progress: slice.context.progress,
      speedKbps: slice.context.speedKbps,
    });
    return acc;
  }, []);

  const liveByTrackId = new Map(liveDownloads.map((download) => [download.trackId, download]));

  const trackViews = tracks.map<TrackView>((track) => {
    const summary = state.albumDownload.context.tracks[track.id];
    const live = liveByTrackId.get(track.id) ?? null;
    const status = live?.state === "DOWNLOADING" ? "downloading" : live?.state === "PAUSED" ? "paused" : summary.status;
    const progress = live?.progress ?? summary.progress;
    const speedKbps = live?.speedKbps ?? summary.speedKbps;

    return {
      track,
      live,
      status,
      progress,
      speedKbps,
      downloadedMb: Number(((track.sizeMb * progress) / 100).toFixed(1)),
    };
  });

  const totalMb = tracks.reduce((sum, track) => sum + track.sizeMb, 0);
  const downloadedMb = trackViews.reduce((sum, view) => sum + view.downloadedMb, 0);
  const completeCount = trackViews.filter((view) => view.status === "complete").length;

  return {
    album,
    tracks: trackViews,
    liveDownloads,
    idleTrackIds: trackViews.filter((view) => view.status === "idle").map((view) => view.track.id),
    totalMb,
    downloadedMb,
    albumProgress: (downloadedMb / totalMb) * 100,
    runningCount: liveDownloads.filter((download) => download.state === "DOWNLOADING").length,
    pausedCount: liveDownloads.filter((download) => download.state === "PAUSED").length,
    completeCount,
    trackCount: tracks.length,
    allComplete: completeCount === tracks.length,
    hasAnyDownload: downloadedMb > 0 || liveDownloads.length > 0,
  };
};
