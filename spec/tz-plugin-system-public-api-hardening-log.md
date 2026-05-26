# Журнал реализации ТЗ Plugin System Public API Hardening

ТЗ: [`tz-plugin-system-public-api-hardening.md`](./tz-plugin-system-public-api-hardening.md)

Цель журнала — восстановить состояние реализации после сжатия контекста. Журнал не заменяет ТЗ и не пересказывает diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, пока текущий этап не прошел свой `stage gate`.
- Обновлять журнал после закрытия этапа, blocker или значимого промежуточного результата.
- Записи держать короткими: scope, измененные модули, проверки, coverage, риски, следующее действие.
- Не фиксировать каждую мелкую правку и не вставлять полный diff.
- При изменении public API или public types обновлять `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `PLUGIN-SYSTEM-CHEATSHEET.md`.
- Агентам запрещено запускать docs build и команды, которые транзитивно запускают docs build.
- Для package build использовать `pnpm run build:packages`, а не `pnpm run build`.

## Статусы

- `not started`
- `in progress`
- `done`
- `blocked`

## Текущий указатель

- Активное ТЗ: `spec/tz-plugin-system-public-api-hardening.md`
- Активный этап: Этап 1 — Foundation public types и boundary audit
- Статус: `not started`
- Следующее действие: начать этап 1 с public helper types и type boundary audit.

## Сводка по этапам

| Этап | Название                                      | Статус        | Последнее обновление |
| ---- | --------------------------------------------- | ------------- | -------------------- |
| 1    | Foundation public types и boundary audit      | `not started` | 2026-05-26           |
| 2    | Storage contexts без internal kernel          | `not started` | 2026-05-26           |
| 3    | Immutable action contract                     | `not started` | 2026-05-26           |
| 4    | Manager extensions по `PluginEvents`          | `not started` | 2026-05-26           |
| 5    | Документация и примеры                        | `not started` | 2026-05-26           |
| 6    | Рефакторинг, чистка и полировка               | `not started` | 2026-05-26           |
| 7    | Release checks                                | `not started` | 2026-05-26           |

## Ход реализации

### Этап 1 — Foundation public types и boundary audit

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 2 — Storage contexts без internal kernel

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 3 — Immutable action contract

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 4 — Manager extensions по `PluginEvents`

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 5 — Документация и примеры

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 6 — Рефакторинг, чистка и полировка

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 7 — Release checks

Статус: `not started`

Записи:

- Записей пока нет.

## Финальная проверка

- Статус: `not started`
- Записи: нет.
