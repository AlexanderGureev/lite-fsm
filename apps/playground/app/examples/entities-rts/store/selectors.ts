import type { EntityIndex } from "@lite-fsm/entities";

import type { AppStore } from ".";
import { UNIT_FACTION, UNIT_KIND } from "./unit-model";

type EntityRoot = ReturnType<AppStore["entities"]>;
export type UnitActorView = ReturnType<EntityRoot["get"]>;

export type RtsEntityStats = {
  total: number;
  allies: number;
  enemies: number;
  selected: number;
  heroHp: number;
  heroMaxHp: number;
  heroAlive: boolean;
};

export const asEntityIndex = (index: number) => index as EntityIndex;

export const unitColumnLength = (units: UnitActorView) => (units.x as ArrayLike<number>).length;

export const unitIsAlive = (units: UnitActorView, entity: EntityIndex) =>
  units.has(entity) && units.state(entity) === "ALIVE" && units.hp[entity] > 0;

export const entityIdForUnitIndex = (units: UnitActorView, entity: EntityIndex, allyCount: number): string | null => {
  const kind = units.kind[entity];
  const index = Number(entity);

  if (kind === UNIT_KIND.HERO) return "unit/hero";
  if (kind === UNIT_KIND.ALLY && index > 0) return `unit/ally/${index - 1}`;
  if (kind === UNIT_KIND.ENEMY) return `unit/enemy/${index - allyCount - 1}`;

  return null;
};

export const readRtsEntityStats = (units: UnitActorView): RtsEntityStats => {
  const stats: RtsEntityStats = {
    total: 0,
    allies: 0,
    enemies: 0,
    selected: 0,
    heroHp: 0,
    heroMaxHp: 0,
    heroAlive: false,
  };

  for (let index = 0; index < unitColumnLength(units); index += 1) {
    const entity = asEntityIndex(index);
    if (!unitIsAlive(units, entity)) continue;

    stats.total += 1;

    if (units.kind[entity] === UNIT_KIND.HERO) {
      stats.heroHp = units.hp[entity];
      stats.heroMaxHp = units.maxHp[entity];
      stats.heroAlive = true;
    } else if (units.faction[entity] === UNIT_FACTION.PLAYER) {
      stats.allies += 1;
    } else if (units.faction[entity] === UNIT_FACTION.ENEMY) {
      stats.enemies += 1;
    }

    if (units.selected[entity] === 1) stats.selected += 1;
  }

  return stats;
};
