# Журнал реализации ТЗ storage runtime dispatch pipeline

Этот файл фиксирует краткий прогресс реализации ТЗ:

- [`tz-storage-runtime-dispatch-refactor.md`](./tz-storage-runtime-dispatch-refactor.md)

Цель журнала — дать следующему агенту точку продолжения после сброса контекста. Журнал не заменяет ТЗ, не является changelog и не должен подробно пересказывать diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, если текущий этап не прошел gate из ТЗ.
- Если этап имеет статус `blocked`, не продолжать следующий этап до ручного решения блокера и обновления статуса.
- Обновлять журнал в конце каждого этапа и после значимого промежуточного результата, если этап большой.
- Записи держать короткими: что сделано, какие файлы/модули затронуты, какие проверки запускались, какие риски остались.
- Не фиксировать каждую мелкую правку тестов. Фиксировать закрытие сценариев, coverage gaps, перенос ownership поведения и важные решения.
- Для нового и измененного чистого кода требуется 100% coverage по statements/branches/functions/lines.
- 100% coverage не считается достаточным без сценарных тестов: happy path, негативные type-level контракты, runtime validation, ordering, drop/replacement semantics, middleware interaction и регрессия без plugins.
- Агент не запускает docs build и команды, которые транзитивно запускают docs build.
- При изменении public API или public types обновлять `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `PLUGIN-SYSTEM-CHEATSHEET.md`.
- Это ТЗ не реализует `@lite-fsm/entities`; `reduceScope: "bucket"` должен только подготовить core storage contract для будущего entity runtime.

## Статусы

- `not started` — этап еще не начат.
- `in progress` — этап начат, но критерии приемки или test/coverage gate еще не закрыты.
- `done` — этап реализован, критерии приемки выполнены, проверки и coverage gate закрыты.
- `blocked` — продолжение невозможно без решения, которое должен принять человек.

## Текущий указатель

- Активное ТЗ: `tz-storage-runtime-dispatch-refactor.md`
- Активный этап: Этап 1 — Result protocol и storage context contract
- Статус: `not started`
- Следующее действие: начать этап 1 с обновления storage types, public builder typing и validation tests.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| --- | --- | --- | --- |
| 1 | Result protocol и storage context contract | `not started` | 2026-05-26 |
| 2 | Action pipeline и drop/replacement semantics | `not started` | 2026-05-26 |
| 3 | `reduceScope` и bucket-level scheduling | `not started` | 2026-05-26 |
| 4 | Миграция `instance` storage runtime | `not started` | 2026-05-26 |
| 5 | Public storage builder validation и documentation fixtures | `not started` | 2026-05-26 |
| 6 | Рефакторинг, чистка и полировка | `not started` | 2026-05-26 |
| 7 | Финальная проверка и coverage gate | `not started` | 2026-05-26 |

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
- Совместимость: какие behavior tests подтвердили сохранение public behavior.
- Открыто: конкретные риски, TODO или blocker.
- Следующее действие: один короткий следующий шаг.
```

## Ход реализации

### Этап 1 — Result protocol и storage context contract

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 2 — Action pipeline и drop/replacement semantics

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 3 — `reduceScope` и bucket-level scheduling

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 4 — Миграция `instance` storage runtime

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 5 — Public storage builder validation и documentation fixtures

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 6 — Рефакторинг, чистка и полировка

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 7 — Финальная проверка и coverage gate

Статус: `not started`

Записи:

- Записей пока нет.
