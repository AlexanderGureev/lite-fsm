import type { EntityIndex } from "@lite-fsm/entities";

import type { AppStore } from "../../store";
import { isUnitAlive } from "../../store/machines/unit-health";
import { readUnitViews, unitSelected, type UnitViews } from "../../store/selectors";
import { UNIT_KIND } from "../../store/unit-model";

import {
  MOVING_SPEED_THRESHOLD_SQUARED,
  UNIT_SPRITE_FADE_IN_MS,
  UNIT_SPRITE_FADE_OUT_MS,
} from "./constants";
import type { PhaserImage, PhaserScene } from "./phaser-types";
import {
  animationFrameIndex,
  depthForKind,
  displaySizeForKind,
  spriteAnimForKind,
  spriteDisplaySize,
  textureForKind,
} from "./unit-kind";
import { clampValue, visualStepSeconds } from "./viewport";
import { UnitAttachments } from "./unit-attachments";
import { UnitDotRenderer } from "./unit-dot-renderer";
import {
  createUnitRenderPlan,
  unitIntersectsBounds,
  unitShouldRender,
  type UnitRenderPlan,
} from "./unit-render-plan";
import { UnitRenderDebugOverlay, type RenderDebugPoint, type RenderSyncStats } from "./unit-render-debug";
import { projectUnitView, resetProjectedUnitView } from "./unit-projection";
import { UnitSpritePool } from "./unit-sprite-pool";

type UnitVisibilityPhase = "entering" | "visible" | "exiting";

type UnitView = {
  sprite: PhaserImage;
  x: number;
  y: number;
  renderX: number;
  renderY: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  hpRate: number;
  baseAlpha: number;
  visibilityAlpha: number;
  visibilityPhase: UnitVisibilityPhase;
  fadeStartedAtMs: number;
  fadeStartAlpha: number;
  kind: number;
  frame: number;
};

export class UnitSpriteRenderer {
  private readonly sprites = new Map<number, UnitView>();
  private readonly spritePool: UnitSpritePool;
  private readonly attachments: UnitAttachments;
  private readonly dotRenderer: UnitDotRenderer;
  private readonly liveEntities = new Set<number>();
  private readonly projectableEntities = new Set<number>();
  private readonly fadingEntities = new Set<number>();
  private readonly debug: UnitRenderDebugOverlay;
  private loadingSyncCursor = 0;
  private dotLoadingCapacity = -1;
  private dotLoadingZoom = -1;
  private animTimeMs = 0;
  private enemyStride = 1;
  private renderLodDisabled = false;

  constructor(
    private readonly scene: PhaserScene,
    private readonly manager: AppStore,
  ) {
    this.spritePool = new UnitSpritePool(scene);
    this.attachments = new UnitAttachments(scene);
    this.dotRenderer = new UnitDotRenderer(scene);
    this.debug = new UnitRenderDebugOverlay(scene);
  }

  reset() {
    for (const view of this.sprites.values()) view.sprite.destroy();

    this.sprites.clear();
    this.spritePool.reset();
    this.attachments.reset();
    this.dotRenderer.reset();
    this.liveEntities.clear();
    this.projectableEntities.clear();
    this.fadingEntities.clear();
    this.loadingSyncCursor = 0;
    this.dotLoadingCapacity = -1;
    this.dotLoadingZoom = -1;
    this.debug.reset();
    this.enemyStride = 1;
  }

  setDebugMode(enabled: boolean) {
    this.debug.setEnabled(enabled, this.animTimeMs, this.enemyStride);
  }

  setRenderLodDisabled(disabled: boolean) {
    this.renderLodDisabled = disabled;
    if (!disabled) return;

    this.enemyStride = 1;
    this.dotLoadingCapacity = -1;
    this.dotLoadingZoom = -1;
    this.dotRenderer.clear();
  }

  sync() {
    const units = readUnitViews(this.manager);
    const plan = this.createRenderPlan(units);
    this.animTimeMs = this.scene.time.now;
    this.liveEntities.clear();
    this.loadingSyncCursor = units.capacity;
    this.dotLoadingCapacity = plan.mode === "dot" ? units.capacity : -1;
    this.dotLoadingZoom = plan.mode === "dot" ? this.scene.cameras.main.zoom : -1;
    this.syncVisibleUnits(units, plan);
  }

  private syncVisibleUnits(units: UnitViews, plan: UnitRenderPlan) {
    this.dotRenderer.begin(plan);
    const stats: RenderSyncStats = {
      debugPoints: [],
      dotUnits: 0,
      entered: 0,
      exited: 0,
      spriteUnits: 0,
    };

    for (let index = 0; index < units.capacity; index += 1) {
      const entity = index as EntityIndex;
      if (!isUnitAlive(units.health, entity)) continue;
      if (!unitIntersectsBounds(units, entity, plan.bounds)) continue;

      const kind = units.identity.kind[entity];
      if (!unitShouldRender(units, entity, plan)) continue;

      if (plan.mode === "dot" && kind !== UNIT_KIND.HERO) {
        this.dotRenderer.syncUnit(units, entity, kind, 0);
        stats.dotUnits += 1;
        continue;
      }

      const existing = this.sprites.get(index);
      if (!existing || existing.visibilityPhase === "exiting") {
        stats.entered += 1;
        this.debug.pushPoint(stats.debugPoints, units.movement.x[entity], units.movement.y[entity], "enter");
      }

      this.liveEntities.add(index);
      this.syncUnit(units, entity);
      stats.spriteUnits += 1;
    }

    stats.exited = this.cleanupMissing(stats.debugPoints);
    this.debug.recordSync(plan, stats, this.animTimeMs);
  }

  syncLoading(maxCreates: number) {
    const units = readUnitViews(this.manager);
    const plan = this.createRenderPlan(units);
    this.animTimeMs = this.scene.time.now;
    if (plan.mode === "dot") {
      const zoom = this.scene.cameras.main.zoom;
      const shouldSyncDots =
        this.dotLoadingCapacity !== units.capacity ||
        Math.abs(this.dotLoadingZoom - zoom) > 0.001 ||
        this.sprites.size > 1;

      if (shouldSyncDots) {
        this.liveEntities.clear();
        this.syncVisibleUnits(units, plan);
        this.dotLoadingCapacity = units.capacity;
        this.dotLoadingZoom = zoom;
      }

      this.loadingSyncCursor = units.capacity;
      return;
    }

    this.dotRenderer.clear();
    this.dotLoadingCapacity = -1;
    this.dotLoadingZoom = -1;
    const capacity = units.capacity;
    let created = 0;
    let index = Math.min(this.loadingSyncCursor, capacity);

    while (index < capacity && created < maxCreates) {
      const entity = index as EntityIndex;
      const kind = units.identity.kind[entity];
      const shouldCreate =
        isUnitAlive(units.health, entity) &&
        unitIntersectsBounds(units, entity, plan.bounds) &&
        unitShouldRender(units, entity, plan) &&
        !this.sprites.has(index);

      if (shouldCreate) {
        const existing = this.sprites.get(index);
        if (!existing || existing.visibilityPhase === "exiting") {
          this.debug.recordSync(
            plan,
            {
              debugPoints: [{ kind: "enter", x: units.movement.x[entity], y: units.movement.y[entity] }],
              dotUnits: 0,
              entered: 1,
              exited: 0,
              spriteUnits: 1,
            },
            this.animTimeMs,
          );
        }
        this.syncUnit(units, entity);
        created += 1;
      }

      index += 1;
    }

    this.loadingSyncCursor = index;
  }

  project(extrapolationMs: number) {
    const dt = visualStepSeconds(extrapolationMs);
    this.animTimeMs = this.scene.time.now;
    this.dotRenderer.project(readUnitViews(this.manager), dt);
    this.updateFadingSprites();
    this.debug.update(this.animTimeMs, this.enemyStride);

    for (const key of this.projectableEntities) {
      const view = this.sprites.get(key);
      if (!view) continue;

      if (projectUnitView(view, dt)) {
        this.syncProjectedAttachments(key, view);
      }

      this.syncAnimation(view, key);
    }
  }

  private createRenderPlan(units: UnitViews): UnitRenderPlan {
    const plan = createUnitRenderPlan(this.scene, units, {
      lodDisabled: this.renderLodDisabled,
      previousEnemyStride: this.enemyStride,
    });
    this.enemyStride = plan.enemyStride;
    return plan;
  }

  private syncUnit(units: UnitViews, entity: EntityIndex) {
    const key = Number(entity);
    const kind = units.identity.kind[entity];
    const size = displaySizeForKind(kind);
    const texture = textureForKind(kind);
    const x = units.movement.x[entity];
    const y = units.movement.y[entity];
    const vx = units.movement.vx[entity];
    const vy = units.movement.vy[entity];
    const view = this.sprites.get(key) ?? this.createUnitView(key, units, entity, kind, texture);
    const hp = units.health.hp[entity];
    const maxHp = units.health.maxHp[entity];
    let hpRate = view.hpRate;

    this.ensureVisibleSprite(key, view);

    if (view.x !== x || view.y !== y || view.vx !== vx || view.vy !== vy) {
      view.x = x;
      view.y = y;
      view.vx = vx;
      view.vy = vy;
    }

    if (view.kind !== kind) {
      const display = spriteDisplaySize(kind);
      view.kind = kind;
      view.frame = 0;
      view.sprite.setTexture(texture, 0);
      view.sprite.setDepth(depthForKind(kind));
      view.sprite.setDisplaySize(display.width, display.height);
    }

    if (view.hp !== hp || view.maxHp !== maxHp) {
      view.hp = hp;
      view.maxHp = maxHp;
      hpRate = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    }

    if (view.hpRate !== hpRate) {
      view.hpRate = hpRate;
      view.baseAlpha = 0.74 + hpRate * 0.26;
      this.syncSpriteAlpha(view);

      if (kind === UNIT_KIND.ENEMY && hpRate < 0.5) {
        view.sprite.setTint(0xffc05b);
      } else if (kind === UNIT_KIND.HERO && hpRate < 0.25) {
        view.sprite.setTint(0xff786b);
      } else {
        view.sprite.clearTint();
      }
    }

    this.syncAnimation(view, key);

    if (kind === UNIT_KIND.ENEMY && hpRate >= 1) {
      this.syncProjectionMembership(key, view);
      return;
    }

    const selected = unitSelected(units, entity);
    this.attachments.syncSelection(entity, view.renderX, view.renderY, size, kind, selected);
    this.attachments.syncHpBar(entity, view.renderX, view.renderY, size, kind, hpRate);
    this.syncProjectionMembership(key, view);
  }

  private createUnitView(key: number, units: UnitViews, entity: EntityIndex, kind: number, texture: string) {
    const x = units.movement.x[entity];
    const y = units.movement.y[entity];
    const display = spriteDisplaySize(kind);
    const sprite = this.spritePool.acquire(texture, kind, x, y);
    const view: UnitView = {
      baseAlpha: 1,
      fadeStartAlpha: 0,
      fadeStartedAtMs: this.animTimeMs,
      frame: 0,
      hp: -1,
      hpRate: -1,
      kind,
      maxHp: -1,
      renderX: x,
      renderY: y,
      sprite: sprite.setDisplaySize(display.width, display.height),
      vx: units.movement.vx[entity],
      vy: units.movement.vy[entity],
      visibilityAlpha: 0,
      visibilityPhase: "entering",
      x,
      y,
    };

    this.sprites.set(key, view);
    this.fadingEntities.add(key);
    this.syncSpriteAlpha(view);
    return view;
  }

  private releaseSprite(view: UnitView) {
    this.spritePool.release(view.kind, view.sprite);
  }

  private ensureVisibleSprite(key: number, view: UnitView) {
    if (view.visibilityPhase === "visible") return;
    if (view.visibilityPhase === "entering") return;

    view.visibilityPhase = "entering";
    view.fadeStartedAtMs = this.animTimeMs;
    view.fadeStartAlpha = view.visibilityAlpha;
    this.fadingEntities.add(key);
    this.syncSpriteAlpha(view);
  }

  private beginSpriteExit(key: number, view: UnitView) {
    if (view.visibilityPhase === "exiting") return;

    view.visibilityPhase = "exiting";
    view.fadeStartedAtMs = this.animTimeMs;
    view.fadeStartAlpha = view.visibilityAlpha;
    this.fadingEntities.add(key);
    this.syncSpriteAlpha(view);
  }

  private updateFadingSprites() {
    for (const key of this.fadingEntities) {
      const view = this.sprites.get(key);
      if (!view) {
        this.fadingEntities.delete(key);
        continue;
      }

      if (view.visibilityPhase === "visible") {
        this.fadingEntities.delete(key);
        continue;
      }

      const duration = view.visibilityPhase === "exiting" ? UNIT_SPRITE_FADE_OUT_MS : UNIT_SPRITE_FADE_IN_MS;
      const progress = duration <= 0 ? 1 : clampValue((this.animTimeMs - view.fadeStartedAtMs) / duration, 0, 1);
      const easedProgress = progress * (2 - progress);
      const targetAlpha = view.visibilityPhase === "exiting" ? 0 : 1;

      view.visibilityAlpha = view.fadeStartAlpha + (targetAlpha - view.fadeStartAlpha) * easedProgress;
      this.syncSpriteAlpha(view);

      if (progress < 1) continue;

      if (view.visibilityPhase === "exiting") {
        this.releaseSpriteView(key, view);
        continue;
      }

      view.visibilityAlpha = 1;
      view.visibilityPhase = "visible";
      this.fadingEntities.delete(key);
      this.syncSpriteAlpha(view);
    }
  }

  private syncSpriteAlpha(view: UnitView) {
    view.sprite.setAlpha(view.baseAlpha * view.visibilityAlpha);
  }

  private releaseSpriteView(key: number, view: UnitView) {
    this.releaseSprite(view);
    this.sprites.delete(key);
    this.projectableEntities.delete(key);
    this.fadingEntities.delete(key);
  }

  private syncAnimation(view: UnitView, key: number) {
    const anim = spriteAnimForKind(view.kind);
    const moving = view.vx * view.vx + view.vy * view.vy > MOVING_SPEED_THRESHOLD_SQUARED;
    const frame = moving
      ? animationFrameIndex(this.animTimeMs, anim.frameDurationMs, anim.frameCount, key % anim.frameCount)
      : 0;

    if (view.frame === frame) return;
    view.frame = frame;
    view.sprite.setFrame(frame);
  }

  private syncProjectedAttachments(key: number, view: UnitView) {
    this.attachments.syncProjected(key, view.renderX, view.renderY, view.kind);
  }

  private syncProjectionMembership(key: number, view: UnitView) {
    const moving = view.vx * view.vx + view.vy * view.vy > MOVING_SPEED_THRESHOLD_SQUARED;

    if (moving || this.attachments.has(key)) {
      this.projectableEntities.add(key);
      return;
    }

    this.projectableEntities.delete(key);
    resetProjectedUnitView(view);
  }

  private cleanupMissing(debugPoints: RenderDebugPoint[] = []) {
    let exited = 0;
    for (const [key, view] of this.sprites) {
      if (this.liveEntities.has(key)) continue;
      if (view.visibilityPhase !== "exiting") {
        exited += 1;
        this.debug.pushPoint(debugPoints, view.renderX, view.renderY, "exit");
      }
      this.beginSpriteExit(key, view);
    }

    this.attachments.cleanupMissing(this.liveEntities);

    return exited;
  }
}
