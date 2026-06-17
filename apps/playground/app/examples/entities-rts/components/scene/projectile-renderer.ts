import type { AppStore } from "../../store";
import { readProjectileView } from "../../store/selectors";

import {
  DOT_MAX_WORLD_SIZE,
  DOT_MIN_WORLD_SIZE,
  MAX_VISIBLE_PROJECTILE_DOTS,
  MAX_VISIBLE_PROJECTILE_SPRITES,
  PROJECTILE_DOT_SCREEN_SIZE,
  PROJECTILE_RENDER_RADIUS,
  TEXTURES,
} from "./constants";
import type { PhaserGraphics, PhaserImage, PhaserScene } from "./phaser-types";
import {
  clampValue,
  nextStableStride,
  pointIntersectsBounds,
  renderBoundsForScene,
  renderModeFor,
  visualStepSeconds,
  type RenderBounds,
} from "./viewport";

type ProjectileSpriteView = {
  sprite: PhaserImage;
  x: number;
  y: number;
  renderX: number;
  renderY: number;
  vx: number;
  vy: number;
  rotation: number;
  radius: number;
};

export class ProjectileSpriteRenderer {
  private readonly sprites = new Map<number, ProjectileSpriteView>();
  private readonly spritePool: PhaserImage[] = [];
  private readonly liveProjectiles = new Set<number>();
  private readonly projectileDots: PhaserGraphics;
  private projectileSpriteStride = 1;
  private projectileDotStride = 1;

  constructor(
    private readonly scene: PhaserScene,
    private readonly manager: AppStore,
  ) {
    this.projectileDots = scene.add.graphics().setDepth(6).setVisible(false);
  }

  reset() {
    for (const view of this.sprites.values()) view.sprite.destroy();
    for (const sprite of this.spritePool) sprite.destroy();
    this.projectileDots.clear().setVisible(false);
    this.sprites.clear();
    this.spritePool.length = 0;
    this.liveProjectiles.clear();
    this.projectileSpriteStride = 1;
    this.projectileDotStride = 1;
  }

  sync() {
    const projectiles = readProjectileView(this.manager);
    const count = projectiles.readCount();
    const bounds = renderBoundsForScene(this.scene);
    const x = projectiles.readX();
    const y = projectiles.readY();
    const vx = projectiles.readVx();
    const vy = projectiles.readVy();
    const radius = projectiles.readRadius();
    const dotMode = renderModeFor(this.scene) === "dot";
    const visibleProjectiles = this.countVisibleProjectiles(count, x, y, radius, bounds);

    if (dotMode) {
      this.projectileDotStride = nextStableStride(
        visibleProjectiles,
        MAX_VISIBLE_PROJECTILE_DOTS,
        this.projectileDotStride,
      );
      this.syncProjectileDots(count, x, y, radius, bounds);
      this.liveProjectiles.clear();
      this.cleanupMissing();
      return;
    }

    this.projectileDots.clear().setVisible(false);
    this.projectileSpriteStride = nextStableStride(
      visibleProjectiles,
      MAX_VISIBLE_PROJECTILE_SPRITES,
      this.projectileSpriteStride,
    );
    this.liveProjectiles.clear();

    for (let index = 0; index < count; index += 1) {
      const projectileRadius = Math.max(PROJECTILE_RENDER_RADIUS, radius[index] * 1.6);
      if (!pointIntersectsBounds(x[index], y[index], projectileRadius, bounds)) continue;
      if (this.projectileSpriteStride > 1 && index % this.projectileSpriteStride !== 0) continue;

      this.liveProjectiles.add(index);
      this.syncProjectile(index, x, y, vx, vy, projectileRadius);
    }

    this.cleanupMissing();
  }

  private countVisibleProjectiles(
    count: number,
    x: Float32Array,
    y: Float32Array,
    radius: Float32Array,
    bounds: RenderBounds,
  ) {
    let visible = 0;

    for (let index = 0; index < count; index += 1) {
      const projectileRadius = Math.max(PROJECTILE_RENDER_RADIUS, radius[index] * 1.6);
      if (pointIntersectsBounds(x[index], y[index], projectileRadius, bounds)) visible += 1;
    }

    return visible;
  }

  private syncProjectileDots(
    count: number,
    x: Float32Array,
    y: Float32Array,
    radius: Float32Array,
    bounds: RenderBounds,
  ) {
    const zoom = Math.max(0.001, this.scene.cameras.main.zoom);
    const dotSize = clampValue(PROJECTILE_DOT_SCREEN_SIZE / zoom, DOT_MIN_WORLD_SIZE, DOT_MAX_WORLD_SIZE);
    const half = dotSize / 2;

    this.projectileDots.clear().setVisible(true).fillStyle(0xcffff0, 0.9);

    for (let index = 0; index < count; index += 1) {
      const projectileRadius = Math.max(PROJECTILE_RENDER_RADIUS, radius[index] * 1.6);
      if (!pointIntersectsBounds(x[index], y[index], projectileRadius, bounds)) continue;
      if (this.projectileDotStride > 1 && index % this.projectileDotStride !== 0) continue;

      this.projectileDots.fillRect(x[index] - half, y[index] - half, dotSize, dotSize);
    }
  }

  project(extrapolationMs: number) {
    const dt = visualStepSeconds(extrapolationMs);

    for (const view of this.sprites.values()) {
      const x = view.x + view.vx * dt;
      const y = view.y + view.vy * dt;

      if (view.renderX === x && view.renderY === y) continue;

      view.renderX = x;
      view.renderY = y;
      view.sprite.setPosition(x, y);
    }
  }

  private syncProjectile(
    index: number,
    x: Float32Array,
    y: Float32Array,
    vx: Float32Array,
    vy: Float32Array,
    radius: number,
  ) {
    const rotation = Math.atan2(vy[index], vx[index]);
    const view = this.sprites.get(index) ?? this.createProjectileView(index, x[index], y[index], radius, rotation);

    if (view.x !== x[index] || view.y !== y[index]) {
      view.x = x[index];
      view.y = y[index];
    }

    if (view.vx !== vx[index] || view.vy !== vy[index]) {
      view.vx = vx[index];
      view.vy = vy[index];
    }

    if (view.rotation !== rotation) {
      view.rotation = rotation;
      view.sprite.setRotation(rotation);
    }

    if (view.radius !== radius) {
      view.radius = radius;
      view.sprite.setDisplaySize(radius * 2, radius * 2);
    }
  }

  private createProjectileView(index: number, x: number, y: number, radius: number, rotation: number) {
    const sprite =
      this.spritePool.pop() ??
      this.scene.add.image(x, y, TEXTURES.projectile).setOrigin(0.5, 0.5).setDepth(6).setRotation(rotation);

    sprite
      .setVisible(true)
      .setPosition(x, y)
      .setDepth(6)
      .setDisplaySize(radius * 2, radius * 2)
      .setRotation(rotation);

    const view: ProjectileSpriteView = {
      radius,
      renderX: x,
      renderY: y,
      rotation,
      sprite,
      vx: 0,
      vy: 0,
      x,
      y,
    };

    this.sprites.set(index, view);
    return view;
  }

  private cleanupMissing() {
    for (const [key, view] of this.sprites) {
      if (this.liveProjectiles.has(key)) continue;
      view.sprite.setVisible(false);
      this.spritePool.push(view.sprite);
      this.sprites.delete(key);
    }
  }
}
