import { createMachine } from "../create-machine";
import type { TrackId } from "../types";

type TrackDownloadContext = {
  trackId: TrackId | "";
  progress: number;
  speedKbps: number;
};

const initialContext: TrackDownloadContext = {
  trackId: "",
  progress: 0,
  speedKbps: 0,
};

const tickMs = 360;

const profiles: Record<TrackId, { step: number; speed: number }> = {
  "track-01": { step: 9.4, speed: 720 },
  "track-02": { step: 7.8, speed: 690 },
  "track-03": { step: 11.2, speed: 760 },
  "track-04": { step: 6.9, speed: 640 },
  "track-05": { step: 8.7, speed: 700 },
  "track-06": { step: 7.4, speed: 670 },
};

export const trackDownload = createMachine({
  groupTag: "download",
  config: {
    __INIT: {
      START_TRACK_DOWNLOAD: "DOWNLOADING",
    },
    DOWNLOADING: {
      DOWNLOAD_TICK: null,
      PAUSE_DOWNLOAD: "PAUSED",
      CANCEL_DOWNLOAD: "__CANCELLED",
      RESET_DOWNLOADS: "__CANCELLED",
    },
    PAUSED: {
      RESUME_DOWNLOAD: "DOWNLOADING",
      CANCEL_DOWNLOAD: "__CANCELLED",
      RESET_DOWNLOADS: "__CANCELLED",
    },
  },
  initialState: "__INIT",
  initialContext,
  reducer: (state, action, { nextState }) => {
    if (action.type === "START_TRACK_DOWNLOAD") {
      state.state = nextState;
      state.context.trackId = action.payload.trackId;
      state.context.progress = action.payload.progress;
      state.context.speedKbps = 0;
      return;
    }

    if (action.type === "RESET_DOWNLOADS") {
      state.state = nextState;
      return;
    }

    if (action.payload.trackId !== state.context.trackId) return;

    switch (action.type) {
      case "DOWNLOAD_TICK":
        state.context.progress = action.payload.progress;
        state.context.speedKbps = action.payload.speedKbps;
        state.state = action.payload.progress >= 100 ? "__RESOLVED" : nextState;
        return;
      case "PAUSE_DOWNLOAD":
        state.context.speedKbps = 0;
        state.state = nextState;
        return;
      case "RESUME_DOWNLOAD":
        state.context.progress = action.payload.progress;
        state.context.speedKbps = 0;
        state.state = nextState;
        return;
      case "CANCEL_DOWNLOAD":
        state.context.progress = 0;
        state.context.speedKbps = 0;
        state.state = nextState;
        return;
    }
  },
  effects: {
    DOWNLOADING: async ({ action, getState, transition, self }) => {
      let progress = action.payload.progress;
      const profile = profiles[action.payload.trackId];

      while (progress < 100) {
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, tickMs));
        if (getState().trackDownload[self.actorId]?.state !== "DOWNLOADING") return;

        const wave = Math.sin((progress + profile.step) / 9) * 1.4;
        progress = Math.min(100, Number((progress + profile.step + wave).toFixed(1)));

        transition({
          type: "DOWNLOAD_TICK",
          payload: {
            trackId: action.payload.trackId,
            progress,
            speedKbps: profile.speed + Math.round(wave * 24),
          },
        });
      }
    },
  },
});
