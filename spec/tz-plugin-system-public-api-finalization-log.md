# Журнал реализации ТЗ public plugin API finalization

Этот файл фиксирует краткий прогресс реализации ТЗ:

- [`tz-plugin-system-public-api-finalization.md`](./tz-plugin-system-public-api-finalization.md)

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
- 100% coverage не считается достаточным без сценарных тестов: happy path, негативные type-level контракты, runtime validation, composition errors, взаимодействие нескольких plugins, порядок выполнения и регрессия без plugins.
- Агент не запускает docs build и команды, которые транзитивно запускают docs build.
- Полная документация сайта в `apps/docs` выполняется отдельной задачей; это ТЗ закрывает только cheatsheets, documentation fixture и отсутствие legacy examples.
- Builder plugin values не подключаются к `MachineManager` до этапа 3; этапы 1-2 закрывают builder/local validation и type-level extraction.

## Статусы

- `not started` — этап еще не начат.
- `in progress` — этап начат, но критерии приемки или test/coverage gate еще не закрыты.
- `done` — этап реализован, критерии приемки выполнены, проверки и coverage gate закрыты.
- `blocked` — продолжение невозможно без решения, которое должен принять человек.

## Текущий указатель

- Активное ТЗ: `tz-plugin-system-public-api-finalization.md`
- Активный этап: 1 — Builder API, opaque plugin value и local validation
- Статус: `not started`
- Следующее действие: начать этап 1 с type/runtime tests для builder-style API, opaque plugin marker, conditional `HostEvents` default, local validation и удаления старого public authoring surface; не добавлять runtime tests с `MachineManager(..., { plugins })` до этапа 3.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| --- | --- | --- | --- |
| 1 | Builder API, opaque plugin value и local validation | `not started` | — |
| 2 | Type-level capabilities и helper types | `not started` | — |
| 3 | Normalized registry и встроенный `instance` storage | `not started` | — |
| 4 | `routeMeta` и `manager` | `not started` | — |
| 5 | `intercept` и `hooks` | `not started` | — |
| 6 | `scopedDeps` и `scopedTransition` | `not started` | — |
| 7 | `defineStorageRuntime` и helper types | `not started` | — |
| 8 | Runtime storage section | `not started` | — |
| 9 | Рефакторинг, чистка и полировка | `not started` | — |
| 10 | Документация и финальная проверка | `not started` | — |

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

### Этап 1 — Builder API, opaque plugin value и local validation

Статус: `not started`

Записи:

### Этап 2 — Type-level capabilities и helper types

Статус: `not started`

Записи:

### Этап 3 — Normalized registry и встроенный `instance` storage

Статус: `not started`

Записи:

### Этап 4 — `routeMeta` и `manager`

Статус: `not started`

Записи:

### Этап 5 — `intercept` и `hooks`

Статус: `not started`

Записи:

### Этап 6 — `scopedDeps` и `scopedTransition`

Статус: `not started`

Записи:

### Этап 7 — `defineStorageRuntime` и helper types

Статус: `not started`

Записи:

### Этап 8 — Runtime storage section

Статус: `not started`

Записи:

### Этап 9 — Рефакторинг, чистка и полировка

Статус: `not started`

Записи:

### Этап 10 — Документация и финальная проверка

Статус: `not started`

Записи:
