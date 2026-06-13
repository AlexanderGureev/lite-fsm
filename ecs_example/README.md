# ecs_example

Минимальный игровой store под финальный `@lite-fsm/entities` API из ТЗ.

Состав:

- `worldMachine` — обычный автомат, принимает `TICK`, читает root `manager.entities` в effect и хранит агрегированный read model.
- `blinkActor` — обычный `storage: "instance"` actor, принимает `TICK`, имеет `groupTag`, `persistence: "snapshot"` и snapshot hooks.
- `enemyActor` — `storage: "entity"` actor template, принимает `TICK`, использует schema descriptors, `spawnSchema`, `despawnOn`, entity effects, reactions и scoped `entities`.

После реализации `@lite-fsm/entities` пример должен проходить как финальный gate:

```sh
pnpm exec tsc --noEmit -p ecs_example/tsconfig.json
```

`run-example.ts` показывает общий сценарий: создать store, запустить actor, выполнить `SPAWN_ENEMY`, отправить `TICK`, проверить `manager.entities`, `dehydrate`, `getHydratedState` и `hydrate`.
