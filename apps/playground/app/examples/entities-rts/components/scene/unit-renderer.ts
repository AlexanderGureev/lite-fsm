import type { EntityIndex } from "@lite-fsm/entities";

import type { AppStore } from "../../store";
import { isUnitAlive } from "../../store/machines/unit-health";
import { readUnitViews, unitSelected, type UnitViews } from "../../store/selectors";
import { UNIT_FACTION, UNIT_KIND, UNIT_SELECTION } from "../../store/unit-model";

import {
  ALLY_DOT_SCREEN_SIZE,
  DOT_MAX_WORLD_SIZE,
  DOT_MIN_WORLD_SIZE,
  ENEMY_DOT_SCREEN_SIZE,
  HP_BAR_BG_HEIGHT,
  HP_BAR_FILL_HEIGHT,
  HP_BAR_GAP,
  HP_BAR_HORIZONTAL_PADDING,
  HP_BAR_MIN_WIDTH,
  MAX_VISIBLE_ENEMY_DOTS,
  MAX_VISIBLE_ENEMY_SPRITES,
  MOVING_SPEED_THRESHOLD_SQUARED,
  SELECTION_DEPTH,
  SELECTION_PADDING,
  TEXTURES,
  UNIT_SPRITE_FADE_IN_MS,
  UNIT_SPRITE_FADE_OUT_MS,
} from "./constants";
import type { PhaserGraphics, PhaserImage, PhaserScene } from "./phaser-types";
import {
  animationFrameIndex,
  depthForKind,
  displaySizeForKind,
  spriteAnimForKind,
  spriteDisplaySize,
  textureForKind,
} from "./unit-kind";
import {
  clampValue,
  nextStableStride,
  pointIntersectsBounds,
  renderBoundsForScene,
  renderModeFor,
  visualStepSeconds,
  type RenderBounds,
  type RenderMode,
} from "./viewport";
import { UnitRenderDebugOverlay, type RenderDebugPoint, type RenderSyncStats } from "./unit-render-debug";

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

type HpBarView = {
  bg: PhaserImage;
  fill: PhaserImage;
};

type RenderPlan = {
  bounds: RenderBounds;
  mode: RenderMode;
  enemyStride: number;
  visibleEnemies: number;
};

export class UnitSpriteRenderer {
  private readonly sprites = new Map<number, UnitView>();
  private readonly spritePools = new Map<string, PhaserImage[]>();
  private readonly selected = new Map<number, PhaserImage>();
  private readonly hpBars = new Map<number, HpBarView>();
  private readonly liveEntities = new Set<number>();
  private readonly projectableEntities = new Set<number>();
  private readonly fadingEntities = new Set<number>();
  private readonly allyDots: PhaserGraphics;
  private readonly enemyDots: PhaserGraphics;
  private readonly debug: UnitRenderDebugOverlay;
  private loadingSyncCursor = 0;
  private dotLoadingCapacity = -1;
  private dotLoadingZoom = -1;
  private dotRenderPlan: RenderPlan | null = null;
  private dotProjectionSeconds = -1;
  private animTimeMs = 0;
  private enemyStride = 1;
  private allyDotWorldSize = 0;
  private enemyDotWorldSize = 0;

  constructor(
    private readonly scene: PhaserScene,
    private readonly manager: AppStore,
  ) {
    this.enemyDots = scene.add.graphics().setDepth(3).setVisible(false);
    this.allyDots = scene.add.graphics().setDepth(4).setVisible(false);
    this.debug = new UnitRenderDebugOverlay(scene);
  }

  reset() {
    for (const view of this.sprites.values()) view.sprite.destroy();
    for (const pool of this.spritePools.values()) for (const sprite of pool) sprite.destroy();
    for (const view of this.selected.values()) view.destroy();
    for (const view of this.hpBars.values()) {
      view.bg.destroy();
      view.fill.destroy();
    }
    this.allyDots.clear().setVisible(false);
    this.enemyDots.clear().setVisible(false);

    this.sprites.clear();
    this.spritePools.clear();
    this.selected.clear();
    this.hpBars.clear();
    this.liveEntities.clear();
    this.projectableEntities.clear();
    this.fadingEntities.clear();
    this.loadingSyncCursor = 0;
    this.dotLoadingCapacity = -1;
    this.dotLoadingZoom = -1;
    this.dotRenderPlan = null;
    this.dotProjectionSeconds = -1;
    this.debug.reset();
    this.enemyStride = 1;
  }

  setDebugMode(enabled: boolean) {
    this.debug.setEnabled(enabled, this.animTimeMs, this.enemyStride);
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

  private syncVisibleUnits(units: UnitViews, plan: RenderPlan) {
    this.prepareDotLayer(plan);
    this.dotRenderPlan = plan.mode === "dot" ? plan : null;
    this.dotProjectionSeconds = -1;
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
      if (!this.unitIntersectsBounds(units, entity, plan.bounds)) continue;

      const kind = units.identity.kind[entity];
      if (!this.unitShouldRender(units, entity, plan)) continue;

      if (plan.mode === "dot" && kind !== UNIT_KIND.HERO) {
        this.syncUnitDot(units, entity, kind, 0);
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

    this.clearDotLayer();
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
        this.unitIntersectsBounds(units, entity, plan.bounds) &&
        this.unitShouldRender(units, entity, plan) &&
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
    this.projectDotLayer(dt);
    this.updateFadingSprites();
    this.debug.update(this.animTimeMs, this.enemyStride);

    for (const key of this.projectableEntities) {
      const view = this.sprites.get(key);
      if (!view) continue;

      const x = view.x + view.vx * dt;
      const y = view.y + view.vy * dt;

      if (view.renderX !== x || view.renderY !== y) {
        view.renderX = x;
        view.renderY = y;
        view.sprite.setPosition(x, y);
        this.syncProjectedAttachments(key, view);
      }

      this.syncAnimation(view, key);
    }
  }

  private createRenderPlan(units: UnitViews): RenderPlan {
    const bounds = renderBoundsForScene(this.scene);
    const mode = renderModeFor(this.scene);
    const maxVisibleEnemies = mode === "dot" ? MAX_VISIBLE_ENEMY_DOTS : MAX_VISIBLE_ENEMY_SPRITES;
    let visibleEnemies = 0;

    for (let index = 0; index < units.capacity; index += 1) {
      const entity = index as EntityIndex;
      if (!isUnitAlive(units.health, entity)) continue;
      if (units.identity.faction[entity] !== UNIT_FACTION.ENEMY) continue;
      if (!this.unitIntersectsBounds(units, entity, bounds)) continue;

      visibleEnemies += 1;
    }

    this.enemyStride = nextStableStride(visibleEnemies, maxVisibleEnemies, this.enemyStride);

    return {
      bounds,
      mode,
      enemyStride: this.enemyStride,
      visibleEnemies,
    };
  }

  private prepareDotLayer(plan: RenderPlan) {
    if (plan.mode !== "dot") {
      this.clearDotLayer();
      return;
    }

    const zoom = Math.max(0.001, this.scene.cameras.main.zoom);
    this.allyDotWorldSize = clampValue(ALLY_DOT_SCREEN_SIZE / zoom, DOT_MIN_WORLD_SIZE, DOT_MAX_WORLD_SIZE);
    this.enemyDotWorldSize = clampValue(ENEMY_DOT_SCREEN_SIZE / zoom, DOT_MIN_WORLD_SIZE, DOT_MAX_WORLD_SIZE);

    this.allyDots.clear().setVisible(true);
    this.enemyDots.clear().setVisible(true);
    this.allyDots.fillStyle(0x8ff0ad, 0.82);
    this.enemyDots.fillStyle(0x9aa866, 0.76);
  }

  private clearDotLayer() {
    this.dotRenderPlan = null;
    this.dotProjectionSeconds = -1;
    this.allyDots.clear().setVisible(false);
    this.enemyDots.clear().setVisible(false);
  }

  private projectDotLayer(dt: number) {
    const plan = this.dotRenderPlan;
    if (!plan || this.dotProjectionSeconds === dt) return;

    const units = readUnitViews(this.manager);
    this.prepareDotLayer(plan);

    for (let index = 0; index < units.capacity; index += 1) {
      const entity = index as EntityIndex;
      if (!isUnitAlive(units.health, entity)) continue;

      const kind = units.identity.kind[entity];
      if (kind === UNIT_KIND.HERO) continue;
      if (!this.unitIntersectsBoundsAt(units, entity, plan.bounds, dt)) continue;
      if (!this.unitShouldRender(units, entity, plan)) continue;

      this.syncUnitDot(units, entity, kind, dt);
    }

    this.dotProjectionSeconds = dt;
  }

  private syncUnitDot(units: UnitViews, entity: EntityIndex, kind: number, dt: number) {
    const faction = units.identity.faction[entity];
    const graphics = faction === UNIT_FACTION.PLAYER ? this.allyDots : this.enemyDots;
    const size = faction === UNIT_FACTION.PLAYER ? this.allyDotWorldSize : this.enemyDotWorldSize;
    const half = size / 2;
    const x = units.movement.x[entity] + units.movement.vx[entity] * dt;
    const y = units.movement.y[entity] + units.movement.vy[entity] * dt;

    if (faction === UNIT_FACTION.PLAYER && unitSelected(units, entity) === UNIT_SELECTION.SELECTED) {
      graphics.fillStyle(0xe8f8ff, 0.92);
      graphics.fillRect(x - half, y - half, size, size);
      graphics.fillStyle(0x8ff0ad, 0.82);
      return;
    }

    const dotSize = kind === UNIT_KIND.ALLY ? size : Math.max(DOT_MIN_WORLD_SIZE, size);
    const dotHalf = dotSize / 2;
    graphics.fillRect(x - dotHalf, y - dotHalf, dotSize, dotSize);
  }

  private unitShouldRender(units: UnitViews, entity: EntityIndex, plan: RenderPlan) {
    if (plan.enemyStride <= 1 || units.identity.faction[entity] !== UNIT_FACTION.ENEMY) return true;

    const unitIndex = units.identity.unitIndex[entity];
    return unitIndex < 0 || unitIndex % plan.enemyStride === 0;
  }

  private unitIntersectsBounds(units: UnitViews, entity: EntityIndex, bounds: RenderBounds) {
    return this.unitIntersectsBoundsAt(units, entity, bounds, 0);
  }

  private unitIntersectsBoundsAt(units: UnitViews, entity: EntityIndex, bounds: RenderBounds, dt: number) {
    const x = units.movement.x[entity];
    const y = units.movement.y[entity];
    const radius = displaySizeForKind(units.identity.kind[entity]) * 0.5;

    return pointIntersectsBounds(
      x + units.movement.vx[entity] * dt,
      y + units.movement.vy[entity] * dt,
      radius,
      bounds,
    );
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
    this.syncSelection(entity, view, size, kind, selected);
    this.syncHpBar(entity, view, size, kind, hpRate);
    this.syncProjectionMembership(key, view);
  }

  private createUnitView(key: number, units: UnitViews, entity: EntityIndex, kind: number, texture: string) {
    const x = units.movement.x[entity];
    const y = units.movement.y[entity];
    const display = spriteDisplaySize(kind);
    const sprite = this.acquireSprite(texture, kind, x, y);
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

  private acquireSprite(texture: string, kind: number, x: number, y: number) {
    const pooled = this.spritePools.get(texture)?.pop();
    const sprite = pooled ?? this.scene.add.image(x, y, texture, 0).setOrigin(0.5, 0.5);

    sprite
      .setVisible(true)
      .setTexture(texture, 0)
      .setPosition(x, y)
      .setDepth(depthForKind(kind))
      .setAlpha(1)
      .clearTint();

    return sprite;
  }

  private releaseSprite(view: UnitView) {
    const texture = textureForKind(view.kind);
    view.sprite.setVisible(false);

    const pool = this.spritePools.get(texture);
    if (pool) pool.push(view.sprite);
    else this.spritePools.set(texture, [view.sprite]);
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

  private syncSelection(entity: EntityIndex, view: UnitView, size: number, kind: number, selected: number) {
    const key = Number(entity);
    const shouldShow = selected === UNIT_SELECTION.SELECTED || kind === UNIT_KIND.HERO;

    if (!shouldShow) {
      const stale = this.selected.get(key);
      if (stale) {
        stale.destroy();
        this.selected.delete(key);
      }
      return;
    }

    const highlight =
      this.selected.get(key) ??
      this.scene.add.image(view.renderX, view.renderY, TEXTURES.selected).setOrigin(0.5, 0.5).setDepth(SELECTION_DEPTH);

    this.selected.set(key, highlight);
    highlight.setPosition(view.renderX, view.renderY);
    highlight.setDisplaySize(spriteDisplaySize(kind).width + SELECTION_PADDING, size + SELECTION_PADDING);
    highlight.setAlpha(selected === UNIT_SELECTION.SELECTED ? 0.9 : 0.34);
  }

  private syncHpBar(entity: EntityIndex, view: UnitView, size: number, kind: number, hpRate: number) {
    const key = Number(entity);
    const shouldShow = kind === UNIT_KIND.HERO || hpRate < 1;

    if (!shouldShow) {
      const stale = this.hpBars.get(key);
      if (stale) {
        stale.bg.destroy();
        stale.fill.destroy();
        this.hpBars.delete(key);
      }
      return;
    }

    const width = Math.max(HP_BAR_MIN_WIDTH, spriteDisplaySize(kind).width);
    const y = view.renderY - size / 2 - HP_BAR_GAP;
    const bar =
      this.hpBars.get(key) ??
      ({
        bg: this.scene.add.image(view.renderX, y, TEXTURES.hpBg).setOrigin(0.5, 0.5).setDepth(8),
        fill: this.scene.add
          .image(view.renderX - width / 2, y, TEXTURES.hpFill)
          .setOrigin(0, 0.5)
          .setDepth(9),
      } satisfies HpBarView);

    this.hpBars.set(key, bar);
    bar.bg.setPosition(view.renderX, y);
    bar.bg.setDisplaySize(width + HP_BAR_HORIZONTAL_PADDING, HP_BAR_BG_HEIGHT);
    bar.fill.setPosition(view.renderX - width / 2, y);
    bar.fill.setDisplaySize(Math.max(1, width * hpRate), HP_BAR_FILL_HEIGHT);
  }

  private syncProjectedAttachments(key: number, view: UnitView) {
    const selected = this.selected.get(key);
    if (selected) selected.setPosition(view.renderX, view.renderY);

    const bar = this.hpBars.get(key);
    if (!bar) return;

    const size = displaySizeForKind(view.kind);
    const width = Math.max(HP_BAR_MIN_WIDTH, spriteDisplaySize(view.kind).width);
    const y = view.renderY - size / 2 - HP_BAR_GAP;
    bar.bg.setPosition(view.renderX, y);
    bar.fill.setPosition(view.renderX - width / 2, y);
  }

  private syncProjectionMembership(key: number, view: UnitView) {
    const moving = view.vx * view.vx + view.vy * view.vy > MOVING_SPEED_THRESHOLD_SQUARED;
    const hasAttachment = this.selected.has(key) || this.hpBars.has(key);

    if (moving || hasAttachment) {
      this.projectableEntities.add(key);
      return;
    }

    this.projectableEntities.delete(key);
    if (view.renderX === view.x && view.renderY === view.y) return;

    view.renderX = view.x;
    view.renderY = view.y;
    view.sprite.setPosition(view.x, view.y);
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

    for (const [key, view] of this.selected) {
      if (this.liveEntities.has(key)) continue;
      view.destroy();
      this.selected.delete(key);
    }

    for (const [key, view] of this.hpBars) {
      if (this.liveEntities.has(key)) continue;
      view.bg.destroy();
      view.fill.destroy();
      this.hpBars.delete(key);
    }

    return exited;
  }
}
