import type { FSMEvent } from "lite-fsm";
import type { AppState } from ".";

export const album = {
  title: "Northern Relay",
  artist: "Loma Unit",
  label: "Kestrel Index",
  releaseType: "EP",
  year: "2026",
  cover: "/examples/album-download/cover-00.png",
} as const;

export const tracks = [
  {
    id: "track-01",
    number: "01",
    title: "Primer Glow",
    duration: "3:24",
    sizeMb: 8.4,
    cover: "/examples/album-download/cover-01.png",
  },
  {
    id: "track-02",
    number: "02",
    title: "Thin Signal",
    duration: "4:02",
    sizeMb: 10.1,
    cover: "/examples/album-download/cover-02.png",
  },
  {
    id: "track-03",
    number: "03",
    title: "Arc Minute",
    duration: "2:58",
    sizeMb: 7.2,
    cover: "/examples/album-download/cover-03.png",
  },
  {
    id: "track-04",
    number: "04",
    title: "Hollow Carrier",
    duration: "5:16",
    sizeMb: 12.8,
    cover: "/examples/album-download/cover-04.png",
  },
  {
    id: "track-05",
    number: "05",
    title: "Soft Reset",
    duration: "3:47",
    sizeMb: 9.5,
    cover: "/examples/album-download/cover-05.png",
  },
  {
    id: "track-06",
    number: "06",
    title: "Return Path",
    duration: "4:31",
    sizeMb: 11.4,
    cover: "/examples/album-download/cover-06.png",
  },
] as const;

export type Track = (typeof tracks)[number];
export type TrackId = Track["id"];
export type DownloadStatus = "idle" | "downloading" | "paused" | "complete";

export type TrackDownloadSummary = {
  trackId: TrackId;
  status: DownloadStatus;
  progress: number;
  speedKbps: number;
};

export type TrackDownloadStartPayload = {
  trackId: TrackId;
  progress: number;
};

export type TrackDownloadTickPayload = {
  trackId: TrackId;
  progress: number;
  speedKbps: number;
};

export type TrackDownloadEvent =
  | FSMEvent<"START_TRACK_DOWNLOAD", TrackDownloadStartPayload>
  | FSMEvent<"PAUSE_DOWNLOAD", { trackId: TrackId }>
  | FSMEvent<"RESUME_DOWNLOAD", TrackDownloadStartPayload>
  | FSMEvent<"CANCEL_DOWNLOAD", { trackId: TrackId }>
  | FSMEvent<"DOWNLOAD_TICK", TrackDownloadTickPayload>
  | FSMEvent<"RESET_DOWNLOADS">;

export type AppEvents = TrackDownloadEvent;

export type AppDeps = {
  getState: () => AppState;
};
