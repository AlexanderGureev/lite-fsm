import { useEffect, useRef, type PointerEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { CANVAS_WORLD, getPeerColor, type CanvasPoint } from "../store/constants";
import { useSelector, useTransition } from "../store/hooks";
import type { CanvasBoardContext, CanvasStrokeContext, PeerView } from "../store/types";

type CanvasBoardView = {
  board: {
    state: string;
    context: CanvasBoardContext;
  };
  strokes: Record<string, { state: string; context: CanvasStrokeContext }>;
};

const getCanvasPoint = (canvas: HTMLCanvasElement, event: PointerEvent<HTMLCanvasElement>): CanvasPoint => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_WORLD.width,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_WORLD.height,
  };
};

const drawState = (canvas: HTMLCanvasElement, strokes: CanvasBoardView["strokes"]) => {
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

  for (const { state: strokeState, context } of Object.values(strokes)) {
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

export function CanvasBoard({ peer }: { peer: PeerView }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transition = useTransition();
  const { board, strokes } = useSelector((state): CanvasBoardView => ({
    board: state.canvasBoard,
    strokes: state.canvasStroke,
  }));
  const active = board.state === "DRAWING";
  const activeActorId = board.context.activeActorId;

  useEffect(() => {
    if (canvasRef.current) drawState(canvasRef.current, strokes);
  }, [strokes]);

  const beginDrawing = (point: CanvasPoint) => {
    const strokeId = crypto.randomUUID();

    transition({
      type: "DRAW_BEGIN",
      payload: {
        strokeId,
        authorId: peer.id,
        color: getPeerColor(peer.id),
        point,
        now: Date.now(),
      },
    });
  };

  const moveDrawing = (point: CanvasPoint) => {
    if (!activeActorId) return;

    transition({
      type: "DRAW_MOVE",
      payload: { point, now: Date.now() },
      meta: { actorId: activeActorId },
    });
  };

  const endDrawing = () => {
    if (!activeActorId) return;

    transition({
      type: "DRAW_END",
      payload: { now: Date.now() },
      meta: { actorId: activeActorId },
    });
  };

  return (
    <Card className="gap-0 rounded-lg bg-canvas py-0 ring-1 ring-hairline">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span aria-hidden className="size-3 rounded-full" style={{ background: getPeerColor(peer.id) }} />
          <h3 className="text-tagline text-ink">{peer.label}</h3>
          <Badge variant="secondary" className="rounded-pill bg-canvas-parchment text-caption text-ink-muted-80">
            origin: {peer.id}
          </Badge>
          <Badge variant="secondary" className="rounded-pill bg-canvas-parchment text-caption text-ink-muted-80">
            actors: {Object.keys(strokes).length}
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
            beginDrawing(getCanvasPoint(event.currentTarget, event));
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            moveDrawing(getCanvasPoint(event.currentTarget, event));
          }}
          onPointerUp={(event) => {
            const wasCaptured = event.currentTarget.hasPointerCapture(event.pointerId);
            if (wasCaptured) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            if (!wasCaptured) return;
            endDrawing();
          }}
          onPointerCancel={(event) => {
            const wasCaptured = event.currentTarget.hasPointerCapture(event.pointerId);
            if (wasCaptured) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            if (!wasCaptured) return;
            endDrawing();
          }}
        />
      </CardContent>
    </Card>
  );
}
