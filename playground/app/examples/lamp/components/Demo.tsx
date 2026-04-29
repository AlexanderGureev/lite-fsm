"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSelector, useTransition } from "../store";

export function Demo() {
  const transition = useTransition();
  const { state, context } = useSelector((rootState) => rootState.lamp);
  const isOn = state === "ON";

  return (
    <Card className="mx-auto w-full max-w-2xl gap-0 rounded-lg bg-canvas py-0 ring-1 ring-hairline">
      <CardContent className="flex flex-col items-center gap-8 px-8 py-12">
        <div
          aria-hidden
          data-on={isOn}
          className="size-32 rounded-full transition-transform duration-300 data-[on=true]:scale-105 data-[on=true]:shadow-product"
          style={{
            background: isOn
              ? "radial-gradient(circle at 35% 30%, #ffe89a, #f9b300 70%)"
              : "radial-gradient(circle at 35% 30%, var(--canvas-parchment), var(--ink-muted-48) 80%)",
          }}
        />
        <Badge variant="secondary" className="rounded-pill bg-canvas-parchment text-caption text-ink-muted-80">
          {state}
        </Badge>
      </CardContent>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-divider-soft px-8 py-6">
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => transition({ type: "TURN_ON" })}
            disabled={isOn}
            className="h-auto rounded-pill bg-primary px-6 py-3 text-body text-on-primary active:scale-[0.95]"
          >
            TURN_ON
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => transition({ type: "TURN_OFF" })}
            disabled={!isOn}
            className="h-auto rounded-pill border border-primary bg-transparent px-6 py-3 text-body text-primary active:scale-[0.95]"
          >
            TURN_OFF
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => transition({ type: "RESET" })}
            className="h-auto rounded-pill px-6 py-3 text-body text-ink-muted-80 active:scale-[0.95]"
          >
            RESET
          </Button>
        </div>

        <p className="text-caption text-ink-muted-48">Переключений: {context.toggleCount}</p>
      </div>
    </Card>
  );
}
