import type { EntityIndex } from "@lite-fsm/entities";

import type { AppStore } from ".";
import { slotCount } from "./machines/column-slot-count";
import { isUnitAlive } from "./machines/unit-health";
import { UNIT_FACTION, UNIT_KIND, UNIT_SELECTION } from "./unit-model";

export type RtsEntityStats = {
  total: number;
  allies: number;
  enemies: number;
  selected: number;
  heroHp: number;
  heroMaxHp: number;
  heroAlive: boolean;
};

// Колонки индексируются по EntityIndex, поэтому read-side обходит слоты [0, capacity)
// и фильтрует живые строки. Read-view не раскрывает backing store, поэтому capacity
// берется из длины типизированной колонки.
export const readUnitViews = (manager: AppStore) => {
  const entities = manager.entities();
  const movement = entities.get("unitMovement");

  return {
    capacity: slotCount(movement.x),
    identity: entities.get("unitIdentity"),
    movement,
    health: entities.get("unitHealth"),
    combat: entities.get("unitCombat"),
    selection: entities.get("unitSelection"),
    command: entities.get("unitCommand"),
  };
};

export type UnitViews = ReturnType<typeof readUnitViews>;

export const readProjectileView = (manager: AppStore) => manager.entities().get("unitProjectile").projectiles;

export type ProjectileView = ReturnType<typeof readProjectileView>;

export const unitSelected = (units: UnitViews, entity: EntityIndex) =>
  units.selection.has(entity) ? units.selection.selected[entity] : UNIT_SELECTION.UNSELECTED;

export const entityIdForUnitIndex = (units: UnitViews, entity: EntityIndex): string | null => {
  const kind = units.identity.kind[entity];
  const unitIndex = units.identity.unitIndex[entity];

  if (kind === UNIT_KIND.HERO) return "unit/hero";
  if (kind === UNIT_KIND.ALLY && unitIndex >= 0) return `unit/ally/${unitIndex}`;
  if (kind === UNIT_KIND.ENEMY && unitIndex >= 0) return `unit/enemy/${unitIndex}`;

  return null;
};

export const readRtsEntityStats = (units: UnitViews): RtsEntityStats => {
  const stats: RtsEntityStats = {
    total: 0,
    allies: 0,
    enemies: 0,
    selected: 0,
    heroHp: 0,
    heroMaxHp: 0,
    heroAlive: false,
  };

  for (let index = 0; index < units.capacity; index += 1) {
    const entity = index as EntityIndex;
    if (!isUnitAlive(units.health, entity)) continue;

    stats.total += 1;

    if (units.identity.kind[entity] === UNIT_KIND.HERO) {
      stats.heroHp = units.health.hp[entity];
      stats.heroMaxHp = units.health.maxHp[entity];
      stats.heroAlive = true;
    } else if (units.identity.faction[entity] === UNIT_FACTION.PLAYER) {
      stats.allies += 1;
    } else if (units.identity.faction[entity] === UNIT_FACTION.ENEMY) {
      stats.enemies += 1;
    }

    if (unitSelected(units, entity) === UNIT_SELECTION.SELECTED) stats.selected += 1;
  }

  return stats;
};
