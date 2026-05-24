# Журнал реализации ТЗ plugin system и entities

Этот файл фиксирует краткий прогресс реализации трех актуальных реализационных ТЗ:

- [`tz-plugin-system-implementation.md`](./tz-plugin-system-implementation.md)
- [`tz-entities-implementation.md`](./tz-entities-implementation.md)
- [`tz-entities-implementation-part-2.md`](./tz-entities-implementation-part-2.md)

Цель журнала — дать следующему агенту точку продолжения после сброса контекста. Журнал не заменяет ТЗ, не является changelog и не должен подробно пересказывать diff.

## Правила ведения

- Перед продолжением работы прочитать соответствующее реализационное ТЗ и этот журнал.
- Продолжать первый этап со статусом `in progress` или `not started`, учитывая зависимости: сначала `tz-plugin-system-implementation.md`, затем `tz-entities-implementation.md`, затем `tz-entities-implementation-part-2.md`.
- Этапы 7-12 entities реализуются по `tz-entities-implementation-part-2.md`; этот файл самодостаточен, но начинать его можно только после gate этапа 6 из `tz-entities-implementation.md`.
- Обновлять журнал в конце каждого этапа и после значимого промежуточного результата, если этап большой.
- Записи должны быть короткими: что сделано, какие файлы/модули затронуты, какие проверки запускались, какие риски остались.
- Не фиксировать каждую мелкую правку тестов. Фиксировать только закрытие сценариев, coverage gaps, обновление tests под нового владельца поведения или важные решения.
- Не переходить к следующему этапу, если текущий этап не прошел gate из соответствующего ТЗ.
- Если тест поведения падает, сначала считать это regression. Тест обновляется только если он был привязан к удаленной или перенесенной internal function и поведение теперь принадлежит другому модулю.
- Агент не запускает docs build и команды, которые транзитивно запускают docs build.

## Статусы

- `not started` — этап еще не начат.
- `in progress` — этап начат, но критерии приемки или тестовый gate еще не закрыты.
- `done` — этап реализован, критерии приемки выполнены, проверки и coverage gate закрыты.
- `blocked` — продолжение невозможно без решения, которое должен принять человек.

## Текущий указатель

- Активное ТЗ: `tz-plugin-system-implementation.md`
- Активный этап: Этап 1 — Plugin value и install registry
- Статус: `not started`
- Следующее действие: начать с контракта этапа 1, затем реализовать минимальный plugin value, install registry, опцию `plugins` в `MachineManager(...)` и тесты public/runtime/type contracts.

## Сводка по этапам

### `tz-plugin-system-implementation.md`

| Этап | Название | Статус | Последнее обновление |
| --- | --- | --- | --- |
| 1 | Plugin value и install registry | `not started` | — |
| 2 | Storage registry, runtime preset и default `"instance"` wiring | `not started` | — |
| 3 | `instanceStorageRuntime` и разделение ownership | `not started` | — |
| 4 | Routing meta registry | `not started` | — |
| 5 | Action interceptors и dispatch hooks | `not started` | — |
| 6 | TypeScript surface для machine extensions, transition events и action meta | `not started` | — |
| 7 | Scoped deps и scoped transition extensions | `not started` | — |
| 8 | Manager extensions | `not started` | — |
| 9 | Storage snapshot extension points | `not started` | — |
| 10 | Документация, examples и final verification | `not started` | — |

### `tz-entities-implementation.md`

| Этап | Название | Статус | Последнее обновление |
| --- | --- | --- | --- |
| 1 | Пакет `@lite-fsm/entities`, exports, plugin shell и `storage: "entity"` registration | `not started` | — |
| 2 | Schema descriptors и `EntityMachineExtension` | `not started` | — |
| 3 | Compile metadata, empty `EntityStore`, `ColumnarActorStore`, public lightweight state и `manager.entities` | `not started` | — |
| 4 | Entity lifecycle events, `__INIT`, internal `ENTITY_SPAWNED`/`ENTITY_DESPAWNED`, `payloadFor` | `not started` | — |
| 5 | Spawn config, spawn recipes и public spawn event interceptor | `not started` | — |
| 6 | Columnar reduce pipeline, numeric event/state codes, buckets, routing и hot path guarantees | `not started` | — |

### `tz-entities-implementation-part-2.md`

| Этап | Название | Статус | Последнее обновление |
| --- | --- | --- | --- |
| 7 | Despawn, `despawnOn`, `transition.despawn(...)` и lifecycle cleanup | `not started` | — |
| 8 | Entity effects и scoped transition extensions | `not started` | — |
| 9 | Reactions и reaction error semantics | `not started` | — |
| 10 | Snapshot/hydrate через `snapshot.storage.entity` | `not started` | — |
| 11 | React hooks: `useEntitySnapshot`, `useEntityCount`, `useEntityList` | `not started` | — |
| 12 | Benchmarks, README/examples и final verification | `not started` | — |

## Шаблон записи

Копировать шаблон в раздел нужного ТЗ и этапа.

```md
### YYYY-MM-DD — tz-plugin-system-implementation.md / Этап N — Название

- Статус: `in progress | done | blocked`
- Scope: кратко какие пункты этапа закрывались.
- Реализация: ключевые модули и решения, без подробного diff.
- Тесты: какие runtime/type/snapshot/react/benchmark tests добавлены или обновлены.
- Проверки: команды и результат.
- Coverage: статус 100% coverage по новому и измененному коду; если не закрыто, перечислить gaps.
- Совместимость: какие behavior tests подтвердили сохранение public behavior.
- Открыто: конкретные риски, TODO или blocker.
- Следующее действие: один короткий следующий шаг.
```

Для entries по entities заменить имя ТЗ на `tz-entities-implementation.md` или `tz-entities-implementation-part-2.md`.

## Ход реализации `tz-plugin-system-implementation.md`

### Этап 1 — Plugin value и install registry

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 2 — Storage registry, runtime preset и default `"instance"` wiring

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 3 — `instanceStorageRuntime` и разделение ownership

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 4 — Routing meta registry

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 5 — Action interceptors и dispatch hooks

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 6 — TypeScript surface для machine extensions, transition events и action meta

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 7 — Scoped deps и scoped transition extensions

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 8 — Manager extensions

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 9 — Storage snapshot extension points

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 10 — Документация, examples и final verification

Статус: `not started`

Записи:

- Пока нет записей.

## Ход реализации `tz-entities-implementation.md`

### Этап 1 — Пакет `@lite-fsm/entities`, exports, plugin shell и `storage: "entity"` registration

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 2 — Schema descriptors и `EntityMachineExtension`

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 3 — Compile metadata, empty `EntityStore`, `ColumnarActorStore`, public lightweight state и `manager.entities`

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 4 — Entity lifecycle events, `__INIT`, internal `ENTITY_SPAWNED`/`ENTITY_DESPAWNED`, `payloadFor`

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 5 — Spawn config, spawn recipes и public spawn event interceptor

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 6 — Columnar reduce pipeline, numeric event/state codes, buckets, routing и hot path guarantees

Статус: `not started`

Записи:

- Пока нет записей.

## Ход реализации `tz-entities-implementation-part-2.md`

### Контракт перед этапом 7

Перед началом этапа 7 должны быть закрыты этапы 1-6 из `tz-entities-implementation.md`, включая их gates, coverage и запрет docs build.

### Этап 7 — Despawn, `despawnOn`, `transition.despawn(...)` и lifecycle cleanup

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 8 — Entity effects и scoped transition extensions

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 9 — Reactions и reaction error semantics

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 10 — Snapshot/hydrate через `snapshot.storage.entity`

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 11 — React hooks: `useEntitySnapshot`, `useEntityCount`, `useEntityList`

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 12 — Benchmarks, README/examples и final verification

Статус: `not started`

Записи:

- Пока нет записей.
