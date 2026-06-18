# Testing

Тесты обязательны для новой или изменённой симуляции. Покрывай runtime через test runner проекта и публичные типы через type-test runner, если он уже есть. Названия тестов пиши на русском, идентификаторы кода и термины API — на английском.

Для чистой логики и модулей с контрактами без сайд-эффектов (placement, формации, операции пула, spatial grid) требуй строгий 100% coverage по statements/branches/functions/lines.

## Что проверять в слое entities

- **Spawn инициализирует строки.** После события спавна `view.count`, `view.has(entity)` и колонки имеют значения из payload.
- **Batch-reducer на `TICK`.** Один `TICK` корректно обновляет все живые строки сразу.
- **Контракт порядка фаз.** Порядок entity-систем соответствует расписанию (см. ниже).
- **Handoff-колонки.** Значение пишется владельцем, читается потребителем и очищается в начале `TICK` владельца; после кадра не «протекает».
- **Lifecycle.** Death-переход, `despawnOn`/`transition.despawn`, удаление строки, сохранение нужных итогов в обычной machine.
- **Determinism.** Один и тот же seed/вход даёт один и тот же результат; в reducer нет `Date.now`/`random`.
- **Resource вне snapshot.** `dehydrate()`/`getSnapshot()` не содержит resource-значений.
- **Read-views.** Selector строит projection из колонок и не мутирует store.

## Runtime tests

Создавай manager через тот же `makeStore` с fake deps. Спавни через события спавна, гоняй `TICK` и читай через `manager.entities()`.

```ts
import { makeStore } from "../store";
import type { EntityIndex } from "@lite-fsm/entities";

test("TICK применяет урон и фиксирует смерть", () => {
  const manager = makeStore({ metrics: fakeMetrics, random: () => 0.5 });
  manager.transition({ type: "GAME_START", payload: { enemyCount: 1, allyCount: 1, seed: "t" } });

  const enemy = findEntity(manager, "unit/enemy/0");
  manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 16 } });

  const health = manager.entities().get("health");
  expect(health.hp[enemy]).toBeLessThan(health.maxHp[enemy]);
});
```

Для построчных проверок индексируй колонки по `EntityIndex` и сначала проверяй `view.has(entity)`.

## Контракт порядка фаз

Порядок entity-систем — gameplay-контракт, поэтому покрывай его отдельным тестом. Это дешёвая защита от тихой регрессии при reorder ключей.

```ts
import { entitySystems } from "../store";
import { SIMULATION_SCHEDULE } from "../store/schedule";

test("entity-системы идут в порядке расписания симуляции", () => {
  expect(Object.keys(entitySystems)).toEqual([...SIMULATION_SCHEDULE]);
});
```

Дополнительно проверяй межфазную видимость данных: например, что урон, посчитанный `combat`, виден `health` в том же `TICK`, а строка, помеченная мёртвой в `health`, уже не двигается `movement`.

```ts
test("мёртвая в этом TICK строка не двигается", () => {
  // подвести hp цели к 0 так, чтобы health пометил её DEAD до фазы movement
  const before = { x: movementX(manager, target), y: movementY(manager, target) };
  manager.transition({ type: "TICK", payload: { now: 32, deltaMs: 16 } });
  expect(movementX(manager, target)).toBe(before.x);
  expect(movementY(manager, target)).toBe(before.y);
});
```

## Lifecycle и despawn

```ts
test("враг удаляется после смерти", () => {
  const before = manager.entities().get("health").count;
  killEntity(manager, "unit/enemy/0");
  manager.transition({ type: "TICK", payload: { now: 48, deltaMs: 16 } });
  expect(manager.entities().get("health").count).toBe(before - 1);
});
```

Проверяй, что финальная внешняя синхронизация делается в `reactions.ENTITY_DESPAWNED` (колонки ещё доступны), а итог, нужный после удаления (счёт убийств), сохранён в обычной machine через событие.

## Handoff и determinism

```ts
test("incomingDamage очищается в начале TICK", () => {
  manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 16 } });
  manager.transition({ type: "TICK", payload: { now: 32, deltaMs: 16 } }); // цель вне досягаемости
  const combat = manager.entities().get("combat");
  expect(combat.incomingDamage[idleTarget]).toBe(0);
});

test("один seed даёт идентичные спавны", () => {
  const a = runSpawn("seed-1");
  const b = runSpawn("seed-1");
  expect(a).toEqual(b);
});
```

## Resource исключён из public state

```ts
test("resource не попадает в snapshot", () => {
  manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 16 } });
  const snapshot = JSON.stringify(manager.getSnapshot());
  expect(snapshot).not.toContain("flowField");
  expect(snapshot).not.toContain("grid");
});
```

## Чистая логика модулей владельца

Операции пула, spatial grid, flow field и placement — чистые функции; тестируй их напрямую, без manager, со строгим coverage.

```ts
test("swap-remove из пула не теряет хвост", () => {
  const pool = createPool(4);
  appendProjectile(pool, makeSpawn());
  appendProjectile(pool, makeSpawn());
  removeAt(pool, 0);
  expect(pool.count).toBe(1);
});
```

## Type checks

Используй существующий workflow проекта (`tsc --noEmit`, имеющийся type-test runner, package scripts). Проверяй, что колонки read-view доступны только для чтения, а запись разрешена только в `self`. Не добавляй новый type-test runner без запроса.

## Validation discovery

Перед запуском читай `package.json` и project instructions, запускай минимально релевантные checks (unit-тесты изменённых систем, type check изменённого surface, lint при необходимости). Если checks не запускались, явно укажи причину.
