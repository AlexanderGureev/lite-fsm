import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import type { SyncPacket } from "../store/types";

export function PacketInspector({ packet }: { packet: SyncPacket | null }) {
  const text = packet ? JSON.stringify(packet.snapshot, null, 2) : '{\n  "waiting": "draw on Alice or Bob"\n}';
  const targetLabel = packet && (packet.to.length === 1 ? packet.to[0] : `${packet.to.length} boards`);
  const sentAt = packet
    ? new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(packet.sentAt)
    : null;

  return (
    <Card className="gap-0 rounded-lg bg-canvas py-0 ring-1 ring-hairline">
      <CardHeader className="flex flex-col gap-2 px-5 pt-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-caption-strong text-primary">Transport packet</p>
          <h3 className="text-tagline text-ink">Симулированная сеть</h3>
        </div>
        {packet ? (
          <Badge className="rounded-pill bg-primary/10 text-caption text-primary">
            {packet.from} → {targetLabel} · {packet.actorCount} actors · {sentAt}
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
