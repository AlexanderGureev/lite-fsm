"use client";

import { Gamepad2Icon, PlayIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { GAME_PRESETS, useSelector, useTransition, type GameConfig } from "../../store";
import type { RtsPresetId } from "../../store";
import { formatCount, readCountInput } from "./format";

const presetEntries = Object.entries(GAME_PRESETS) as Array<[RtsPresetId, (typeof GAME_PRESETS)[RtsPresetId]]>;

const activePresetFor = (config: GameConfig) =>
  presetEntries.find(([, preset]) => {
    const presetConfig: GameConfig = preset.config;

    return (
      presetConfig.enemyCount === config.enemyCount &&
      presetConfig.allyCount === config.allyCount &&
      presetConfig.seed === config.seed &&
      presetConfig.playerUnitHp === config.playerUnitHp
    );
  })?.[0];

function CountInput({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-caption-strong text-ink-muted-80">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={value}
        onChange={(event) => onChange(readCountInput(event.target.value))}
        className="h-11 w-full rounded-lg border border-hairline bg-background px-3 text-body-strong text-ink outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/20"
      />
    </label>
  );
}

function SeedInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2">
      <span className="text-caption-strong text-ink-muted-80">Сид</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-hairline bg-background px-3 text-body-strong text-ink outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/20"
      />
    </label>
  );
}

function TacticalPreview({ config }: { config: GameConfig }) {
  const enemyDots = Math.min(36, Math.max(8, Math.round(config.enemyCount / 280)));
  const allyDots = Math.min(18, Math.max(3, Math.round(config.allyCount / 18)));

  return (
    <div className="relative min-h-[260px] overflow-hidden rounded-lg border border-hairline bg-[#111612]">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-md border border-[#f6e27a]/70 bg-[#f6e27a]/18 shadow-[0_0_0_6px_rgba(246,226,122,0.08)]" />
      {Array.from({ length: allyDots }, (_, index) => (
        <span
          key={`ally-${index}`}
          aria-hidden="true"
          className="absolute size-2.5 rounded-sm bg-[#59d6a3] shadow-[0_0_0_3px_rgba(89,214,163,0.14)]"
          style={{
            left: `${42 + (index % 6) * 4}%`,
            top: `${43 + Math.floor(index / 6) * 6}%`,
          }}
        />
      ))}
      {Array.from({ length: enemyDots }, (_, index) => (
        <span
          key={`enemy-${index}`}
          aria-hidden="true"
          className="absolute size-2 rounded-full bg-[#ff6f61] shadow-[0_0_0_2px_rgba(255,111,97,0.16)]"
          style={{
            left: `${8 + ((index * 17) % 84)}%`,
            top: `${10 + ((index * 29) % 80)}%`,
          }}
        />
      ))}
      <div className="absolute inset-x-4 bottom-4 flex flex-wrap gap-2">
        <Badge className="rounded-md bg-[#59d6a3] text-[#09271a]">союзники {formatCount(config.allyCount)}</Badge>
        <Badge className="rounded-md bg-[#ff6f61] text-[#2d0906]">враги {formatCount(config.enemyCount)}</Badge>
      </div>
    </div>
  );
}

export function StartScreen() {
  const transition = useTransition();
  const config = useSelector((state) => state.gameSession.context.config);
  const activePreset = activePresetFor(config);
  const isHeavyRun = config.enemyCount >= 10_000;

  return (
    <Card className="mx-auto my-8 w-[calc(100%-2rem)] max-w-6xl gap-0 rounded-lg bg-canvas py-0 ring-1 ring-hairline sm:my-12">
      <CardHeader className="grid gap-4 border-b border-hairline px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
        <div>
          <CardDescription className="text-caption-strong text-primary">Entities + Phaser</CardDescription>
          <CardTitle className="mt-1 text-tagline text-ink">Стресс-тест RTS</CardTitle>
        </div>
        <Badge variant="secondary" className="w-fit rounded-md bg-canvas-parchment text-ink-muted-80">
          <Gamepad2Icon data-icon="inline-start" />
          настройка
        </Badge>
      </CardHeader>

      <CardContent className="grid gap-0 p-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid gap-6 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {presetEntries.map(([id, preset]) => (
              <Button
                key={id}
                type="button"
                variant={activePreset === id ? "default" : "outline"}
                onClick={() => transition({ type: "GAME_CONFIG_CHANGED", payload: preset.config })}
                className="h-auto min-h-20 flex-col items-start rounded-lg px-4 py-3 text-left whitespace-normal"
              >
                <span className="text-body-strong">{preset.label}</span>
                <span className="text-caption opacity-75">{preset.description}</span>
              </Button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <CountInput
              label="Враги"
              min={0}
              value={config.enemyCount}
              onChange={(enemyCount) => transition({ type: "GAME_CONFIG_CHANGED", payload: { enemyCount } })}
            />
            <CountInput
              label="Союзники"
              min={1}
              value={config.allyCount}
              onChange={(allyCount) => transition({ type: "GAME_CONFIG_CHANGED", payload: { allyCount } })}
            />
            <div className="sm:col-span-2">
              <SeedInput
                value={config.seed}
                onChange={(seed) => transition({ type: "GAME_CONFIG_CHANGED", payload: { seed } })}
              />
            </div>
          </div>

          <p className="text-caption text-ink-muted-48">
            Рекомендуется: врагов 100–20 000, союзников 1–1 000. Большие значения допустимы и лишь предупреждают перед
            запуском.
          </p>

          {isHeavyRun ? (
            <div className="rounded-lg border border-[#d9952b]/40 bg-[#fff2d8] px-4 py-3 text-caption text-[#5a3800]">
              Большое число врагов допустимо; частота кадров зависит от вашего железа.
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => transition({ type: "GAME_START", payload: config })}
              className="h-11 min-w-36 rounded-pill px-5 text-button-large"
            >
              <PlayIcon data-icon="inline-start" />
              Запустить
            </Button>
            <span className="text-caption text-ink-muted-48">
              {formatCount(config.enemyCount + config.allyCount + 1)} сущностей вместе с базой героя
            </span>
          </div>
        </section>

        <aside className="border-t border-hairline p-5 sm:p-6 lg:border-l lg:border-t-0">
          <TacticalPreview config={config} />
          <div className="mt-5 grid gap-3 text-caption text-ink-muted-48">
            <div className="flex items-center justify-between gap-3">
              <span>сид</span>
              <span className="max-w-44 truncate text-body-strong text-ink">{config.seed}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <span>пресет</span>
              <span className="text-body-strong text-ink">{activePreset ?? "свой"}</span>
            </div>
          </div>
        </aside>
      </CardContent>
    </Card>
  );
}
