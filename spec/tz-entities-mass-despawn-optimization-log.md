# Журнал реализации ТЗ @lite-fsm/entities mass despawn optimization

ТЗ: [`tz-entities-mass-despawn-optimization.md`](./tz-entities-mass-despawn-optimization.md)

Цель журнала — восстановить состояние реализации после сжатия контекста. Журнал не заменяет ТЗ и не пересказывает diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, пока текущий этап не прошел свой `stage gate`.
- Обновлять журнал после закрытия этапа, blocker или значимого промежуточного результата.
- Записи держать короткими: scope, измененные модули, проверки, coverage, риски, следующее действие.
- Не фиксировать каждую мелкую правку и не вставлять полный diff.
- Не запускать запрещенные docs build commands из `AGENTS.md` и ТЗ.

## Статусы

- `not started`
- `in progress`
- `done`
- `blocked`

## Текущий указатель

- Активное ТЗ: `spec/tz-entities-mass-despawn-optimization.md`
- Активный этап: Этап 0 — Baseline audit и тестовая карта
- Статус: `not started`
- Следующее действие: начать Этап 0, прочитать ТЗ и baseline, затем составить карту текущих test gaps по матрице.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 0 | Baseline audit и тестовая карта | `not started` | 2026-06-18 |
| 1 | Store id, `despawnOn` classification и final-removal hints | `not started` | 2026-06-18 |
| 2 | Full-entity cleanup fast path | `not started` | 2026-06-18 |
| 3 | Scratch cleanup batches вместо `Map<string, ...>` | `not started` | 2026-06-18 |
| 4 | Benchmark attribution и runtime performance gate | `not started` | 2026-06-18 |
| 5 | RTS `UNIT_DEAD` death flow | `not started` | 2026-06-18 |
| 6 | Рефакторинг, чистка и полировка | `not started` | 2026-06-18 |

## Ход реализации

### Этап 0 — Baseline audit и тестовая карта

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 1 — Store id, `despawnOn` classification и final-removal hints

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 2 — Full-entity cleanup fast path

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 3 — Scratch cleanup batches вместо `Map<string, ...>`

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 4 — Benchmark attribution и runtime performance gate

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 5 — RTS `UNIT_DEAD` death flow

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 6 — Рефакторинг, чистка и полировка

Статус: `not started`

Записи:

- Записей пока нет.

## Финальная проверка

- Статус: `not started`
- Записи: нет.

