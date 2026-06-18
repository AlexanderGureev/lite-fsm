# Lifecycle

Как сущность рождается, живёт и умирает, и где выполнять побочные эффекты вокруг этого.

## Две схемы данных

У entity-шаблона две схемы, решающие разные задачи.

- `initialContext` — постоянные колонки строки и template-level resources. `default` у колонок необязателен (по умолчанию `0` для чисел и `""` для строк), но задавать его явно — хорошая практика; `optional(...)` здесь запрещён.
- `spawnSchema` — данные, приходящие при спавне. `default` запрещён, `optional(...)` разрешён (значение может быть `null`), `resource(...)` запрещён.

```ts
initialContext: {
  x: f32({ default: 0 }),
  y: f32({ default: 0 }),
  scratch: resource(() => new Int32Array(64)), // только в initialContext
},
spawnSchema: {
  x: f32(),
  y: f32(),
},
```

Дескрипторы колонок: `f32`/`i32`/`i16`/`u8` → числовые `TypedArray`, `string` → `string[]`, `optional(d)` → `value | null` только в `spawnSchema`. Часть имён зарезервирована рантаймом (`count`, `capacity`, `ids`, `version`, `presence`, `stateCode` и др.) и не может быть именем колонки или resource.

## Состояния жизненного цикла

Шаблон стартует из служебного `__INIT`. Единственный разрешённый переход из него — по внутреннему `ENTITY_SPAWNED`.

```ts
config: {
  __INIT: { ENTITY_SPAWNED: "ACTIVE" },
  ACTIVE: { TICK: null, UNIT_DEAD: "REMOVED" },
  REMOVED: {},
},
despawnOn: "REMOVED",
```

- `ENTITY_SPAWNED` рантайм диспатчит автоматически при создании строки; в этот момент доступен `payloadFor(entity)`.
- `ENTITY_DESPAWNED` — локальный hook для строк, удаляемых в текущем `transition`. Reducer и `reactions.ENTITY_DESPAWNED` видят колонки до физического удаления строки.
- `despawnOn: "state"` (или массив состояний) — как только строка входит в указанное состояние, рантайм удаляет её.

Прямой публичный диспатч `ENTITY_SPAWNED`/`ENTITY_DESPAWNED` запрещён. Создание — только через события спавна; удаление — через `despawnOn` или `transition.despawn(...)` в эффекте.

## Инициализация строки на `ENTITY_SPAWNED`

Каждый актор переносит свои поля из spawn payload в колонки и задаёт стартовые значения handoff-колонок.

```ts
case "ENTITY_SPAWNED":
  for (const entity of self.indices) {
    const payload = payloadFor(entity);
    self.attackRange[entity] = payload.attackRange;
    self.attackTimerMs[entity] = payload.attackTimerMs;
    self.incomingDamage[entity] = 0;
  }
  return;
```

## Спавн: события, рецепты, плагин

Спавн описывается в три шага и подключается через `entitiesPlugin({ spawn })`.

```ts
// 1. события спавна и их payload
export const spawnEvents = defineSpawnEvents({
  GAME_START: spawnEvent<GameConfig>(),
  SPAWN_ENEMY_BATCH: spawnEvent<SpawnBatchPayload>(),
});

// 2. рецепты: payload -> одна или несколько сущностей
export const spawn = defineEntitySpawn(machines, spawnEvents)({
  GAME_START: (config) => [
    ...planUnits(config).map(toEntitySpec),
    { id: "system/spatial-index", groupTag: "system", actors: { spatialIndex: {} } },
    { id: "system/projectiles", groupTag: "system", actors: { projectiles: {} } },
  ],
  SPAWN_ENEMY_BATCH: (payload) => planEnemyBatch(payload).map(toEntitySpec),
});
```

Одна сущность — это один `id` и `groupTag`, распределённые по нескольким акторам. Композиция выражается набором ключей в `actors`; optional-акторы добавляются условно.

```ts
const toEntitySpec = (unit: PlannedUnit) => ({
  id: unit.id,
  groupTag: unit.groupTag,
  actors: {
    identity: unit.identity,
    movement: unit.movement,
    health: unit.health,
    combat: unit.combat,
    ...(unit.selection ? { selection: unit.selection } : {}),
    ...(unit.command ? { command: unit.command } : {}),
    ...(unit.enemyAi ? { enemyAi: unit.enemyAi } : {}),
  },
});
```

Системные сущности-одиночки (spatial index, пул снарядов) — это тоже строки: одна строка системного актора с пустым payload. Их спавнят вместе с миром.

Поля каждого актора проверяются по его `spawnSchema`. Placement-математика и рецепты — cold path; держи их отдельно от runtime-машин (`architecture.md`).

## Поэтапный спавн больших объёмов

Тысячи сущностей не обязательно создавать в одном событии. Заведи machine-orchestrator, который батчами эмитит события спавна по `SPAWN_TICK`, ведёт счётчики `spawned/target` и завершает фазу событием `GAME_SPAWN_COMPLETED`. Это держит первый кадр отзывчивым и даёт UI прогресс. Сама batch-логика — обычная machine с effects, а не entity-система.

## Effects: редкие события и despawn

`effects` объявляются по имени состояния и выполняются при входе строк в это состояние. Эффект может диспатчить события и удалять сущности.

```ts
effects: {
  DEAD: ({ self, entities, transition }) => {
    const identity = entities().get("identity");
    const despawnIds: string[] = [];
    let killed = 0;

    for (const entity of self.indices) {
      const id = self.entityId(entity);
      if (identity.kind[entity] === HERO) {
        transition.unscoped({ type: "HERO_DEAD" });
        continue;
      }
      despawnIds.push(id);
      killed += 1;
    }

    if (killed > 0) transition.unscoped({ type: "ENEMIES_KILLED", payload: { count: killed } });
    if (despawnIds.length > 0) transition.despawn(despawnIds);
  },
},
```

`transition` в эффекте — функция плюс адресные методы: `transition(action)`, `transition.entity(id, action)`, `transition.actor`/`group`/`tag`, `transition.unscoped(action)`, `transition.despawn(ids | self.indices)`.

Используй effects для: dispatch lifecycle-событий, despawn мёртвых строк, async-процессов, внешних команд, которым нужен `transition`. Не используй для per-frame movement/combat/damage — это reducers.

`condition()` в entity-эффектах не поддерживается.

## Reactions: внешняя синхронизация без диспатча

`reactions` объявляются по типу события и выполняются после commit транзакции. Они синхронно обновляют внешние системы и **не могут диспатчить события**.

```ts
reactions: {
  TICK: ({ self, entities, sprites }) => {
    const move = entities().get("movement");
    for (const entity of self.indices) {
      sprites.sync(self.spriteId[entity], { x: move.x[entity], y: move.y[entity] });
    }
  },
},
```

- Reactions читают committed state и вызывают побочные эффекты: рендер, звук, метрики, внешние observers.
- Они не владеют решениями симуляции и не являются вторым источником истины.
- Кросс-машинные колонки читаются через `entities()`, если он передан в deps (`manager.setDependencies({ entities: manager.entities })`).
- `self`, `deps` и views нельзя мутировать и сохранять после завершения reaction.

Финальную синхронизацию при удалении делай в `reactions.ENTITY_DESPAWNED` — там колонки ещё доступны. `effects`, привязанные к целевому состоянию despawn-перехода, не являются контрактом cleanup.

## Reducer vs effect vs reaction

| Слой | Когда | Может диспатчить | Может менять state |
|---|---|---|---|
| reducer | каждый `TICK`, hot path | нет | только `self` |
| effect | редкие события, despawn, async | да | нет (через события) |
| reaction | синхронизация после commit | нет | нет |

Антипаттерн: цепочка `reaction -> orchestrator -> scratch -> flush событий` для hot-path. Перенеси расчёт в entity-систему, оставив reactions для внешней синхронизации.
