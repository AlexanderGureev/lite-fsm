"use client";

import { useEffect, useRef, useState } from "react";
import { type MachineManagerSnapshot } from "lite-fsm";
import { FSMContextProvider, FSMHydrationBoundary } from "lite-fsm/react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { CANVAS_WORLD, peerColors, type CanvasPeerId, type CanvasPoint } from "../store/constants";
import {
  makeStore,
  strokeEntries,
  useSelector,
  type AppState,
  type AppStore,
  type FSMConfigType,
} from "../store";

type PeerView = {
  id: CanvasPeerId;
  label: string;
};

type SyncPacket = {
  from: CanvasPeerId;
  to: CanvasPeerId;
  sentAt: number;
  actorCount: number;
  snapshot: MachineManagerSnapshot<FSMConfigType>;
};

type IncomingSnapshots = Partial<Record<CanvasPeerId, MachineManagerSnapshot<FSMConfigType>>>;
type PeerManagers = Record<CanvasPeerId, AppStore>;

const peers: PeerView[] = [
  { id: "alice", label: "Alice" },
  { id: "bob", label: "Bob" },
];

const otherPeer = (peerId: CanvasPeerId): CanvasPeerId => (peerId === "alice" ? "bob" : "alice");

const createStrokeId = () => crypto.randomUUID();

const formatTime = (value: number) =>
  new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);

const actorCount = (state: AppState) => Object.keys(state.canvasStroke).length;

const findStrokeActorId = (state: AppState, strokeId: string) =>
  strokeEntries(state).find((entry) => entry.context.strokeId === strokeId)?.actorId ?? null;

const getCanvasPoint = (canvas: HTMLCanvasElement, event: React.PointerEvent<HTMLCanvasElement>): CanvasPoint => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_WORLD.width,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_WORLD.height,
  };
};

const drawState = (canvas: HTMLCanvasElement, state: AppState) => {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CANVAS_WORLD.width * dpr;
  canvas.height = CANVAS_WORLD.height * dpr;
  canvas.style.width = "100%";
  canvas.style.height = "auto";

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, CANVAS_WORLD.width, CANVAS_WORLD.height);

  ctx.fillStyle = "#fafafc";
  ctx.fillRect(0, 0, CANVAS_WORLD.width, CANVAS_WORLD.height);
  ctx.strokeStyle = "rgba(122, 122, 122, 0.18)";
  ctx.lineWidth = 1;
  for (let x = 40; x < CANVAS_WORLD.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_WORLD.height);
    ctx.stroke();
  }
  for (let y = 40; y < CANVAS_WORLD.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WORLD.width, y);
    ctx.stroke();
  }

  for (const { state: strokeState, context } of strokeEntries(state)) {
    const points = context.points;
    if (points.length === 0) continue;

    ctx.strokeStyle = context.color;
    ctx.lineWidth = strokeState === "DRAWING" ? 5 : 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = strokeState === "DRAWING" ? 0.82 : 1;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();

    if (points.length === 1) {
      ctx.fillStyle = context.color;
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
};

function CanvasBoard({
  peer,
  active,
  onBegin,
  onMove,
  onEnd,
}: {
  peer: PeerView;
  active: boolean;
  onBegin: (peerId: CanvasPeerId, canvas: HTMLCanvasElement, event: React.PointerEvent<HTMLCanvasElement>) => void;
  onMove: (peerId: CanvasPeerId, canvas: HTMLCanvasElement, event: React.PointerEvent<HTMLCanvasElement>) => void;
  onEnd: (peerId: CanvasPeerId) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const state = useSelector((rootState) => rootState);

  useEffect(() => {
    if (canvasRef.current) drawState(canvasRef.current, state);
  }, [state]);

  return (
    <Card className="gap-0 rounded-lg bg-canvas py-0 ring-1 ring-hairline">
      <CardHeader className="flex-row items-center justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-full" style={{ background: peerColors[peer.id] }} />
          <h3 className="text-tagline text-ink">{peer.label}</h3>
          <Badge variant="secondary" className="rounded-pill bg-canvas-parchment text-caption text-ink-muted-80">
            actors: {actorCount(state)}
          </Badge>
        </div>
        <Badge
          className={cn(
            "rounded-pill text-caption",
            active ? "bg-primary/10 text-primary" : "bg-canvas-parchment text-ink-muted-80",
          )}
        >
          {active ? "drawing" : "synced"}
        </Badge>
      </CardHeader>

      <CardContent className="px-5 pb-5 pt-4">
        <canvas
          ref={canvasRef}
          width={CANVAS_WORLD.width}
          height={CANVAS_WORLD.height}
          className="block aspect-[680/420] w-full cursor-crosshair touch-none rounded-md border border-hairline bg-surface-pearl"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onBegin(peer.id, event.currentTarget, event);
          }}
          onPointerMove={(event) => onMove(peer.id, event.currentTarget, event)}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            onEnd(peer.id);
          }}
          onPointerCancel={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            onEnd(peer.id);
          }}
        />
      </CardContent>
    </Card>
  );
}

function PacketInspector({ packet }: { packet: SyncPacket | null }) {
  const text = packet ? JSON.stringify(packet.snapshot, null, 2) : '{\n  "waiting": "draw on Alice or Bob"\n}';

  return (
    <Card className="gap-0 rounded-lg bg-canvas py-0 ring-1 ring-hairline">
      <CardHeader className="flex flex-col gap-2 px-5 pt-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-caption-strong text-primary">Transport packet</p>
          <h3 className="text-tagline text-ink">Симулированная сеть</h3>
        </div>
        {packet ? (
          <Badge className="rounded-pill bg-primary/10 text-caption text-primary">
            {packet.from} → {packet.to} · {packet.actorCount} actors · {formatTime(packet.sentAt)}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-4">
        <pre className="h-[360px] overflow-auto rounded-md border border-hairline bg-canvas-parchment p-4 text-caption leading-relaxed text-ink-muted-80">
          <code>{text}</code>
        </pre>
      </CardContent>
    </Card>
  );
}

function PeerBoundary({
  manager,
  snapshot,
  children,
}: React.PropsWithChildren<{
  manager: AppStore;
  snapshot?: MachineManagerSnapshot<FSMConfigType>;
}>) {
  return (
    <FSMContextProvider machineManager={manager}>
      {snapshot ? (
        <FSMHydrationBoundary<FSMConfigType> snapshot={snapshot} strategy="merge">
          {children}
        </FSMHydrationBoundary>
      ) : (
        children
      )}
    </FSMContextProvider>
  );
}

const createPeerManagers = (): PeerManagers => ({
  alice: makeStore("alice"),
  bob: makeStore("bob"),
});

export function Demo() {
  const managersRef = useRef<PeerManagers | null>(null);
  if (!managersRef.current) managersRef.current = createPeerManagers();
  const managers = managersRef.current;

  const activeActors = useRef<Partial<Record<CanvasPeerId, string>>>({});
  const [activePeers, setActivePeers] = useState<Record<CanvasPeerId, boolean>>({ alice: false, bob: false });
  const [incomingSnapshots, setIncomingSnapshots] = useState<IncomingSnapshots>({});
  const [lastPacket, setLastPacket] = useState<SyncPacket | null>(null);

  const syncFrom = (from: CanvasPeerId) => {
    const to = otherPeer(from);
    const snapshot = managers[from].dehydrate({ machines: ["canvasStroke"] });

    setIncomingSnapshots((prev) => ({ ...prev, [to]: snapshot }));
    setLastPacket({
      from,
      to,
      sentAt: Date.now(),
      actorCount: Object.keys(snapshot.machines.canvasStroke ?? {}).length,
      snapshot,
    });
  };

  const beginStroke = (
    peerId: CanvasPeerId,
    canvas: HTMLCanvasElement,
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const manager = managers[peerId];
    const strokeId = createStrokeId();
    manager.transition({
      type: "STROKE_BEGIN",
      payload: {
        strokeId,
        authorId: peerId,
        color: peerColors[peerId],
        point: getCanvasPoint(canvas, event),
        now: Date.now(),
      },
    });
    activeActors.current[peerId] = findStrokeActorId(manager.getState(), strokeId) ?? undefined;
    setActivePeers((prev) => ({ ...prev, [peerId]: true }));
    syncFrom(peerId);
  };

  const appendStroke = (
    peerId: CanvasPeerId,
    canvas: HTMLCanvasElement,
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const actorId = activeActors.current[peerId];
    if (!actorId) return;

    managers[peerId].transition({
      type: "STROKE_APPEND",
      payload: { point: getCanvasPoint(canvas, event), now: Date.now() },
      meta: { actorId },
    });
    syncFrom(peerId);
  };

  const commitStroke = (peerId: CanvasPeerId) => {
    const actorId = activeActors.current[peerId];
    if (!actorId) return;

    managers[peerId].transition({
      type: "STROKE_COMMIT",
      payload: { now: Date.now() },
      meta: { actorId },
    });
    delete activeActors.current[peerId];
    setActivePeers((prev) => ({ ...prev, [peerId]: false }));
    syncFrom(peerId);
  };

  return (
    <section className="flex flex-col gap-8">
      <div className="grid gap-4 lg:grid-cols-2">
        {peers.map((peer) => (
          <PeerBoundary key={peer.id} manager={managers[peer.id]} snapshot={incomingSnapshots[peer.id]}>
            <CanvasBoard
              peer={peer}
              active={activePeers[peer.id]}
              onBegin={beginStroke}
              onMove={appendStroke}
              onEnd={commitStroke}
            />
          </PeerBoundary>
        ))}
      </div>

      <Separator className="bg-hairline" />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <PacketInspector packet={lastPacket} />
        <Card className="gap-0 rounded-lg bg-canvas py-0 ring-1 ring-hairline">
          <CardHeader className="px-5 pt-5">
            <p className="text-caption-strong text-primary">Что смотреть</p>
            <h3 className="text-tagline text-ink">Snapshot transport</h3>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-5 pb-5 pt-4 text-body text-ink-muted-80">
            <p>
              В snapshot нет canvas bitmap. Передаётся только <code>machines.canvasStroke</code>: record actor ids и
              compact payload каждого штриха.
            </p>
            <p>
              <code>merge</code> делает доску совместной: локальные акторы не стираются, чужие добавляются или
              обновляются через <code>FSMHydrationBoundary</code>.
            </p>
            <p>Тот же packet можно отправить через BroadcastChannel, WebRTC, QR или backend.</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
