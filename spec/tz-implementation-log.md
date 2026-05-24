# Журнал реализации ТЗ plugin system и entities

Этот файл фиксирует краткий прогресс реализации двух больших ТЗ:

- [`tz-plugin-system.md`](./tz-plugin-system.md)
- [`tz-entities.md`](./tz-entities.md)

Цель журнала — дать следующему агенту точку продолжения после сброса контекста. Журнал не заменяет ТЗ, не является changelog и не должен подробно пересказывать diff.

## Правила ведения

- Перед продолжением работы прочитать соответствующее ТЗ и этот журнал.
- Продолжать первый этап со статусом `in progress` или `not started`, учитывая зависимости: сначала `tz-plugin-system.md`, затем `tz-entities.md`.
- Обновлять журнал в конце каждого этапа и после значимого промежуточного результата, если этап большой.
- Записи должны быть короткими: что сделано, какие файлы/модули затронуты, какие проверки запускались, какие риски остались.
- Не фиксировать каждую мелкую правку тестов. Фиксировать только закрытие сценариев, coverage gaps, обновление tests под нового владельца поведения или важные решения.
- Не переходить к следующему этапу, если текущий этап не прошел тестовый gate из ТЗ.
- Если тест поведения падает, сначала считать это regression. Тест обновляется только если он был привязан к удаленной или перенесенной internal function и поведение теперь принадлежит другому модулю.

## Статусы

- `not started` — этап еще не начат.
- `in progress` — этап начат, но критерии приемки или тестовый gate еще не закрыты.
- `done` — этап реализован, критерии приемки выполнены, проверки и coverage gate закрыты.
- `blocked` — продолжение невозможно без решения, которое должно принять человек.

## Текущий указатель

- Активное ТЗ: `tz-plugin-system.md`
- Активный этап: Этап 1 — Plugin registry
- Статус: `not started`
- Следующее действие: начать с контракта этапа 1, затем реализовать минимальный plugin registry и тесты его public/runtime/type contracts.

## Сводка по этапам

### `tz-plugin-system.md`

| Этап | Название | Статус | Последнее обновление |
| --- | --- | --- | --- |
| 1 | Plugin registry | `not started` | — |
| 2 | `instanceStorageRuntime` | `not started` | — |
| 3 | Routing meta registry | `not started` | — |
| 4 | Dispatch hooks | `not started` | — |
| 5 | Расширения типизации machines и deps | `not started` | — |
| 6 | Manager extensions | `not started` | — |
| 7 | Storage snapshot extension points | `not started` | — |
| 8 | Документация и examples | `not started` | — |

### `tz-entities.md`

| Этап | Название | Статус | Последнее обновление |
| --- | --- | --- | --- |
| 1 | Пакет entities и базовый entity runtime | `not started` | — |
| 2 | System lifecycle events и internal spawn/despawn | `not started` | — |
| 3 | Spawn config и recipes | `not started` | — |
| 4 | Reactions | `not started` | — |
| 5 | Snapshot/hydrate | `not started` | — |
| 6 | React entity hooks | `not started` | — |
| 7 | Examples | `not started` | — |

## Шаблон записи

Копировать шаблон в раздел нужного ТЗ и этапа.

```md
### YYYY-MM-DD — tz-plugin-system.md / Этап N — Название

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

## Ход реализации `tz-plugin-system.md`

### Этап 1 — Plugin registry

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 2 — `instanceStorageRuntime`

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 3 — Routing meta registry

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 4 — Dispatch hooks

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 5 — Расширения типизации machines и deps

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 6 — Manager extensions

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 7 — Storage snapshot extension points

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 8 — Документация и examples

Статус: `not started`

Записи:

- Пока нет записей.

## Ход реализации `tz-entities.md`

### Этап 1 — Пакет entities и базовый entity runtime

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 2 — System lifecycle events и internal spawn/despawn

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 3 — Spawn config и recipes

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 4 — Reactions

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 5 — Snapshot/hydrate

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 6 — React entity hooks

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 7 — Examples

Статус: `not started`

Записи:

- Пока нет записей.
