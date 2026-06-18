import type { EntityIndex } from "@lite-fsm/entities";

import { isUnitAlive } from "../../store/machines/unit-health";
import { unitSelected, type UnitViews } from "../../store/selectors";
import { UNIT_FACTION, UNIT_KIND, UNIT_SELECTION } from "../../store/unit-model";

import {
  ALLY_DOT_SCREEN_SIZE,
  DOT_MAX_WORLD_SIZE,
  DOT_MIN_WORLD_SIZE,
  ENEMY_DOT_SCREEN_SIZE,
} from "./constants";
import type { PhaserGraphics, PhaserScene } from "./phaser-types";
import { clampValue } from "./viewport";
import {
  unitIntersectsBoundsAt,
  unitShouldRender,
  type UnitRenderPlan,
} from "./unit-render-plan";

export class UnitDotRenderer {
  private readonly allyDots: PhaserGraphics;
  private readonly enemyDots: PhaserGraphics;
  private renderPlan: UnitRenderPlan | null = null;
  private projectionSeconds = -1;
  private allyDotWorldSize = 0;
  private enemyDotWorldSize = 0;

  constructor(private readonly scene: PhaserScene) {
    this.enemyDots = scene.add.graphics().setDepth(3).setVisible(false);
    this.allyDots = scene.add.graphics().setDepth(4).setVisible(false);
  }

  reset() {
    this.clear();
  }

  begin(plan: UnitRenderPlan) {
    if (plan.mode !== "dot") {
      this.clear();
      return;
    }

    this.prepare();
    this.renderPlan = plan;
    this.projectionSeconds = -1;
  }

  clear() {
    this.renderPlan = null;
    this.projectionSeconds = -1;
    this.allyDots.clear().setVisible(false);
    this.enemyDots.clear().setVisible(false);
  }

  syncUnit(units: UnitViews, entity: EntityIndex, kind: number, dt: number) {
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

  project(units: UnitViews, dt: number) {
    const plan = this.renderPlan;
    if (!plan || this.projectionSeconds === dt) return;

    this.prepare();

    for (let index = 0; index < units.capacity; index += 1) {
      const entity = index as EntityIndex;
      if (!isUnitAlive(units.health, entity)) continue;

      const kind = units.identity.kind[entity];
      if (kind === UNIT_KIND.HERO) continue;
      if (!unitIntersectsBoundsAt(units, entity, plan.bounds, dt)) continue;
      if (!unitShouldRender(units, entity, plan)) continue;

      this.syncUnit(units, entity, kind, dt);
    }

    this.projectionSeconds = dt;
  }

  private prepare() {
    const zoom = Math.max(0.001, this.scene.cameras.main.zoom);
    this.allyDotWorldSize = clampValue(ALLY_DOT_SCREEN_SIZE / zoom, DOT_MIN_WORLD_SIZE, DOT_MAX_WORLD_SIZE);
    this.enemyDotWorldSize = clampValue(ENEMY_DOT_SCREEN_SIZE / zoom, DOT_MIN_WORLD_SIZE, DOT_MAX_WORLD_SIZE);

    this.allyDots.clear().setVisible(true);
    this.enemyDots.clear().setVisible(true);
    this.allyDots.fillStyle(0x8ff0ad, 0.82);
    this.enemyDots.fillStyle(0x9aa866, 0.76);
  }
}
