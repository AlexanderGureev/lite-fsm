# Журнал реализации ТЗ Plugin System Stable API

Этот файл фиксирует краткий прогресс реализации ТЗ:

- [`PLUGIN-SYSTEM-STABLE-API-TZ.md`](./PLUGIN-SYSTEM-STABLE-API-TZ.md)

Цель журнала — дать следующему агенту точку продолжения после сброса контекста. Журнал не заменяет ТЗ, не является changelog и не должен подробно пересказывать diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, если текущий этап не прошел gate из ТЗ.
- Если этап имеет статус `blocked`, не продолжать следующий этап до ручного решения блокера и обновления статуса.
- Обновлять журнал в конце каждого этапа и после значимого промежуточного результата, если этап большой.
- Записи держать короткими: что сделано, какие файлы/модули затронуты, какие проверки запускались, какие риски остались.
- Не фиксировать каждую мелкую правку тестов. Фиксировать закрытие сценариев, public type contracts, runtime validation, snapshot/hydrate behavior, coverage gaps и важные решения.
- Для нового и измененного чистого кода требуется 100% coverage по statements/branches/functions/lines.
- 100% coverage не считается достаточным без сценарных тестов: happy path, негативные type-level контракты, runtime validation, conflict diagnostics, snapshot round-trip, hydrate edge cases и регрессия без plugins.
- Агент не запускает docs build и команды, которые транзитивно запускают docs build.
- При изменении public API или public types обновлять `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `PLUGIN-SYSTEM-CHEATSHEET.md`.
- Это ТЗ не вводит `install`, automatic prefixing, structural plugin objects и типизацию per-machine snapshot payload через `MachineStore` generic.

## Статусы

- `not started` — этап еще не начат.
- `in progress` — этап начат, но критерии приемки или test/coverage gate еще не закрыты.
- `done` — этап реализован, критерии приемки выполнены, проверки и coverage gate закрыты.
- `blocked` — продолжение невозможно без решения, которое должен принять человек.

## Текущий указатель

- Активное ТЗ: `./PLUGIN-SYSTEM-STABLE-API-TZ.md`
- Активный этап: Этап 1 — Типовая семантика `definePlugin`
- Статус: `not started`
- Следующее действие: начать этап 1 с изменения observer event typing и обновления соответствующих Tstyche/Vitest тестов.

## Сводка по этапам

| Этап | Название                                    | Статус        | Последнее обновление |
| ---- | ------------------------------------------- | ------------- | -------------------- |
| 1    | Типовая семантика `definePlugin`            | `not started` | 2026-05-26           |
| 2    | Плоский namespace и owner-aware diagnostics | `not started` | 2026-05-26           |
| 3    | Public model storage extension              | `not started` | 2026-05-26           |
| 4    | Generic storage contexts                    | `not started` | 2026-05-26           |
| 5    | Snapshot API storage runtime                | `not started` | 2026-05-26           |
| 6    | Public exports и документация               | `not started` | 2026-05-26           |
| 7    | Рефакторинг, чистка и полировка             | `not started` | 2026-05-26           |

## Шаблон записи

Копировать шаблон в раздел нужного этапа.

```md
### YYYY-MM-DD — Этап N — Название

- Статус: `in progress | done | blocked`
- Scope: кратко какие пункты этапа закрывались.
- Реализация: ключевые модули и решения, без подробного diff.
- Тесты: какие runtime/type/documentation fixture tests добавлены или обновлены.
- Проверки: команды и результат.
- Coverage: статус 100% coverage по новому и измененному коду; если не закрыто, перечислить gaps.
- Сценарии: какие реальные public API сценарии и негативные контракты покрыты.
- Совместимость: какие behavior/type tests подтвердили сохранение public behavior.
- Открыто: конкретные риски, TODO или blocker.
- Следующее действие: один короткий следующий шаг.
```

## Ход реализации

### Этап 1 — Типовая семантика `definePlugin`

Статус: `not started`

Записи:

Пока нет записей.

### Этап 2 — Плоский namespace и owner-aware diagnostics

Статус: `not started`

Записи:

Пока нет записей.

### Этап 3 — Public model storage extension

Статус: `not started`

Записи:

Пока нет записей.

### Этап 4 — Generic storage contexts

Статус: `not started`

Записи:

Пока нет записей.

### Этап 5 — Snapshot API storage runtime

Статус: `not started`

Записи:

Пока нет записей.

### Этап 6 — Public exports и документация

Статус: `not started`

Записи:

Пока нет записей.

### Этап 7 — Рефакторинг, чистка и полировка

Статус: `not started`

Записи:

Пока нет записей.
