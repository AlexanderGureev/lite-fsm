import { MachineManager } from "lite-fsm";
import { immerMiddleware } from "lite-fsm/middleware/immer";
import { devToolsMiddleware } from "lite-fsm/middleware/devTools";

import { albumDownload } from "./machines/albumDownload";
import { trackDownload } from "./machines/trackDownload";
import type { AppEvents } from "./types";

const machines = { albumDownload, trackDownload };

export type FSMConfigType = typeof machines;

export const makeStore = () => {
  const manager = MachineManager<FSMConfigType, AppEvents>(machines, {
    onError: console.error,
    middleware: [immerMiddleware, devToolsMiddleware({ blacklistActions: [] })],
  });

  manager.setDependencies({ getState: manager.getState });

  return manager;
};

export type AppStore = ReturnType<typeof makeStore>;
export type AppState = ReturnType<AppStore["getState"]>;

export { useManager, useSelector, useTransition } from "./hooks";
export { selectAlbumDownloadView } from "./selectors";
export type { AlbumDownloadView, LiveDownload, TrackView } from "./selectors";
export type { AppEvents } from "./types";
