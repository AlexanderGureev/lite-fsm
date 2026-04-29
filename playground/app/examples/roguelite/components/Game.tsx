"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import {
  ENEMY_RADIUS,
  PLAYER_RADIUS,
  PROJECTILE_RADIUS,
  WORLD,
} from "../store/constants";
import { makeStore, type AppState, type AppStore, type Vec2 } from "../store";
import type { EnemyBodyContext, ProjectileBodyContext } from "../store/types";

type PhaserApi = typeof import("phaser");
type GameLike = { destroy: (removeCanvas?: boolean, noReturn?: boolean) => void };
type KeyLike = { isDown: boolean };
type CursorKeysLike = { left?: KeyLike; right?: KeyLike; up?: KeyLike; down?: KeyLike };
type WasdKeysLike = { W?: KeyLike; A?: KeyLike; S?: KeyLike; D?: KeyLike };
type CircleLike = {
  setPosition: (x: number, y: number) => unknown;
  setFillStyle: (color: number, alpha?: number) => unknown;
  setStrokeStyle: (lineWidth: number, color: number, alpha?: number) => unknown;
  setScale: (x: number, y?: number) => unknown;
  destroy: () => void;
};
type VisibleLike = { setVisible: (visible: boolean) => unknown; destroy: () => void };
type TextLike = VisibleLike & {
  setText: (text: string) => unknown;
  setResolution: (value: number) => unknown;
  setOrigin: (x: number, y?: number) => unknown;
};

const ACTOR_TEMPLATES = ["playerBody", "enemyBody", "enemyHealth", "projectileBody"] as const;
type ActorTemplateKey = (typeof ACTOR_TEMPLATES)[number];

const GROUP_TEMPLATES: Record<string, ReadonlyArray<ActorTemplateKey>> = {
  player: ["playerBody"],
  enemy: ["enemyBody", "enemyHealth"],
  projectile: ["projectileBody"],
};

const countActors = (state: AppState, key: ActorTemplateKey) => Object.keys(state[key]).length;

const countGroup = (state: AppState, templates: ReadonlyArray<ActorTemplateKey>) =>
  templates.reduce((max, key) => Math.max(max, countActors(state, key)), 0);

const getFirst = <T extends object>(record: Record<string, { context: T }>) =>
  Object.values(record)[0]?.context ?? null;

const findEnemyHealth = (state: AppState, entityId: string) =>
  Object.values(state.enemyHealth).find((slice) => slice.context.entityId === entityId)?.context ?? null;

const syncCircleRecord = <T extends EnemyBodyContext | ProjectileBodyContext>({
  record,
  sprites,
  create,
  update,
}: {
  record: Record<string, { context: T }>;
  sprites: Map<string, CircleLike>;
  create: (context: T) => CircleLike;
  update: (sprite: CircleLike, context: T) => void;
}) => {
  const liveIds = new Set(Object.keys(record));

  for (const [actorId, slice] of Object.entries(record)) {
    const sprite = sprites.get(actorId) ?? create(slice.context);
    sprites.set(actorId, sprite);
    update(sprite, slice.context);
  }

  for (const [actorId, sprite] of sprites) {
    if (liveIds.has(actorId)) continue;
    sprite.destroy();
    sprites.delete(actorId);
  }
};

function createRogueliteScene(Phaser: PhaserApi, dpr: number, managerRef: { current: AppStore | null }) {
  return class RogueliteScene extends Phaser.Scene {
    private readonly inputVector: Vec2 = { x: 0, y: 0 };
    private readonly manager: AppStore = makeStore({
      getInputVector: () => this.inputVector,
      random: Math.random,
    });
    private cursors?: CursorKeysLike;
    private wasd?: WasdKeysLike;
    private playerSprite?: CircleLike;
    private hud?: TextLike;
    private pauseOverlay?: VisibleLike;
    private pauseLabel?: TextLike;
    private isPaused = false;
    private unsubscribePause?: () => void;
    private readonly enemySprites = new Map<string, CircleLike>();
    private readonly projectileSprites = new Map<string, CircleLike>();

    create() {
      this.cameras.main.setZoom(dpr);
      this.cameras.main.centerOn(WORLD.width / 2, WORLD.height / 2);
      this.cameras.main.setBackgroundColor("#fafafc");
      this.add.rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width - 2, WORLD.height - 2, 0xffffff, 1);
      this.add
        .rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width - 2, WORLD.height - 2)
        .setStrokeStyle(1, 0xe0e0e0, 1);
      this.hud = this.add.text(16, 14, "", {
        color: "#1d1d1f",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "13px",
      }) as unknown as TextLike;
      this.hud.setResolution(dpr);

      this.pauseOverlay = this.add
        .rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height, 0xffffff, 0.85)
        .setVisible(false) as unknown as VisibleLike;
      this.pauseLabel = this.add.text(WORLD.width / 2, WORLD.height / 2, "ПАУЗА\nESC — продолжить", {
        color: "#1d1d1f",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "26px",
        align: "center",
      }) as unknown as TextLike;
      this.pauseLabel.setOrigin(0.5, 0.5);
      this.pauseLabel.setResolution(dpr);
      this.pauseLabel.setVisible(false);

      this.cursors = this.input.keyboard?.createCursorKeys() as CursorKeysLike | undefined;
      this.wasd = this.input.keyboard?.addKeys("W,A,S,D") as WasdKeysLike | undefined;
      this.input.keyboard?.on("keydown-ESC", () => this.togglePause());

      managerRef.current = this.manager;
      this.events.once("destroy", () => {
        this.unsubscribePause?.();
        this.unsubscribePause = undefined;
        if (managerRef.current === this.manager) managerRef.current = null;
      });

      this.manager.transition({ type: "GAME_BOOT", payload: { now: Date.now() } });
      this.syncFromState();
    }

    update(_time: number, delta: number) {
      if (this.isPaused) return;
      this.readKeyboard();
      this.manager.transition({ type: "TICK", payload: { now: Date.now(), delta } });
      this.syncFromState();
    }

    private togglePause() {
      if (this.manager.getState().gameSession.context.status === "game-over") return;
      this.isPaused = !this.isPaused;
      this.pauseOverlay?.setVisible(this.isPaused);
      this.pauseLabel?.setVisible(this.isPaused);
      if (this.isPaused) {
        this.inputVector.x = 0;
        this.inputVector.y = 0;
        this.unsubscribePause = this.manager.onTransition(() => this.syncFromState());
      } else {
        this.unsubscribePause?.();
        this.unsubscribePause = undefined;
      }
      this.syncFromState();
    }

    private readKeyboard() {
      const left = Boolean(this.cursors?.left?.isDown || this.wasd?.A?.isDown);
      const right = Boolean(this.cursors?.right?.isDown || this.wasd?.D?.isDown);
      const up = Boolean(this.cursors?.up?.isDown || this.wasd?.W?.isDown);
      const down = Boolean(this.cursors?.down?.isDown || this.wasd?.S?.isDown);

      this.inputVector.x = Number(right) - Number(left);
      this.inputVector.y = Number(down) - Number(up);
    }

    private syncFromState() {
      const state = this.manager.getState();
      const player = getFirst(state.playerBody);

      if (player) {
        this.playerSprite ??= this.add.circle(player.x, player.y, PLAYER_RADIUS, 0x0066cc, 1);
        this.playerSprite.setPosition(player.x, player.y);
        this.playerSprite.setFillStyle(player.hp <= 25 ? 0xb30c00 : 0x0066cc, 1);
        this.playerSprite.setStrokeStyle(2, 0xffffff, 0.95);
      } else if (this.playerSprite) {
        this.playerSprite.destroy();
        this.playerSprite = undefined;
      }

      syncCircleRecord({
        record: state.enemyBody,
        sprites: this.enemySprites,
        create: (enemy) => this.add.circle(enemy.x, enemy.y, ENEMY_RADIUS, 0x1d1d1f, 1),
        update: (sprite, enemy) => {
          const health = findEnemyHealth(state, enemy.entityId);
          const healthRate = health ? health.current / health.max : 0;
          sprite.setPosition(enemy.x, enemy.y);
          sprite.setFillStyle(healthRate > 0.5 ? 0x1d1d1f : 0x7a7a7a, 1);
          sprite.setStrokeStyle(2, 0xe0e0e0, 0.85);
          sprite.setScale(0.88 + healthRate * 0.28);
        },
      });

      syncCircleRecord({
        record: state.projectileBody,
        sprites: this.projectileSprites,
        create: (projectile) => this.add.circle(projectile.x, projectile.y, PROJECTILE_RADIUS, 0x0071e3, 1),
        update: (sprite, projectile) => {
          sprite.setPosition(projectile.x, projectile.y);
          sprite.setFillStyle(0x0071e3, Math.max(0.35, projectile.ttl / 1.5));
        },
      });

      const session = state.gameSession.context;
      const spawnInterval = Math.round(state.enemySpawner.context.interval);
      const hp = player ? `${Math.ceil(player.hp)}/${player.maxHp}` : "0/100";
      const groupsLine = Object.entries(GROUP_TEMPLATES)
        .map(([tag, templates]) => `${tag} ×${countGroup(state, templates)}`)
        .join(" · ");
      const actorsLine = ACTOR_TEMPLATES.map((key) => `${key} ${countActors(state, key)}`).join(" · ");
      const hint =
        session.status === "game-over"
          ? "GAME OVER: обновите страницу, чтобы начать заново"
          : this.isPaused
            ? "ПАУЗА — нажмите ESC, чтобы продолжить"
            : "WASD / стрелки: движение, стрельба автоматическая   |   ESC: пауза";
      this.hud?.setText(
        [
          "lite-fsm actors + groupTag",
          `HP ${hp} · kills ${session.kills} · shots ${session.shots} · hits ${session.hits} · spawn ${spawnInterval}ms`,
          `groups · ${groupsLine}`,
          `actors · ${actorsLine}`,
          hint,
        ].join("\n"),
      );
    }
  };
}

export function Game() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<AppStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let game: GameLike | undefined;

    const mountGame = async () => {
      if (!containerRef.current) return;

      try {
        const Phaser = (await import("phaser")) as PhaserApi;
        if (disposed || !containerRef.current) return;

        const dpr = Math.max(1, window.devicePixelRatio || 1);

        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: containerRef.current,
          width: WORLD.width * dpr,
          height: WORLD.height * dpr,
          backgroundColor: "#fafafc",
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          render: { antialias: true, pixelArt: false },
          scene: createRogueliteScene(Phaser, dpr, managerRef),
        }) as GameLike;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить Phaser");
      }
    };

    void mountGame();

    return () => {
      disposed = true;
      managerRef.current = null;
      game?.destroy(true);
    };
  }, []);

  const boostSpawnRate = () =>
    managerRef.current?.transition({ type: "BOOST_SPAWN_RATE", payload: { multiplier: 0.7 } });
  const resetSpawnRate = () =>
    managerRef.current?.transition({ type: "BOOST_SPAWN_RATE", payload: { reset: true } });

  return (
    <Card className="gap-0 rounded-lg bg-canvas py-0 ring-1 ring-hairline">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-6 pt-6">
        <div>
          <p className="text-caption-strong text-primary">Phaser + lite-fsm actors</p>
          <h2 className="text-tagline text-ink">Враги, снаряды, игрок — actor-группы</h2>
        </div>
        <Badge variant="secondary" className="rounded-pill bg-canvas-parchment text-caption text-ink-muted-80">
          WASD · ESC
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 px-6 pb-6 pt-4">
        <div className="overflow-hidden rounded-md border border-hairline">
          <div ref={containerRef} className="aspect-[23/14] w-full" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={boostSpawnRate}
            className="h-auto rounded-pill bg-primary px-4 py-2 text-button-utility text-on-primary active:scale-[0.95]"
          >
            ускорить спавн ×1.43
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={resetSpawnRate}
            className="h-auto rounded-pill px-4 py-2 text-button-utility text-ink-muted-80 active:scale-[0.95]"
          >
            сбросить рейт
          </Button>
          <span className="text-caption text-ink-muted-48">
            рейт меняется через <code>BOOST_SPAWN_RATE</code> у <code>enemySpawner</code>
          </span>
        </div>

        {error ? <p className="text-caption text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
