"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import {
  CrosshairIcon,
  GaugeIcon,
  HeartPulseIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SkullIcon,
  ZapIcon,
} from "lucide-react";
import { FSMContextProvider } from "lite-fsm/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { publicAssetPath } from "@/lib/public-paths";
import { cn } from "@/lib/utils";

import { ENEMY_RADIUS, PLAYER_RADIUS, PROJECTILE_RADIUS, PROJECTILE_TTL, WORLD } from "../store/constants";
import {
  makeStore,
  selectEnemyHitFeedbackByEntity,
  selectEnemyHealthByEntity,
  selectGameView,
  selectPlayerBody,
  useSelector,
  useTransition,
  type AppStore,
  type Vec2,
} from "../store";
import type { EnemyBodyContext, ProjectileBodyContext } from "../store/types";

type PhaserApi = typeof import("phaser");
type PhaserArc = import("phaser").GameObjects.Arc;
type PhaserImage = import("phaser").GameObjects.Image;
type GameLike = { destroy: (removeCanvas?: boolean, noReturn?: boolean) => void };
type KeyLike = { isDown: boolean };
type CursorKeysLike = { left?: KeyLike; right?: KeyLike; up?: KeyLike; down?: KeyLike };
type WasdKeysLike = { W?: KeyLike; A?: KeyLike; S?: KeyLike; D?: KeyLike };
type HitFeedbackEntry = { ring: PhaserArc; effect: PhaserImage };

const START_SCREEN_IMAGE = publicAssetPath("/examples/roguelite/start-screen.png");
const ROGUELITE_ASSETS = {
  actors: publicAssetPath("/examples/roguelite/assets/actors.png"),
  projectiles: publicAssetPath("/examples/roguelite/assets/projectiles.png"),
  hitEffect: publicAssetPath("/examples/roguelite/assets/hit-effect.png"),
} as const;
const ROGUELITE_TEXTURES = {
  actors: "roguelite-actors",
  projectiles: "roguelite-projectiles",
  hitEffect: "roguelite-hit-effect",
} as const;
const PLAYER_FRAME = 0;
const ENEMY_FRAME_OFFSET = 1;
const ENEMY_FRAME_COUNT = 3;
const PROJECTILE_FRAME_COUNT = 4;
const ACTOR_FRAME_SIZE = 128;
const PROJECTILE_FRAME_SIZE = { width: 160, height: 64 } as const;
const HIT_EFFECT_FRAME_SIZE = 128;
const PLAYER_DISPLAY_SIZE = PLAYER_RADIUS * 3.2;
const ENEMY_DISPLAY_SIZE = ENEMY_RADIUS * 3.2;
const PROJECTILE_DISPLAY_SIZE = { width: PROJECTILE_RADIUS * 7.6, height: PROJECTILE_RADIUS * 2.8 } as const;
const HIT_EFFECT_DISPLAY_SIZE = ENEMY_RADIUS * 4.8;

const hashActorFrame = (actorId: string, frameCount: number) => {
  let hash = 0;

  for (let index = 0; index < actorId.length; index += 1) {
    hash = (hash * 31 + actorId.charCodeAt(index)) >>> 0;
  }

  return hash % frameCount;
};

const syncSpriteRecord = <T extends EnemyBodyContext | ProjectileBodyContext>({
  record,
  sprites,
  create,
  update,
}: {
  record: Record<string, { context: T }>;
  sprites: Map<string, PhaserImage>;
  create: (context: T, actorId: string) => PhaserImage;
  update: (sprite: PhaserImage, context: T, actorId: string) => void;
}) => {
  const liveIds = new Set(Object.keys(record));

  for (const [actorId, slice] of Object.entries(record)) {
    const sprite = sprites.get(actorId) ?? create(slice.context, actorId);
    sprites.set(actorId, sprite);
    update(sprite, slice.context, actorId);
  }

  for (const [actorId, sprite] of sprites) {
    if (liveIds.has(actorId)) continue;
    sprite.destroy();
    sprites.delete(actorId);
  }
};

function createRogueliteScene(Phaser: PhaserApi, dpr: number, manager: AppStore) {
  return class RogueliteScene extends Phaser.Scene {
    private cursors?: CursorKeysLike;
    private wasd?: WasdKeysLike;
    private playerSprite?: PhaserImage;
    private readonly enemySprites = new Map<string, PhaserImage>();
    private readonly projectileSprites = new Map<string, PhaserImage>();
    private readonly enemyHitFeedbackViews = new Map<string, HitFeedbackEntry>();

    preload() {
      this.load.spritesheet(ROGUELITE_TEXTURES.actors, ROGUELITE_ASSETS.actors, {
        frameWidth: ACTOR_FRAME_SIZE,
        frameHeight: ACTOR_FRAME_SIZE,
      });
      this.load.spritesheet(ROGUELITE_TEXTURES.projectiles, ROGUELITE_ASSETS.projectiles, {
        frameWidth: PROJECTILE_FRAME_SIZE.width,
        frameHeight: PROJECTILE_FRAME_SIZE.height,
      });
      this.load.spritesheet(ROGUELITE_TEXTURES.hitEffect, ROGUELITE_ASSETS.hitEffect, {
        frameWidth: HIT_EFFECT_FRAME_SIZE,
        frameHeight: HIT_EFFECT_FRAME_SIZE,
      });
    }

    create() {
      this.cameras.main.setZoom(dpr);
      this.cameras.main.centerOn(WORLD.width / 2, WORLD.height / 2);
      this.cameras.main.setBackgroundColor("#101217");
      this.drawArena();

      this.cursors = this.input.keyboard?.createCursorKeys() as CursorKeysLike | undefined;
      this.wasd = this.input.keyboard?.addKeys("W,A,S,D") as WasdKeysLike | undefined;
      this.input.keyboard?.on("keydown-ESC", () => this.togglePause());

      this.syncFromState();
    }

    update(_time: number, delta: number) {
      if (manager.getState().gameSession.context.status !== "running") return;

      manager.transition({ type: "PLAYER_INPUT", payload: this.readKeyboard() });
      manager.transition({ type: "TICK", payload: { now: Date.now(), delta } });
      this.syncFromState();
    }

    private drawArena() {
      this.add.rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height, 0xf7f3e8, 1);
      const grid = this.add.graphics();
      grid.lineStyle(1, 0xd9d1c2, 0.34);

      for (let x = 80; x < WORLD.width; x += 80) grid.lineBetween(x, 0, x, WORLD.height);
      for (let y = 80; y < WORLD.height; y += 80) grid.lineBetween(0, y, WORLD.width, y);

      grid.lineStyle(1, 0x0061d3, 0.18);
      grid.strokeCircle(WORLD.width / 2, WORLD.height / 2, 92);
      grid.strokeCircle(WORLD.width / 2, WORLD.height / 2, 188);
      grid.strokeCircle(WORLD.width / 2, WORLD.height / 2, 286);

      this.add
        .rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width - 2, WORLD.height - 2)
        .setStrokeStyle(2, 0x1b1d23, 0.18);
    }

    private togglePause() {
      const { status } = manager.getState().gameSession.context;
      if (status === "game-over" || status === "idle") return;
      manager.transition({ type: status === "paused" ? "RESUME_GAME" : "PAUSE_GAME" });
    }

    private readKeyboard(): Vec2 {
      const left = Boolean(this.cursors?.left?.isDown || this.wasd?.A?.isDown);
      const right = Boolean(this.cursors?.right?.isDown || this.wasd?.D?.isDown);
      const up = Boolean(this.cursors?.up?.isDown || this.wasd?.W?.isDown);
      const down = Boolean(this.cursors?.down?.isDown || this.wasd?.S?.isDown);

      return {
        x: Number(right) - Number(left),
        y: Number(down) - Number(up),
      };
    }

    private syncFromState() {
      const state = manager.getState();
      const player = selectPlayerBody(state);

      if (player) {
        this.playerSprite ??= this.add
          .image(player.x, player.y, ROGUELITE_TEXTURES.actors, PLAYER_FRAME)
          .setDepth(3)
          .setDisplaySize(PLAYER_DISPLAY_SIZE, PLAYER_DISPLAY_SIZE);
        this.playerSprite.setPosition(player.x, player.y);
        this.playerSprite.setAlpha(player.hp <= 25 ? 0.82 : 1);
        if (player.hp <= 25) {
          this.playerSprite.setTint(0xff786b);
        } else {
          this.playerSprite.clearTint();
        }
      } else if (this.playerSprite) {
        this.playerSprite.destroy();
        this.playerSprite = undefined;
      }

      syncSpriteRecord({
        record: state.enemyBody,
        sprites: this.enemySprites,
        create: (enemy, actorId) =>
          this.add
            .image(
              enemy.x,
              enemy.y,
              ROGUELITE_TEXTURES.actors,
              ENEMY_FRAME_OFFSET + hashActorFrame(actorId, ENEMY_FRAME_COUNT),
            )
            .setDepth(2),
        update: (sprite, enemy) => {
          const health = selectEnemyHealthByEntity(state, enemy.entityId);
          const healthRate = health ? health.current / health.max : 0;
          const feedback = selectEnemyHitFeedbackByEntity(state, enemy.entityId);
          const displaySize = ENEMY_DISPLAY_SIZE * (0.9 + healthRate * 0.18) * (feedback?.spriteScale ?? 1);

          sprite.setPosition(enemy.x + (feedback?.recoil.x ?? 0), enemy.y + (feedback?.recoil.y ?? 0));
          sprite.setDisplaySize(displaySize, displaySize);
          sprite.setAlpha(0.9 + healthRate * 0.1);
          if (feedback?.flash) {
            sprite.setTint(0xffffff);
          } else if (healthRate <= 0.5) {
            sprite.setTint(0xffa34d);
          } else {
            sprite.clearTint();
          }
        },
      });

      syncSpriteRecord({
        record: state.projectileBody,
        sprites: this.projectileSprites,
        create: (projectile, actorId) =>
          this.add
            .image(
              projectile.x,
              projectile.y,
              ROGUELITE_TEXTURES.projectiles,
              hashActorFrame(actorId, PROJECTILE_FRAME_COUNT),
            )
            .setDepth(4),
        update: (sprite, projectile) => {
          sprite.setPosition(projectile.x, projectile.y);
          sprite.setRotation(Math.atan2(projectile.vy, projectile.vx));
          sprite.setDisplaySize(PROJECTILE_DISPLAY_SIZE.width, PROJECTILE_DISPLAY_SIZE.height);
          sprite.setAlpha(Math.max(0.35, projectile.ttl / PROJECTILE_TTL));
        },
      });

      const liveFeedbackIds = new Set(Object.keys(state.enemyHitFeedback));

      for (const [actorId, { context: feedback }] of Object.entries(state.enemyHitFeedback)) {
        const view = this.enemyHitFeedbackViews.get(actorId) ?? {
          ring: this.add
            .circle(feedback.x, feedback.y, ENEMY_RADIUS * 1.75)
            .setDepth(4)
            .setFillStyle(0xffffff, 0)
            .setStrokeStyle(2, 0xf0a53a, 0.92),
          effect: this.add
            .image(feedback.x, feedback.y, ROGUELITE_TEXTURES.hitEffect, feedback.effectFrame)
            .setDepth(5)
            .setDisplaySize(HIT_EFFECT_DISPLAY_SIZE, HIT_EFFECT_DISPLAY_SIZE),
        };

        this.enemyHitFeedbackViews.set(actorId, view);
        view.ring.setPosition(feedback.x, feedback.y);
        view.ring.setScale(feedback.ringScale);
        view.ring.setAlpha(feedback.ringAlpha);
        view.effect.setPosition(feedback.x, feedback.y);
        view.effect.setFrame(feedback.effectFrame);
        view.effect.setDisplaySize(
          HIT_EFFECT_DISPLAY_SIZE * feedback.effectScale,
          HIT_EFFECT_DISPLAY_SIZE * feedback.effectScale,
        );
        view.effect.setAlpha(feedback.effectAlpha);
      }

      for (const [actorId, view] of this.enemyHitFeedbackViews) {
        if (liveFeedbackIds.has(actorId)) continue;
        view.ring.destroy();
        view.effect.destroy();
        this.enemyHitFeedbackViews.delete(actorId);
      }
    }
  };
}

function PhaserCanvas({ manager }: { manager: AppStore }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let game: GameLike | undefined;

    const mountGame = async () => {
      if (!containerRef.current) return;

      const Phaser = (await import("phaser")) as PhaserApi;
      if (disposed || !containerRef.current) return;

      const dpr = Math.max(1, window.devicePixelRatio || 1);

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: WORLD.width * dpr,
        height: WORLD.height * dpr,
        backgroundColor: "#101217",
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        render: { antialias: true, pixelArt: false },
        scene: createRogueliteScene(Phaser, dpr, manager),
      }) as GameLike;
    };

    void mountGame();

    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, [manager]);

  return <div ref={containerRef} className="absolute inset-0 [&>canvas]:!h-full [&>canvas]:!w-full" />;
}

function MetricRow({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3">
      <span className="flex size-8 items-center justify-center rounded-md bg-canvas-parchment text-primary">
        {icon}
      </span>
      <span className="text-caption text-ink-muted-48">{label}</span>
      <span className="text-body-strong text-ink">
        {value}
        {detail ? <span className="ml-2 text-caption text-ink-muted-48">{detail}</span> : null}
      </span>
    </div>
  );
}

function CountRail({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-fine-print uppercase text-ink-muted-48">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item.label} variant="secondary" className="rounded-md bg-canvas-parchment text-ink-muted-80">
            {item.label} ×{item.value}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <Card className="gap-0 overflow-hidden rounded-lg bg-surface-black py-0 text-on-dark ring-1 ring-hairline">
      <CardContent className="p-0">
        <div className="relative min-h-[540px] overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center opacity-95"
            style={{
              backgroundImage: `linear-gradient(90deg, rgba(13, 13, 16, 0.9) 0%, rgba(13, 13, 16, 0.58) 45%, rgba(13, 13, 16, 0.16) 100%), url(${START_SCREEN_IMAGE})`,
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_72%,rgba(0,97,211,0.34),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent_46%)]" />

          <div className="relative flex min-h-[540px] flex-col justify-between p-6 sm:p-8 lg:p-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge className="rounded-md bg-on-dark text-ink">Phaser + lite-fsm actors</Badge>
              <Badge variant="secondary" className="rounded-md bg-on-dark/10 text-on-dark ring-1 ring-on-dark/20">
                WASD · ESC
              </Badge>
            </div>

            <div className="max-w-2xl">
              <p className="mb-3 text-caption-strong text-primary-on-dark">actor-группы в реальном времени</p>
              <h2 className="max-w-xl text-display-lg text-on-dark">Враги, снаряды, игрок</h2>
              <p className="mt-4 max-w-lg text-lead-airy text-body-muted">
                Компактная арена, где каждый выстрел, спавн и контакт проходит через lite-fsm.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={onStart}
                  className="h-12 min-w-40 gap-3 rounded-pill px-7 text-button-large shadow-product active:scale-[0.98]"
                >
                  <PlayIcon data-icon="inline-start" />
                  старт
                </Button>
                <span className="text-caption text-body-muted">автострельба включается сразу после входа</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GameView({ manager }: { manager: AppStore }) {
  const transition = useTransition();
  const viewStats = useSelector(selectGameView);
  const isIdle = viewStats.status === "idle";
  const isPaused = viewStats.status === "paused";
  const isGameOver = viewStats.status === "game-over";
  const bootGame = () => transition({ type: "GAME_BOOT", payload: { now: Date.now() } });
  const togglePause = () => {
    if (isGameOver || isIdle) return;
    transition({ type: isPaused ? "RESUME_GAME" : "PAUSE_GAME" });
  };

  if (isIdle) return <StartScreen onStart={bootGame} />;

  return (
    <Card className="gap-0 overflow-hidden rounded-lg bg-canvas py-0 ring-1 ring-hairline">
      <CardHeader className="grid gap-4 px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
        <div>
          <CardDescription className="text-caption-strong text-primary">Phaser + lite-fsm actors</CardDescription>
          <CardTitle className="mt-1 text-tagline text-ink">Враги, снаряды, игрок — actor-группы</CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge
            variant="secondary"
            className={cn(
              "rounded-md bg-canvas-parchment text-ink-muted-80",
              isGameOver && "bg-destructive/10 text-destructive",
              isPaused && "bg-primary/10 text-primary",
            )}
          >
            {isGameOver ? "GAME OVER" : isPaused ? "ПАУЗА" : "LIVE"}
          </Badge>
          <Button
            type="button"
            variant="secondary"
            onClick={togglePause}
            disabled={isGameOver}
            className="rounded-pill"
          >
            {isPaused ? <PlayIcon data-icon="inline-start" /> : <PauseIcon data-icon="inline-start" />}
            {isPaused ? "продолжить" : "пауза"}
          </Button>
          <Button type="button" variant="outline" onClick={bootGame} className="rounded-pill">
            <RotateCcwIcon data-icon="inline-start" />
            заново
          </Button>
        </div>
      </CardHeader>

      <CardContent className="grid gap-0 p-0 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="relative overflow-hidden rounded-lg border border-hairline bg-surface-black shadow-product">
            <div className="relative aspect-[23/14] w-full">
              <PhaserCanvas manager={manager} />

              {isPaused ? (
                <div className="absolute inset-0 grid place-items-center bg-surface-black/70 px-4 text-center text-on-dark backdrop-blur-sm">
                  <div className="flex max-w-sm flex-col items-center gap-4">
                    <Badge className="rounded-md bg-primary text-on-primary">ПАУЗА</Badge>
                    <p className="text-tagline text-on-dark">Арена заморожена</p>
                    <Button type="button" onClick={() => transition({ type: "RESUME_GAME" })} className="rounded-pill">
                      <PlayIcon data-icon="inline-start" />
                      продолжить
                    </Button>
                  </div>
                </div>
              ) : null}

              {isGameOver ? (
                <div className="absolute inset-0 grid place-items-center bg-surface-black/75 px-4 text-center text-on-dark backdrop-blur-sm">
                  <div className="flex max-w-sm flex-col items-center gap-4">
                    <Badge variant="destructive" className="rounded-md">
                      GAME OVER
                    </Badge>
                    <p className="text-tagline text-on-dark">actor-группа игрока завершена</p>
                    <Button type="button" onClick={bootGame} className="rounded-pill">
                      <RotateCcwIcon data-icon="inline-start" />
                      заново
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-5 border-t border-hairline px-5 py-5 lg:border-l lg:border-t-0">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-caption-strong text-ink">Состояние рана</p>
              <Badge variant="outline" className="rounded-md">
                {viewStats.spawnBoost}
              </Badge>
            </div>
            <div className="h-2 overflow-hidden rounded-pill bg-canvas-parchment">
              <div
                className={cn(
                  "h-full rounded-pill transition-all",
                  viewStats.hp.percent <= 25 ? "bg-destructive" : "bg-primary",
                )}
                style={{ width: `${viewStats.hp.percent}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col">
            <MetricRow
              icon={<HeartPulseIcon />}
              label="HP"
              value={`${viewStats.hp.current}/${viewStats.hp.max}`}
              detail={`${viewStats.hp.percent}%`}
            />
            <Separator />
            <MetricRow icon={<SkullIcon />} label="kills" value={viewStats.kills} />
            <Separator />
            <MetricRow icon={<CrosshairIcon />} label="shots / hits" value={`${viewStats.shots}/${viewStats.hits}`} />
            <Separator />
            <MetricRow
              icon={<GaugeIcon />}
              label="spawn"
              value={`${viewStats.spawnInterval}ms`}
              detail={viewStats.spawnBoost}
            />
          </div>

          <Separator />

          <CountRail title="groups" items={viewStats.groups} />
          <CountRail title="actors" items={viewStats.actors} />

          <div className="mt-auto flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => transition({ type: "BOOST_SPAWN_RATE", payload: { multiplier: 0.7 } })}
              className="rounded-pill"
            >
              <ZapIcon data-icon="inline-start" />
              ускорить ×1.43
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => transition({ type: "BOOST_SPAWN_RATE", payload: { reset: true } })}
              className="rounded-pill text-ink-muted-80"
            >
              сбросить рейт
            </Button>
          </div>
        </aside>
      </CardContent>
    </Card>
  );
}

export function Game() {
  const manager = useMemo(() => makeStore({ random: Math.random }), []);

  return (
    <FSMContextProvider machineManager={manager}>
      <GameView manager={manager} />
    </FSMContextProvider>
  );
}
