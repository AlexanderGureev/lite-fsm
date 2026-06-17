"use client";

import { PauseIcon, PlayIcon, RotateCcwIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { RTS_CAMERA_ZOOM_EVENT, type RtsCameraZoomAction } from "../phaser-scene";
import { useTransition } from "../../store";
import type { GameStatus } from "./model";

const dispatchCameraZoom = (action: RtsCameraZoomAction) => {
  window.dispatchEvent(new CustomEvent(RTS_CAMERA_ZOOM_EVENT, { detail: { action } }));
};

export function CommandBar({ status }: { status: GameStatus }) {
  const transition = useTransition();
  const { label, isSpawning, isPaused, isGameOver } = status;

  return (
    <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-[#d7f6e0]/14 bg-[#151916]/92 px-3 py-2 text-[#f4faf5] shadow-product">
      <div className="min-w-0 pr-1">
        <p className="text-fine-print font-semibold tracking-[0.08em] text-[#66f0a7] uppercase">Entities + Phaser</p>
        <p className="truncate text-caption-strong text-[#f4faf5]">Стресс-тест RTS</p>
      </div>
      <span
        className={cn(
          "inline-flex h-7 items-center rounded-pill px-2.5 text-fine-print font-semibold",
          !isPaused && !isGameOver && !isSpawning && "bg-[#66f0a7]/16 text-[#9cf4c3]",
          isSpawning && "bg-[#8fd4ff]/16 text-[#b7e6ff]",
          isPaused && "bg-[#f6e27a]/18 text-[#f6e27a]",
          isGameOver && "bg-[#ff786b]/18 text-[#ff9a90]",
        )}
      >
        {label}
      </span>
      <Button
        type="button"
        variant="ghost"
        onClick={() => transition({ type: isPaused ? "GAME_RESUME" : "GAME_PAUSE" })}
        disabled={isGameOver || isSpawning}
        className="h-9 rounded-pill bg-[#f4faf5] px-3 text-caption-strong text-[#151916] hover:bg-[#d8f4e4]"
      >
        {isPaused ? <PlayIcon data-icon="inline-start" /> : <PauseIcon data-icon="inline-start" />}
        {isPaused ? "Продолжить" : "Пауза"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => transition({ type: "GAME_RESTART" })}
        className="h-9 rounded-pill border border-[#d7f6e0]/20 bg-[#1d241f] px-3 text-caption-strong text-[#f4faf5] hover:bg-[#29332c] hover:text-[#f4faf5]"
      >
        <RotateCcwIcon data-icon="inline-start" />
        Настроить
      </Button>
      <div className="flex items-center gap-1 rounded-pill border border-[#d7f6e0]/16 bg-[#1d241f] p-1">
        <Button
          type="button"
          variant="ghost"
          aria-label="Отдалить"
          title="Отдалить"
          onClick={() => dispatchCameraZoom("out")}
          className="size-7 rounded-pill text-[#f4faf5] hover:bg-[#29332c] hover:text-[#f4faf5] [&_svg]:size-4"
        >
          <ZoomOutIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-label="Сбросить масштаб"
          title="Сбросить масштаб"
          onClick={() => dispatchCameraZoom("reset")}
          className="size-7 rounded-pill text-[#f4faf5] hover:bg-[#29332c] hover:text-[#f4faf5] [&_svg]:size-4"
        >
          <RotateCcwIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-label="Приблизить"
          title="Приблизить"
          onClick={() => dispatchCameraZoom("in")}
          className="size-7 rounded-pill text-[#f4faf5] hover:bg-[#29332c] hover:text-[#f4faf5] [&_svg]:size-4"
        >
          <ZoomInIcon />
        </Button>
      </div>
    </div>
  );
}
