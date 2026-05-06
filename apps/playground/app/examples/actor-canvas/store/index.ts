import { MachineManager } from "@lite-fsm/core";
import type { MachinesState } from "@lite-fsm/core";
import { immerMiddleware } from "@lite-fsm/middleware/immer";

import { createStrokeActorId, type CanvasPeerId } from "./constants";
import { canvasBoard } from "./machines/canvasBoard";
import { canvasNetwork, initialPeers } from "./machines/canvasNetwork";
import { canvasStroke } from "./machines/canvasStroke";
import type { AppDeps, AppEvents } from "./types";

const machines = { canvasBoard, canvasNetwork, canvasStroke };

export type FSMConfigType = typeof machines;
export type AppState = MachinesState<FSMConfigType>;

type StoreNetworkDeps = Pick<AppDeps, "getPeerStore">;

export const makeStore = (peerId: CanvasPeerId, networkDeps?: StoreNetworkDeps) => {
  const manager = MachineManager<FSMConfigType, AppEvents>(machines, {
    onError: console.error,
    middleware: [immerMiddleware],
    schemaVersion: 1,
    originId: peerId,
    generateActorId: ({ action, counter, originId, templateKey }) => {
      const ownerId = originId ?? peerId;
      if (action.type === "DRAW_BEGIN") return createStrokeActorId(ownerId, action.payload.strokeId);
      return `${ownerId}#${templateKey}/${counter}`;
    },
  });

  manager.setDependencies({
    getPeerId: () => peerId,
    getState: manager.getState,
    getPeerStore: networkDeps?.getPeerStore ?? ((targetPeerId) => (targetPeerId === peerId ? manager : null)),
  });

  return manager;
};

export type AppStore = ReturnType<typeof makeStore>;

export type CanvasRuntime = {
  primaryPeerId: CanvasPeerId;
  getPeerStore: (peerId: CanvasPeerId) => AppStore;
};

export const makeCanvasRuntime = (): CanvasRuntime => {
  const peerStores: Record<CanvasPeerId, AppStore> = {};
  const getOptionalPeerStore = (peerId: CanvasPeerId) => peerStores[peerId] ?? null;

  for (const peer of initialPeers) {
    peerStores[peer.id] = makeStore(peer.id, {
      getPeerStore: getOptionalPeerStore,
    });
  }

  return {
    primaryPeerId: initialPeers[0].id,
    getPeerStore: (peerId) => {
      const store = peerStores[peerId];
      if (!store) throw new Error(`Unknown canvas peer '${peerId}'.`);
      return store;
    },
  };
};

export { useSelector, useTransition } from "./hooks";
export type { AppEvents, CanvasNetworkContext, PeerView, SyncPacket } from "./types";
