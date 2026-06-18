import type { EntityIndex } from "@lite-fsm/entities";

import { isUnitAlive } from "../../store/machines/unit-health";
import type { UnitViews } from "../../store/selectors";
import { UNIT_FACTION } from "../../store/unit-model";

import {
  MAX_VISIBLE_ENEMY_DOTS,
  MAX_VISIBLE_ENEMY_SPRITES,
} from "./constants";
import type { PhaserScene } from "./phaser-types";
import { displaySizeForKind } from "./unit-kind";
import {
  nextStableStride,
  pointIntersectsBounds,
  renderBoundsForScene,
  renderModeFor,
  type RenderBounds,
  type RenderMode,
} from "./viewport";

export type UnitRenderPlan = {
  bounds: RenderBounds;
  lodDisabled: boolean;
  mode: RenderMode;
  enemyStride: number;
  visibleEnemies: number;
};

export const unitIntersectsBoundsAt = (
  units: UnitViews,
  entity: EntityIndex,
  bounds: RenderBounds,
  dt: number,
) => {
  const x = units.movement.x[entity];
  const y = units.movement.y[entity];
  const radius = displaySizeForKind(units.identity.kind[entity]) * 0.5;

  return pointIntersectsBounds(
    x + units.movement.vx[entity] * dt,
    y + units.movement.vy[entity] * dt,
    radius,
    bounds,
  );
};

export const unitIntersectsBounds = (units: UnitViews, entity: EntityIndex, bounds: RenderBounds) =>
  unitIntersectsBoundsAt(units, entity, bounds, 0);

export const unitShouldRender = (units: UnitViews, entity: EntityIndex, plan: UnitRenderPlan) => {
  if (plan.enemyStride <= 1 || units.identity.faction[entity] !== UNIT_FACTION.ENEMY) return true;

  const unitIndex = units.identity.unitIndex[entity];
  return unitIndex < 0 || unitIndex % plan.enemyStride === 0;
};

export const createUnitRenderPlan = (
  scene: PhaserScene,
  units: UnitViews,
  options: { lodDisabled: boolean; previousEnemyStride: number },
): UnitRenderPlan => {
  const bounds = renderBoundsForScene(scene);
  const mode = options.lodDisabled ? "sprite" : renderModeFor(scene);
  const maxVisibleEnemies = mode === "dot" ? MAX_VISIBLE_ENEMY_DOTS : MAX_VISIBLE_ENEMY_SPRITES;
  let visibleEnemies = 0;

  for (let index = 0; index < units.capacity; index += 1) {
    const entity = index as EntityIndex;
    if (!isUnitAlive(units.health, entity)) continue;
    if (units.identity.faction[entity] !== UNIT_FACTION.ENEMY) continue;
    if (!unitIntersectsBounds(units, entity, bounds)) continue;

    visibleEnemies += 1;
  }

  const enemyStride = options.lodDisabled
    ? 1
    : nextStableStride(visibleEnemies, maxVisibleEnemies, options.previousEnemyStride);

  return {
    bounds,
    mode,
    lodDisabled: options.lodDisabled,
    enemyStride,
    visibleEnemies,
  };
};
