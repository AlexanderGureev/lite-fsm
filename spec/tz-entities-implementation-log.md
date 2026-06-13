# Журнал реализации ТЗ Entities, часть 1

ТЗ: [`tz-entities-implementation.md`](./tz-entities-implementation.md)

Цель журнала — восстановить состояние реализации после сжатия контекста. Журнал не заменяет ТЗ и не пересказывает diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, пока текущий этап не прошел свой `stage gate`.
- Обновлять журнал после закрытия этапа, blocker или значимого промежуточного результата.
- Записи держать короткими: scope, измененные модули, проверки, coverage, риски, следующее действие.
- Не фиксировать каждую мелкую правку и не вставлять полный diff.
- Не запускать docs build и команды, которые транзитивно запускают docs build.

## Статусы

- `not started`
- `in progress`
- `done`
- `blocked`

## Текущий указатель

- Активное ТЗ: `spec/tz-entities-implementation.md`
- Активный этап: Этап 1 — Пакет `@lite-fsm/entities`, exports, plugin shell и `storage: "entity"` storage definition
- Статус: `not started`
- Следующее действие: начать этап 1 с package shell и storage definition через `defineStorageRuntime().create(...)`.

## Сводка по этапам

| Этап | Название                                                                                                   | Статус        | Последнее обновление |
| ---- | ---------------------------------------------------------------------------------------------------------- | ------------- | -------------------- |
| 1    | Пакет `@lite-fsm/entities`, exports, plugin shell и `storage: "entity"` storage definition                 | `not started` | 2026-06-13           |
| 2    | Schema descriptors и `EntityMachineExtension`                                                              | `not started` | 2026-06-13           |
| 3    | Compile metadata, empty `EntityStore`, `ColumnarActorStore`, public lightweight state и `manager.entities` | `not started` | 2026-06-13           |
| 4    | Entity lifecycle events, `__INIT` и запрет public lifecycle dispatch                                       | `not started` | 2026-06-13           |
| 5    | Spawn events, entity spawn и public spawn staging hook                                                     | `not started` | 2026-06-13           |
| 6    | Columnar reduce pipeline, numeric event/state codes, buckets, routing и hot path guarantees                | `not started` | 2026-06-13           |
| 7    | Рефакторинг, чистка и полировка части 1                                                                    | `not started` | 2026-06-13           |

## Ход реализации

## Финальная проверка

- Статус: `not started`
- Записи: нет.
