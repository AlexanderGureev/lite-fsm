# Журнал реализации ТЗ Entities, часть 2

ТЗ: [`tz-entities-implementation-part-2.md`](./tz-entities-implementation-part-2.md)

Цель журнала — восстановить состояние реализации после сжатия контекста. Журнал не заменяет ТЗ и не пересказывает diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, пока текущий этап не прошел свой `stage gate`.
- Не начинать этапы 8-14, пока часть 1 не прошла свой критерий готовности.
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

- Активное ТЗ: `spec/tz-entities-implementation-part-2.md`
- Активный этап: Этап 8 — Despawn, `despawnOn` и lifecycle cleanup
- Статус: `not started`
- Следующее действие: ждать завершения gate части 1, затем начинать этап 8.

## Сводка по этапам

| Этап | Название                                                            | Статус        | Последнее обновление |
| ---- | ------------------------------------------------------------------- | ------------- | -------------------- |
| 8    | Despawn, `despawnOn` и lifecycle cleanup                            | `not started` | 2026-06-13           |
| 9    | Entity effects, entity-specific helpers и core transition helpers   | `not started` | 2026-06-13           |
| 10   | Reactions и reaction error semantics                                | `not started` | 2026-06-13           |
| 11   | Snapshot/hydrate через `snapshot.storage.entity`                    | `not started` | 2026-06-13           |
| 12   | React hooks: `useEntitySnapshot`, `useEntityCount`, `useEntityList` | `not started` | 2026-06-13           |
| 13   | Benchmarks, README/examples                                         | `not started` | 2026-06-13           |
| 14   | Рефакторинг, чистка и полировка                                     | `not started` | 2026-06-13           |

## Ход реализации

## Финальная проверка

- Статус: `not started`
- Записи: нет.
