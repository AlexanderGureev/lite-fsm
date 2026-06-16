# Журнал реализации ТЗ @lite-fsm/entities reducer `entities()` access

ТЗ: [`tz-entities-reducer-entities-access.md`](./tz-entities-reducer-entities-access.md)

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

- Активное ТЗ: `spec/tz-entities-reducer-entities-access.md`
- Активный этап: Финальная проверка
- Статус: `done`
- Следующее действие: готово к review/commit.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 1 | Runtime и базовый тип `entities()` в entity reducer | `done` | 2026-06-16 |
| 2 | Public types и strict reducer access | `done` | 2026-06-16 |
| 3 | Ordered live semantics и snapshot/hydrate regression | `done` | 2026-06-16 |
| 4 | Документация, examples и cheatsheets | `done` | 2026-06-16 |
| 5 | Рефакторинг, чистка и полировка | `done` | 2026-06-16 |

## Ход реализации

### Этап 1 — Runtime и базовый тип `entities()` в entity reducer

Статус: `done`

Исполнитель: `019ed0be-db6e-72c2-9542-32d568e926db`

Corrective: `0/3`

Baseline:

- `git status --short`: чисто.
- `git diff`: без изменений.
- `git diff --staged`: без изменений.
- Active scope: `packages/entities/src/machine-extension.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/access.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/reactions.ts`, `packages/entities/src/runtime/effects.ts`, `packages/entities/src/plugin.ts`, `tests/entities/entities-reducer-self.test.ts`, `tests/entities/entities-reducer-post-processing.test.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`.
- Out-of-scope: docs/examples/cheatsheets до этапа 4, strict `AppDeps.entities` typing до этапа 2, ordered live regression suite до этапа 3, effects/reactions runtime changes, docs build commands.

Записи:

- 2026-06-16 — write-ahead dispatch этапа 1. Состояние дерева чистое, чужих и out-of-scope изменений нет. Исполнитель должен менять только runtime/type/test scope этапа 1, журнал не редактировать.
- 2026-06-16 — этап принят. Stage-owned delta: `EntityReducerContext` получил широкий `entities()`, `reduceAcceptedBatch(...)` передает `runtime.access` в reducer context, добавлен guard Promise result с `LiteFsmError`, добавлен focused runtime suite `tests/entities/entities-reducer-entities-access.test.ts`, обновлен `tests/types/entities-api.tst.ts` для широкого reducer access. Проверки: `pnpm exec vitest run tests/entities/entities-reducer-entities-access.test.ts tests/entities/entities-reducer-self.test.ts tests/entities/entities-reducer-post-processing.test.ts` — pass; `pnpm exec vitest run tests/entities/entities-plugin.test.ts` — pass; `pnpm --filter @lite-fsm/entities run check-types` — pass; `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass; `git diff --check` — pass. Coverage: focused runtime tests добавлены, полный `pnpm run test:coverage` остается final gate. Риски: strict `AppDeps.entities` typing, ordered live regression и docs еще не выполнены по этапам 2-4.

### Этап 2 — Public types и strict reducer access

Статус: `done`

Исполнитель: `019ed0c6-2bae-7840-9573-94d5373b305e`

Corrective: `0/3`

Baseline:

- `git status --short`: `M packages/entities/src/machine-extension.ts`, `M packages/entities/src/runtime/reduce.ts`, `M spec/tz-entities-reducer-entities-access-log.md`, `M tests/types/entities-api.tst.ts`, `?? tests/entities/entities-reducer-entities-access.test.ts`.
- `git diff --stat`: stage 1 runtime/type/log delta; новый untracked focused runtime test входит в baseline этапа 2.
- `git diff --staged`: без изменений.
- Active scope: `packages/entities/src/machine-extension.ts`, `tests/types/entities-api.tst.ts` и связанные type regression files, если strict reducer context требует их обновления.
- Out-of-scope: runtime behavior, effects/reactions runtime, `EntityAccess` public shape, core type machinery, app-level builder, documentation/cheatsheets до этапа 4, ordered runtime regression suite до этапа 3, docs build commands.

Записи:

- 2026-06-16 — write-ahead dispatch этапа 2. Baseline содержит принятую delta этапа 1 и журнал; чужих изменений нет. Исполнитель должен менять только type-level scope этапа 2, журнал не редактировать.
- 2026-06-16 — этап принят. Stage-owned delta: `EntityReducerContext` получил generic `AppDeps = unknown`, reducer `entities()` типизируется через private `EntityReducerEntityAccess<AppDeps>`, `EntityMachineExtension.reducerContext` прокидывает `AppDeps`, `tests/types/entities-api.tst.ts` покрывает strict keys, fallback, read-only foreign columns, mutable `self`, arity compatibility и отсутствие `entities` у обычных reducers. Проверки: `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass; `pnpm run test:types` — pass; `pnpm --filter @lite-fsm/entities run check-types` — pass; `git diff --check` — pass. Public exports audit: `EntityReducerEntityAccess` найден только как private helper в `packages/entities/src/machine-extension.ts`. Coverage: не применимо, runtime behavior не менялся. Риски: ordered runtime semantics и docs остаются этапами 3-4.

### Этап 3 — Ordered live semantics и snapshot/hydrate regression

Статус: `done`

Исполнитель: `019ed0cb-45cd-7481-8354-72f636778113`

Corrective: `0/3`

Baseline:

- `git status --short`: `M packages/entities/src/machine-extension.ts`, `M packages/entities/src/runtime/reduce.ts`, `M spec/tz-entities-reducer-entities-access-log.md`, `M tests/types/entities-api.tst.ts`, `?? tests/entities/entities-reducer-entities-access.test.ts`.
- `git diff --stat`: stage 1-2 runtime/type/log delta; новый untracked focused runtime test входит в baseline этапа 3.
- `git diff --staged`: без изменений.
- Active scope: `tests/entities/**` runtime regression tests; runtime source только если тесты выявят дефект контракта этапов 1-3.
- Out-of-scope: strict type work, docs/examples/cheatsheets до этапа 4, RTS demo, performance benchmarks, snapshot-before-tick mode, warnings для чтения later machine, graph/devtools, docs build commands.

Записи:

- 2026-06-16 — write-ahead dispatch этапа 3. Baseline содержит принятую delta этапов 1-2 и журнал; чужих изменений нет. Исполнитель должен менять только runtime test scope этапа 3, журнал не редактировать.
- 2026-06-16 — этап принят. Stage-owned delta: `tests/entities/entities-reducer-entities-access.test.ts` расширен ordered ECS сценариями для `commandActor`, `movementActor`, `combatActor`, `healthActor`; покрыты live reads предыдущих reducers, чтение future machine текущего значения, reverse order, cyclic reads, optional rows через `has(entity)`, self/root access, routed/spawn access и `dehydrate()`/`hydrate()` round-trip public/storage slices. Runtime source не менялся. Проверки: `pnpm exec vitest run tests/entities/entities-reducer-entities-access.test.ts` — pass; `pnpm exec vitest run tests/entities/entities-plugin.test.ts` — pass; `pnpm run test:coverage` — pass, 100% statements/branches/functions/lines; `git diff --check` — pass. Риски: документация и cheatsheets еще не обновлены.

### Этап 4 — Документация, examples и cheatsheets

Статус: `done`

Исполнитель: `019ed0d1-596f-73e3-bb9e-274f1e4f8beb`

Corrective: `1/3`

Baseline:

- `git status --short`: `M packages/entities/src/machine-extension.ts`, `M packages/entities/src/runtime/reduce.ts`, `M spec/tz-entities-reducer-entities-access-log.md`, `M tests/types/entities-api.tst.ts`, `?? tests/entities/entities-reducer-entities-access.test.ts`.
- `git diff --stat`: stage 1-3 runtime/type/test/log delta; новый untracked focused runtime test входит в baseline этапа 4.
- `git diff --staged`: без изменений.
- Active scope: `packages/entities/README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`; type tests только если docs examples требуют проверки типов.
- Out-of-scope: docs build commands, RTS demo rewrite, performance benchmark, Redux DevTools time travel promises, graph/devtools, runtime/type behavior changes.

Записи:

- 2026-06-16 — write-ahead dispatch этапа 4. Baseline содержит принятую delta этапов 1-3 и журнал; чужих изменений нет. Исполнитель должен менять только documentation scope этапа 4, журнал не редактировать.
- 2026-06-16 — corrective 1/3. Review выявил смешение root access и scoped access в cheatsheets: `manager.entities()` и reducer `entities()` являются root access, а scoped validation `get` относится к `entities()` внутри effects/reactions. Нужно уточнить формулировки без изменения runtime/type behavior.
- 2026-06-16 — этап принят после corrective 1/3. Stage-owned delta: `packages/entities/README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` описывают `entities()` в entity system reducer, live ordered semantics, root access без scoped validation, strict typing через `AppDeps.entities`, fallback и read-only foreign columns; добавлен `TICK` пример с чтением `health` и mutation только `self`; anti-pattern `reaction -> orchestrator -> scratch -> flush events` отмечен как нежелательный hot-path. Проверки: `git diff --check` — pass; `pnpm run test:types` — pass. Source audit: stale snapshot wording для reducer access не найден, `reaction -> orchestrator` встречается только как anti-pattern note, docs build commands не запускались. Coverage: не применимо, docs-only.

### Этап 5 — Рефакторинг, чистка и полировка

Статус: `done`

Исполнитель: `019ed0d8-42be-7f93-bdcd-cea917dbdbf4`

Corrective: `0/3`

Baseline:

- `git status --short`: `M API-CHEATSHEET.md`, `M TYPES-CHEATSHEET.md`, `M packages/entities/README.md`, `M packages/entities/src/machine-extension.ts`, `M packages/entities/src/runtime/reduce.ts`, `M spec/tz-entities-reducer-entities-access-log.md`, `M tests/types/entities-api.tst.ts`, `?? tests/entities/entities-reducer-entities-access.test.ts`.
- `git diff --stat`: stage 1-4 runtime/type/test/docs/log delta; новый untracked focused runtime test входит в baseline этапа 5.
- `git diff --staged`: без изменений.
- Active scope: already touched runtime/type/test/docs files; минимальные cleanup edits only.
- Out-of-scope: new public API, new behavior contracts, broad refactor, effects/reactions pipeline changes, docs build commands.

Записи:

- 2026-06-16 — write-ahead dispatch этапа 5. Baseline содержит принятую delta этапов 1-4 и журнал; чужих изменений нет. Исполнитель должен выполнять cleanup только в active scope, журнал не редактировать.
- 2026-06-16 — этап принят. Stage-owned delta: `packages/entities/src/runtime/reduce.ts` инлайнит одноразовый Promise error helper, `TYPES-CHEATSHEET.md` убирает foreign-write snippet из примера и оставляет текстовый read-only контракт. Cleanup audit: TODO/FIXME/debugger/debug logging в runtime/test active scope не найдены; `EntityReducerEntityAccess` не экспортируется; duplicate owner для `AppDeps.entities` не найден; `snapshot-before-tick` не описан как реализованный режим; `reaction -> orchestrator -> scratch -> flush events` встречается только как anti-pattern note; `reducer.*transition` hits классифицированы как routed test или unrelated graph/core docs. Проверки: `pnpm exec vitest run tests/entities/entities-reducer-entities-access.test.ts` — pass; `pnpm exec vitest run tests/entities/entities-reducer-self.test.ts tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-plugin.test.ts` — pass; `pnpm run lint` — pass; `pnpm run test:types` — pass; `git diff --check` — pass. Coverage: не изменялась в cleanup; полный gate будет выполнен в финальной проверке.

## Финальная проверка

- Статус: `done`
- Записи:
  - 2026-06-16 — финальный readiness gate пройден на интегрированной delta всех этапов. Команды: `pnpm run test:coverage` — pass, 100% statements/branches/functions/lines; `pnpm run test:types` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass; `pnpm run build:packages` — pass; `git diff --check` — pass. Audit: все этапы `done`, executor ids уникальны, `EntityReducerEntityAccess` не экспортируется, runtime/tests/docs покрывают public events, `ENTITY_SPAWNED`, routed transitions, ordered live semantics, reverse order, optional rows, self live read, hydrate/dehydrate и Promise error. Docs отражают reducer/reactions/effects responsibilities и ordered entity systems semantics. RTS demo, performance benchmark, graph/devtools и docs build не выполнялись. Остаточные риски: нет известных.
