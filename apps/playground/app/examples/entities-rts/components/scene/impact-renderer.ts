import type { ProjectileView } from "../../store/selectors";

import {
  HIT_SPARK_DEPTH,
  HIT_SPARK_LIFE_MS,
  HIT_SPARK_MAX_DIAMETER,
  IMPACT_FLASH_LIFE_MS,
  IMPACT_MIN_RADIUS,
  IMPACT_RING_DEPTH,
  IMPACT_RING_LIFE_MS,
  MAX_ACTIVE_EFFECTS,
  MAX_HIT_EVENTS_PER_FRAME,
  MAX_IMPACT_EVENTS_PER_FRAME,
  TEXTURES,
} from "./constants";
import type { PhaserImage, PhaserScene } from "./phaser-types";
import { pointIntersectsBounds, renderBoundsForScene, type RenderBounds } from "./viewport";

type SpriteEffect = {
  sprite: PhaserImage;
  textureKey: string;
  ageMs: number;
  lifeMs: number;
  startDiameter: number;
  endDiameter: number;
  startAlpha: number;
  spinRate: number;
};

type SpriteEffectSpawn = {
  textureKey: string;
  x: number;
  y: number;
  lifeMs: number;
  startDiameter: number;
  endDiameter: number;
  startAlpha: number;
  spinRate: number;
  depth: number;
};

// Эффекты попадания: расширяющееся кольцо и вспышка в центре AOE плюс короткая
// искра на каждом задетом враге. События сливаются из пула снарядов раз в кадр,
// спрайты переиспользуются через пул по текстуре, число и время жизни ограничены.
export class ImpactEffectRenderer {
  private readonly active: SpriteEffect[] = [];
  private readonly pools = new Map<string, PhaserImage[]>();

  constructor(private readonly scene: PhaserScene) {}

  reset() {
    for (const effect of this.active) effect.sprite.destroy();
    for (const pool of this.pools.values()) for (const sprite of pool) sprite.destroy();
    this.active.length = 0;
    this.pools.clear();
  }

  consume(projectiles: ProjectileView) {
    const bounds = renderBoundsForScene(this.scene);
    this.spawnImpacts(projectiles, bounds);
    this.spawnHits(projectiles, bounds);
    projectiles.clearEffectEvents();
  }

  update(deltaMs: number) {
    if (this.active.length === 0) return;

    const dt = Math.max(0, deltaMs);
    let index = 0;

    while (index < this.active.length) {
      const effect = this.active[index];
      effect.ageMs += dt;
      const t = effect.lifeMs > 0 ? Math.min(1, effect.ageMs / effect.lifeMs) : 1;

      if (t >= 1) {
        this.release(effect);
        const last = this.active.length - 1;
        this.active[index] = this.active[last];
        this.active.pop();
        continue;
      }

      const grow = 1 - (1 - t) * (1 - t) * (1 - t);
      const diameter = effect.startDiameter + (effect.endDiameter - effect.startDiameter) * grow;
      effect.sprite.setDisplaySize(diameter, diameter);
      effect.sprite.setAlpha(effect.startAlpha * (1 - t));
      if (effect.spinRate !== 0) effect.sprite.setRotation(effect.sprite.rotation + effect.spinRate * dt);
      index += 1;
    }
  }

  private spawnImpacts(projectiles: ProjectileView, bounds: RenderBounds) {
    const count = Math.min(projectiles.readImpactEventCount(), MAX_IMPACT_EVENTS_PER_FRAME);
    const x = projectiles.readImpactEventX();
    const y = projectiles.readImpactEventY();
    const radius = projectiles.readImpactEventRadius();

    for (let index = 0; index < count; index += 1) {
      const worldRadius = Math.max(IMPACT_MIN_RADIUS, radius[index]);
      if (!pointIntersectsBounds(x[index], y[index], worldRadius, bounds)) continue;

      this.spawn({
        textureKey: TEXTURES.impactRing,
        x: x[index],
        y: y[index],
        lifeMs: IMPACT_RING_LIFE_MS,
        startDiameter: worldRadius * 0.7,
        endDiameter: worldRadius * 2.3,
        startAlpha: 0.9,
        spinRate: 0,
        depth: IMPACT_RING_DEPTH,
      });
      this.spawn({
        textureKey: TEXTURES.impactGlow,
        x: x[index],
        y: y[index],
        lifeMs: IMPACT_FLASH_LIFE_MS,
        startDiameter: worldRadius * 0.5,
        endDiameter: worldRadius * 1.5,
        startAlpha: 0.85,
        spinRate: 0,
        depth: IMPACT_RING_DEPTH,
      });
    }
  }

  private spawnHits(projectiles: ProjectileView, bounds: RenderBounds) {
    const count = Math.min(projectiles.readHitEventCount(), MAX_HIT_EVENTS_PER_FRAME);
    const x = projectiles.readHitEventX();
    const y = projectiles.readHitEventY();

    for (let index = 0; index < count; index += 1) {
      if (!pointIntersectsBounds(x[index], y[index], HIT_SPARK_MAX_DIAMETER, bounds)) continue;

      const jitter = 0.8 + Math.random() * 0.5;
      this.spawn({
        textureKey: TEXTURES.impactGlow,
        x: x[index],
        y: y[index],
        lifeMs: HIT_SPARK_LIFE_MS,
        startDiameter: 8 * jitter,
        endDiameter: 30 * jitter,
        startAlpha: 0.9,
        spinRate: (Math.random() - 0.5) * 0.02,
        depth: HIT_SPARK_DEPTH,
      });
    }
  }

  private spawn(config: SpriteEffectSpawn) {
    if (this.active.length >= MAX_ACTIVE_EFFECTS) return;

    const sprite = this.acquire(config.textureKey);
    sprite.setPosition(config.x, config.y);
    sprite.setDepth(config.depth);
    sprite.setRotation(config.spinRate !== 0 ? Math.random() * Math.PI * 2 : 0);
    sprite.setAlpha(config.startAlpha);
    sprite.setDisplaySize(config.startDiameter, config.startDiameter);

    this.active.push({
      sprite,
      textureKey: config.textureKey,
      ageMs: 0,
      lifeMs: config.lifeMs,
      startDiameter: config.startDiameter,
      endDiameter: config.endDiameter,
      startAlpha: config.startAlpha,
      spinRate: config.spinRate,
    });
  }

  private acquire(textureKey: string) {
    const reused = this.pools.get(textureKey)?.pop();
    if (reused) return reused.setVisible(true);

    return this.scene.add.image(0, 0, textureKey).setOrigin(0.5, 0.5);
  }

  private release(effect: SpriteEffect) {
    effect.sprite.setVisible(false);
    const pool = this.pools.get(effect.textureKey);
    if (pool) pool.push(effect.sprite);
    else this.pools.set(effect.textureKey, [effect.sprite]);
  }
}
