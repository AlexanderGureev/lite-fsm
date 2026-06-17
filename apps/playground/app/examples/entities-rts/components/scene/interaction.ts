import type { EntityIndex } from "@lite-fsm/entities";

import { isUnitAlive } from "../../store/machines/unit-health";
import { unitSelected, type UnitViews } from "../../store/selectors";
import type { Point } from "../../store/types";
import { UNIT_FACTION } from "../../store/unit-model";

import { displaySizeForKind } from "./unit-kind";
import { squaredDistance } from "./viewport";

export type DragState = {
  start: Point;
  current: Point;
};

export const keyboardTargetIsEditable = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
};

export const isCameraPanKey = (code: string) =>
  code === "KeyA" || code === "KeyD" || code === "KeyW" || code === "KeyS";

export const findUnitAt = (
  units: UnitViews,
  point: Point,
  options: { faction?: number; radiusMultiplier?: number; minimumRadius?: number } = {},
) => {
  let nearest: EntityIndex | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < units.capacity; index += 1) {
    const entity = index as EntityIndex;
    if (!isUnitAlive(units.health, entity)) continue;
    if (options.faction !== undefined && units.identity.faction[entity] !== options.faction) continue;

    const hitRadius = Math.max(
      options.minimumRadius ?? 0,
      Math.max(units.identity.radius[entity], displaySizeForKind(units.identity.kind[entity]) * 0.5) *
        (options.radiusMultiplier ?? 1),
    );
    const distance = squaredDistance(point, { x: units.movement.x[entity], y: units.movement.y[entity] });

    if (distance > hitRadius * hitRadius || distance >= nearestDistance) continue;

    nearest = entity;
    nearestDistance = distance;
  }

  return nearest;
};

export const hasSelectedPlayerUnits = (units: UnitViews) => {
  for (let index = 0; index < units.capacity; index += 1) {
    const entity = index as EntityIndex;
    if (!isUnitAlive(units.health, entity)) continue;
    if (units.identity.faction[entity] === UNIT_FACTION.PLAYER && unitSelected(units, entity) === 1) return true;
  }

  return false;
};
