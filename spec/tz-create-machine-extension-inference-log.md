# Журнал реализации ТЗ TypedCreateMachineFn plugin source

ТЗ: [`tz-create-machine-extension-inference.md`](./tz-create-machine-extension-inference.md)

Цель журнала - восстановить состояние реализации после сжатия контекста. Журнал не заменяет ТЗ и не пересказывает diff.

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

- Активное ТЗ: `spec/tz-create-machine-extension-inference.md`
- Активный этап: Этап 1 - Public API collapse to plugin source
- Статус: `not started`
- Следующее действие: начать этап 1 с удаления public extension-union path и type regression tests для `TypedCreateMachineFn<P, D, typeof plugins>`.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 1 | Public API collapse to plugin source | `not started` | 2026-06-13 |
| 2 | Cfg-dependent machine-facing fields | `not started` | 2026-06-13 |
| 3 | Entity-facing proof без `@lite-fsm/entities` | `not started` | 2026-06-13 |
| 4 | Документация public API | `not started` | 2026-06-13 |
| 5 | Рефакторинг, чистка и полировка | `not started` | 2026-06-13 |

## Ход реализации

### Этап 1 - Public API collapse to plugin source

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 2 - Cfg-dependent machine-facing fields

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 3 - Entity-facing proof без `@lite-fsm/entities`

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 4 - Документация public API

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 5 - Рефакторинг, чистка и полировка

Статус: `not started`

Записи:

- Записей пока нет.

## Финальная проверка

- Статус: `not started`
- Записи: нет.
