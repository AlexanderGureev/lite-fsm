"use client";

import { useRef } from "react";
import { FSMContextProvider } from "@lite-fsm/react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { makeCanvasRuntime, type CanvasRuntime } from "../store";
import { useSelector } from "../store/hooks";
import { CanvasBoard } from "./CanvasBoard";
import { PacketInspector } from "./PacketInspector";

function NetworkDemo({ runtime }: { runtime: CanvasRuntime }) {
  const { peers, lastPacket } = useSelector((state) => state.canvasNetwork.context);
  const [alice, bob] = peers;

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-caption-strong text-primary">Shared actor canvas</p>
          <h2 className="text-tagline text-ink">Две canvas доски</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-pill bg-canvas-parchment text-caption text-ink-muted-80">
            boards: {peers.length}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CanvasBoard peer={alice} />
        <FSMContextProvider machineManager={runtime.getPeerStore(bob.id)}>
          <CanvasBoard peer={bob} />
        </FSMContextProvider>
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
              обновляются network-автоматом через <code>MachineManager.hydrate</code>.
            </p>
            <p>
              <code>generateActorId</code> собирает actor id из <code>originId</code> и <code>strokeId</code>, поэтому
              новая доска может подключиться к общему snapshot без пересечения локальных штрихов.
            </p>
            <p>Тот же packet можно отправить через BroadcastChannel, WebRTC, QR или backend.</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export function Demo() {
  const runtimeRef = useRef<CanvasRuntime | null>(null);
  if (!runtimeRef.current) runtimeRef.current = makeCanvasRuntime();
  const runtime = runtimeRef.current;

  return (
    <FSMContextProvider machineManager={runtime.getPeerStore(runtime.primaryPeerId)}>
      <NetworkDemo runtime={runtime} />
    </FSMContextProvider>
  );
}
