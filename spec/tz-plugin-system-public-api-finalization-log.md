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

## Статусы

- `not started` — этап еще не начат.
- `in progress` — этап начат, но критерии приемки или test/coverage gate еще не закрыты.
- `done` — этап реализован, критерии приемки выполнены, проверки и coverage gate закрыты.
- `blocked` — продолжение невозможно без решения, которое должен принять человек.

## Текущий указатель

- Активное ТЗ: `tz-plugin-system-public-api-finalization.md`
- Активный этап: 1 — `definePlugin<PluginEvents, HostEvents>().create(...)` и inferred capabilities
- Статус: `not started`
- Следующее действие: начать этап 1 с type tests для builder-style API, conditional `HostEvents` default и удаления старого public authoring surface.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| --- | --- | --- | --- |
| 1 | `definePlugin<PluginEvents, HostEvents>().create(...)` и inferred capabilities | `not started` | — |
| 2 | Declarative runtime registration для `routeMeta`, `manager`, `intercept` и `hooks` | `not started` | — |
| 3 | `scopedDeps` и `scopedTransition` без `keys` и casts | `not started` | — |
| 4 | `defineStorageRuntime`, machine extensions и normalized helper types | `not started` | — |
| 5 | Документация, examples и final verification | `not started` | — |

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

### Этап 1 — `definePlugin<PluginEvents, HostEvents>().create(...)` и inferred capabilities

Статус: `not started`

Записи:

### Этап 2 — Declarative runtime registration для `routeMeta`, `manager`, `intercept` и `hooks`

Статус: `not started`

Записи:

### Этап 3 — `scopedDeps` и `scopedTransition` без `keys` и casts

Статус: `not started`

Записи:

### Этап 4 — `defineStorageRuntime`, machine extensions и normalized helper types

Статус: `not started`

Записи:

### Этап 5 — Документация, examples и final verification

Статус: `not started`

Записи:
