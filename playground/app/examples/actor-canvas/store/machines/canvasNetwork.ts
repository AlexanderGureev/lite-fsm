import type { CanvasPeerId } from "../constants";
import { createMachine } from "../create-machine";
import type { CanvasNetworkContext, PeerView } from "../types";

export const initialPeers: PeerView[] = [
  { id: "alice", label: "Alice" },
  { id: "bob", label: "Bob" },
];

const initialContext: CanvasNetworkContext = {
  peers: initialPeers,
  lastPacket: null,
};

export const canvasNetwork = createMachine({
  config: {
    ONLINE: {
      PACKET_SENT: null,
    },
  },
  initialState: "ONLINE",
  initialContext,
  reducer: (state, action) => {
    switch (action.type) {
      case "PACKET_SENT": {
        state.context.lastPacket = action.payload;
        break;
      }
    }
  },
  effects: {
    "*": ({ action, getPeerId, getState, transition, getPeerStore }) => {
      const publishSnapshot = (from: CanvasPeerId, to: CanvasPeerId[]) => {
        if (to.length === 0) return;

        const sourceStore = getPeerStore(from);
        if (!sourceStore) return;

        const packetSnapshot = sourceStore.dehydrate({ machines: ["canvasStroke"] });

        transition({
          type: "PACKET_SENT",
          payload: {
            from,
            to,
            sentAt: Date.now(),
            actorCount: Object.keys(packetSnapshot.machines.canvasStroke ?? {}).length,
            snapshot: packetSnapshot,
          },
        });

        const syncSnapshot = sourceStore.dehydrate({ machines: ["canvasNetwork", "canvasStroke"] });
        for (const peerId of to) getPeerStore(peerId)?.hydrate(syncSnapshot, { strategy: "merge" });
      };

      switch (action.type) {
        case "DRAW_BEGIN":
        case "DRAW_MOVE":
        case "DRAW_END": {
          const localPeerId = getPeerId();
          publishSnapshot(
            localPeerId,
            getState()
              .canvasNetwork.context.peers.map((peer) => peer.id)
              .filter((peerId) => peerId !== localPeerId),
          );
          break;
        }
      }
    },
  },
});
