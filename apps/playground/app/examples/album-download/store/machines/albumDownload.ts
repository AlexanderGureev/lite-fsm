import { createMachine } from "../create-machine";
import { tracks, type TrackDownloadSummary, type TrackId } from "../types";

type AlbumDownloadContext = {
  tracks: Record<TrackId, TrackDownloadSummary>;
};

const createTrackMap = () =>
  tracks.reduce<Record<TrackId, TrackDownloadSummary>>(
    (acc, track) => {
      acc[track.id] = {
        trackId: track.id,
        status: "idle",
        progress: 0,
        speedKbps: 0,
      };
      return acc;
    },
    {} as Record<TrackId, TrackDownloadSummary>,
  );

const initialContext: AlbumDownloadContext = {
  tracks: createTrackMap(),
};

export const albumDownload = createMachine({
  config: {
    READY: {
      START_TRACK_DOWNLOAD: null,
      PAUSE_DOWNLOAD: null,
      RESUME_DOWNLOAD: null,
      CANCEL_DOWNLOAD: null,
      DOWNLOAD_TICK: null,
      RESET_DOWNLOADS: null,
    },
  },
  initialState: "READY",
  initialContext,
  reducer: (state, action) => {
    if (action.type === "RESET_DOWNLOADS") {
      state.context.tracks = createTrackMap();
      return;
    }

    const track = state.context.tracks[action.payload.trackId];
    if (!track) return;

    switch (action.type) {
      case "START_TRACK_DOWNLOAD":
      case "RESUME_DOWNLOAD":
        track.progress = action.payload.progress;
        track.status = "downloading";
        track.speedKbps = 0;
        break;
      case "PAUSE_DOWNLOAD":
        if (track.status !== "downloading") return;
        track.status = "paused";
        track.speedKbps = 0;
        break;
      case "CANCEL_DOWNLOAD":
        track.status = "idle";
        track.progress = 0;
        track.speedKbps = 0;
        break;
      case "DOWNLOAD_TICK":
        if (track.status !== "downloading") return;
        track.progress = action.payload.progress;
        track.status = action.payload.progress >= 100 ? "complete" : "downloading";
        track.speedKbps = action.payload.progress >= 100 ? 0 : action.payload.speedKbps;
        break;
    }
  },
});
