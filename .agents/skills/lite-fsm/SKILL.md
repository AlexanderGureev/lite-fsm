---
name: lite-fsm
description: "Помогает использовать lite-fsm latest в продуктовых TypeScript/React apps: проектировать app logic как FSM/state machines, писать typed machines, actors, effects, persistence, SSR/hydration, tests и thin UI поверх @lite-fsm/core/@lite-fsm/react."
---

# lite-fsm

## Цель

Используй `lite-fsm` как архитектурный центр логики приложения. Машины, actors, effects и manager wiring владеют поведением; UI читает состояние через selectors/hooks и отправляет domain events.

## Model-first gate

Перед кодом или рефакторингом новой или измененной бизнес-логики кратко зафиксируй модель поведения (5–10 строк в плане, без отдельного документа).

Проверь:

- владельцев ответственности: domain, process, view, technical, observer; при необходимости coordinator;
- нужны ли actor templates для параллельных экземпляров одного процесса;
- состояния, допустимые transitions и события, которые machine должна игнорировать;
- domain events, payload и уровень достоверности события;
- источник истины для каждого поля и derived data для selectors;
- effects и deps, actor routing, persistence, SSR/hydration — только если они нужны для задачи;
- что остается вне machine: разметка, transient UI state и тонкие external adapters.

## Workflow

1. **Project discovery.** Определи package manager, установленные `@lite-fsm/*` (или unscoped `lite-fsm`), React/SSR-контекст и существующие conventions в `src/store`.
2. **Архитектурный контракт.** Для любой новой или измененной бизнес-логики читай `references/business-logic.md`.
3. **Шаблон одной машины.** Канонические сниппеты для domain/process, observer, error catcher, guard-through-reducer, view modal, command/button — в `references/machine-patterns.md`.
4. **Фича из нескольких машин.** Образец, как разложить фичу на 4 связанные машины разных типов, — в `references/feature-example.md`.
5. **Setup store.** Создание `src/store`, provider, typed wrappers, deps wiring — `references/bootstrap.md`.
6. **Специализированные темы по задаче:**
   - actors → `references/actors.md`;
   - technical bridge, coordinator, sub-process handshake, selector projection → `references/system-patterns.md`;
   - async, deps, `createEffect`, `condition`, middleware → `references/effects.md`;
   - persistence → `references/persistence.md`;
   - SSR/Next, hydration → `references/ssr-hydration.md`.
7. **Тесты и проверки.** `references/testing.md`.

## Обязательные правила

- Вся бизнес-логика живет в `lite-fsm`: reducers, effects, actors, coordinator/system machines и deps.
- UI не владеет retry, rollback, orchestration, external subscriptions и cross-machine updates.
- Файловую структуру и владельцев организуй по принципам `references/bootstrap.md`. В существующих проектах сохраняй те же границы, не переименовывай файлы без причины.
- По умолчанию используй `immerMiddleware` и Immer-style reducers.
- Состояния и события называй в `UPPER_SNAKE_CASE`.
- Async результат возвращай событием `*_RESOLVED`/`*_REJECTED`. Если в проекте уже зафиксирована другая конвенция (например, `*_RESOLVE`/`*_REJECT`), следуй ей.
- События типизируй union из `FSMEvent<...>`.
- Для app-level typing используй локальные wrappers `createMachine`, `createConfig`, `createReducer`, `createEffect`.
- Один machine или actor template — один модуль: `src/store/machines/<kebab-case>.ts` для простого случая или `src/store/machines/<kebab-case>/index.ts` с локальными файлами для сложного.
- Узкие чтения делай inline через `useAppSelector(s => s.machine.state === "...")`. Выноси именованный selector в `src/store/selectors/` только если projection агрегирует несколько machines, нетривиальна или переиспользуется в трех и более местах.
- Persistence добавляй только когда состояние должно пережить reload или session break.
- `@lite-fsm/graph` и `@lite-fsm/cli` используй только по явному запросу на graph export, visualizer, static analysis или scaffold; этот skill не описывает их API.

## Entrypoints

- `@lite-fsm/core` — `createMachine`, `createConfig`, `createReducer`, `createEffect`, `MachineManager`, `FSMEvent`, typed factory aliases (`TypedCreateMachineFn`, `TypedCreateConfigFn`, `TypedCreateReducerFn`, `TypedCreateEffectFn`), core types.
- `@lite-fsm/react` — `FSMContextProvider`, `FSMHydrationBoundary`, `useManager`, `useSelector`, `useTransition`, typed hook aliases (`TypedUseManagerHook`, `TypedUseSelectorHook`, `TypedUseTransitionHook`). Пакет помечен `"use client"`.
- `@lite-fsm/middleware/immer` — `immerMiddleware`.
- `@lite-fsm/middleware/devTools` — `devToolsMiddleware`.
- `@lite-fsm/persist` — `persistManager`, `createJsonStorage`, `PersistStorage`.
- `@lite-fsm/persist/react` — persist status hooks.

## Если API неясен

Проверь установленную версию `@lite-fsm/*` (или `lite-fsm`) в `package.json`, lockfile или `node_modules`. Для точных сигнатур смотри typings установленного пакета. Если пакет не установлен и typings недоступны, опирайся на bundled references и явно отметь предположение. При доступной сети сверься с официальной документацией/README `lite-fsm`; не полагайся на локальные файлы репозитория `lite-fsm`.

Не выдумывай entrypoints, методы, payload shapes и options.

## Финальная проверка

- `config` явно принимает допустимые события; отсутствие перехода означает игнорирование.
- Reducer меняет только свой slice; cross-machine updates идут через events.
- Effects читают root через `getState` и отправляют events, но не мутируют чужой state.
- Actors используются для независимых параллельных процессов с собственным lifecycle.
- Проверки выбраны из проекта; если не запускались, это сказано явно.
