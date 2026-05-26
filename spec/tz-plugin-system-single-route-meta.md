# Plugin System Single Route Meta — ТЗ для реализации

## 1. Цель

Сделать routing contract plugin system однозначным перед стабильным публичным релизом.

Целевой контракт: один вызов `manager.transition(...)` может иметь только один route constraint. Если `action.meta` содержит несколько известных routing keys, runtime должен завершить dispatch fail-fast с понятной диагностикой. Автоматический fanout, composite routing и неявная доставка через несколько plugin route keys не добавляются.

## 2. Как выполнять это ТЗ

### Область работ

- `packages/core/src/runtime/kernel/routing.ts`
- `packages/core/src/runtime/kernel/createMachineManagerFactory.ts`, только если требуется уточнить место обработки ошибки или тестовый сценарий pipeline.
- `packages/core/src/utils.ts`, если добавляется новый `LiteFsmErrorCode`.
- `tests/core/plugin-system-*.test.ts` или новый focused runtime test для routing ambiguity.
- `tests/types/exports-surface.tst.ts`, только если добавляется новый публичный error code contract.
- `PLUGIN-SYSTEM-CHEATSHEET.md`
- `API-CHEATSHEET.md`
- `TYPES-CHEATSHEET.md`

### Запрещенные команды

Агентам запрещено запускать сборку документации и команды, которые транзитивно ее запускают:

- `pnpm run build`
- `pnpm --filter @lite-fsm/docs build`
- `pnpm run docs:build`
- `pnpm run pages:build*`
- любые `next build` внутри `apps/docs`

Если нужна проверка docs build, передать ее пользователю. Для package build использовать только `pnpm run build:packages`.

### Вне области работ

- Не добавлять multi-route, fanout, composite route, `allOf`, `anyOf`, `dispatch.routes` или scheduler API.
- Не менять delivery semantics для `intercept`, hooks, storage callbacks, subscribers, reactions или effects.
- Не менять плоское пространство keys и не добавлять automatic prefixing.
- Не менять правило, что `routeMeta` resolver валидирует только result, а не raw input value.
- Не менять `ManagerActionMeta<Plugins>` и helper types, кроме документации.
- Не менять priority между single core routes и single plugin route, кроме запрета ambiguous input.
- Не использовать `routeMeta` как generic пользовательскую metadata area.

## 3. Термины и целевой public API

### Routing key

Routing key — это key в `action.meta`, который участвует в выборе `dispatch.route`.

К routing keys относятся:

- core keys: `actorId`, `groupId`, `groupTag`;
- plugin keys, зарегистрированные через section `routeMeta`.

К routing keys не относятся:

- sender keys: `senderActorId`, `senderGroupId`, `senderGroupTag`;
- unknown `meta` fields, для которых нет registered `routeMeta` resolver;
- known routing keys со значением `undefined`.

### `dispatch.route`

`dispatch.route` остается single constraint:

```ts
type RouteConstraint =
  | { readonly scope: "actor"; readonly key: "actorId"; readonly targetSet: string[] }
  | { readonly scope: "plugin"; readonly key: string; readonly targetSet: string[] }
  | { readonly scope: "group"; readonly key: "groupId"; readonly targetSet: string[] }
  | { readonly scope: "tag"; readonly key: "groupTag"; readonly targetSet: string[] }
  | { readonly scope: "unscoped"; readonly key: undefined; readonly targetSet: [] };
```

Контракт не меняет shape `RouteConstraint`. Изменяется только поведение при наличии нескольких routing keys.

### Новый error contract

Добавить новый `LiteFsmErrorCode`:

```ts
"LITE_FSM_AMBIGUOUS_ROUTE_META"
```

Ошибка должна использовать `LiteFsmError`.

Рекомендуемый формат сообщения:

```txt
[lite-fsm] action meta contains multiple route keys: actorId, cacheKey. Use one route key per transition or dispatch separate actions.
```

Требования к диагностике:

- перечислить все обнаруженные routing keys в порядке текущего routing priority;
- не включать sender keys;
- не включать unknown `meta` fields;
- не включать keys со значением `undefined`;
- не вызывать route resolvers, если ambiguity уже обнаружена.

## 4. Целевая архитектура

### Общий алгоритм `resolveRoute`

`createRoutingRuntime().resolveRoute(action)` должен сначала собрать все active routing keys, затем выбрать поведение:

1. Если active routing keys нет, вернуть `unscoped`.
2. Если active routing key один, выполнить прежнюю single-route логику.
3. Если active routing keys больше одного, бросить `LITE_FSM_AMBIGUOUS_ROUTE_META` до вызова любого plugin resolver.

Порядок обнаружения keys:

1. `actorId`
2. registered plugin `routeMeta` keys в порядке регистрации
3. `groupId`
4. `groupTag`

Такой порядок нужен только для стабильной диагностики и сохранения single-route behavior. Он не должен становиться multi-route priority model.

### Сохранение текущего поведения

Для action с одним routing key поведение должно остаться прежним:

- `actorId` формирует `scope: "actor"`;
- один registered plugin key формирует `scope: "plugin"` и вызывает только свой resolver;
- `groupId` формирует `scope: "group"`;
- `groupTag` формирует `scope: "tag"`;
- отсутствие routing keys формирует `scope: "unscoped"`;
- raw values для core routing keys и plugin resolver input не получают новой runtime validation.

### Ошибки в pipeline

Ambiguity error должна бросаться в любом месте, где runtime пересчитывает route:

- initial `createDispatch(...)`;
- replacement из storage `prepareAction`;
- replacement из storage `beforeReduce`;
- replacement из plugin `intercept`.

Ошибка должна прервать текущий dispatch fail-fast:

- state не меняется;
- subscribers не вызываются;
- effects и reactions не запускаются;
- `onError` не вызывается автоматически;
- следующие interceptors/hooks/reducers не выполняются после ошибки.

## 5. Этапы реализации

### Этап 1 — Runtime ambiguity validation

#### Цель

Запретить ambiguous route meta на уровне routing runtime без изменения shape `RouteConstraint`.

#### Зависит от

Не зависит от других этапов.

#### Контракт этапа

- В `routing.ts` добавить сбор active routing keys перед выбором маршрута.
- Active key определяется как known routing key, для которого `meta[key] !== undefined`.
- Sender keys не участвуют в ambiguity detection.
- Unknown `meta` fields не участвуют в ambiguity detection.
- Если active routing keys больше одного, бросить `LiteFsmError` с code `LITE_FSM_AMBIGUOUS_ROUTE_META`.
- Plugin route resolvers не должны вызываться при ambiguous route meta.
- При одном active plugin key resolver вызывается как раньше и его result validation сохраняется.
- При одном core key behavior сохраняется.
- Добавить `LITE_FSM_AMBIGUOUS_ROUTE_META` в `LiteFsmErrorCode`.
- Не менять public shape `RouteConstraint`, `RoutingRuntime`, `ManagerActionMeta`, `PluginRouteMeta`.

#### Не делать в этом этапе

- Не добавлять composite route или массив routes.
- Не менять route resolver return protocol.
- Не валидировать raw route meta values.
- Не менять storage runtime API.

#### Тесты этапа

- Runtime test: `meta: { actorId, groupId }` бросает `LITE_FSM_AMBIGUOUS_ROUTE_META`.
- Runtime test: `meta: { actorId, cacheKey }` бросает `LITE_FSM_AMBIGUOUS_ROUTE_META`.
- Runtime test: `meta: { cacheKey, tenantId }` при двух registered plugin keys бросает `LITE_FSM_AMBIGUOUS_ROUTE_META`.
- Runtime test: `meta: { cacheKey, groupId }` бросает `LITE_FSM_AMBIGUOUS_ROUTE_META`.
- Runtime test: `meta` с sender keys и одним route key не бросает.
- Runtime test: unknown `meta` field рядом с одним route key не бросает.
- Runtime test: route key со значением `undefined` не считается active.
- Runtime test: ambiguous plugin keys не вызывают route resolvers.
- Runtime test: single plugin key сохраняет прежний resolver behavior и target de-duplication.

#### Критерий завершения

- Все ambiguity scenarios покрыты runtime tests.
- Single-route regression tests проходят без изменения ожиданий.
- `LiteFsmErrorCode` содержит новый code.
- Focused Vitest по routing/plugin-system tests проходит.

### Этап 2 — Dispatch pipeline regression coverage

#### Цель

Зафиксировать, что ambiguity error одинаково работает для исходного action и replacement action во всех фазах, где route пересчитывается.

#### Зависит от

Этап 1.

#### Контракт этапа

- Проверить initial action ambiguity на public `manager.transition(...)`.
- Проверить storage `prepareAction` replacement, который добавляет несколько routing keys.
- Проверить storage `beforeReduce` replacement, который добавляет несколько routing keys.
- Проверить plugin `intercept` replacement, который добавляет несколько routing keys.
- Во всех сценариях dispatch должен завершаться fail-fast без commit.
- `onError` не вызывается автоматически.
- State, subscribers, reactions и effects не должны отражать failed dispatch.

#### Не делать в этом этапе

- Не менять порядок фаз pipeline.
- Не менять replacement action validation.
- Не добавлять recovery или fallback route после ambiguity.

#### Тесты этапа

- Focused tests в существующем `callback-validation` или `plugin-system-stage*` файле для replacement phases.
- Проверить код ошибки и фрагмент сообщения со списком keys.
- Проверить, что reducer/subscriber/effect spies не вызваны после ambiguity.
- Проверить, что resolver spy не вызван, если replacement action ambiguous.

#### Критерий завершения

- Все route recalculation paths покрыты.
- Tests доказывают fail-fast behavior и отсутствие `onError`.
- Focused Vitest по callback/routing tests проходит.

### Этап 3 — Документация и cheatsheets

#### Цель

Обновить публичный контракт `routeMeta`: один dispatch имеет один route constraint; fanout выполняется явными отдельными transitions.

#### Зависит от

Этапы 1 и 2.

#### Контракт этапа

- В `PLUGIN-SYSTEM-CHEATSHEET.md` явно описать:
  - `routeMeta` не является пользовательской metadata area;
  - `dispatch.route` является single route constraint;
  - один action может содержать не более одного active routing key;
  - несколько routing keys бросают `LITE_FSM_AMBIGUOUS_ROUTE_META`;
  - для fanout нужно вызвать `manager.transition(...)` несколько раз или отправить unscoped domain event.
- В `API-CHEATSHEET.md` обновить описание `routeMeta` и error semantics.
- В `TYPES-CHEATSHEET.md` обновить описание `ManagerActionMeta`, `PluginRouteMeta` и `ctx.dispatch.route` без изменения типов.
- Документация должна использовать профессиональный русский язык и описывать поведение как контракт.

#### Не делать в этом этапе

- Не добавлять примеры composite routing.
- Не обещать автоматическую доставку всем плагинам по нескольким keys.
- Не описывать порядок keys как supported priority model для multi-route.

#### Тесты этапа

- Runtime и type tests не обязательны, если меняется только документация.
- Запустить `git diff --check`.
- При наличии documentation fixture, обновить его только если он конфликтует с новым контрактом.

#### Documentation acceptance checklist

- `PLUGIN-SYSTEM-CHEATSHEET.md`: есть отдельная формулировка про one route constraint.
- `API-CHEATSHEET.md`: есть error code и рекомендация dispatch separate actions.
- `TYPES-CHEATSHEET.md`: нет формулировок, которые допускают multi-route через несколько `routeMeta` keys.
- Нет обещания, что `routeMeta` keys используются как произвольные пользовательские данные.

#### Критерий завершения

- Все public cheatsheets согласованы.
- В документации отсутствуют формулировки про неявный fanout.
- `git diff --check` проходит.

### Этап 4 — Рефакторинг, чистка и полировка

#### Цель

Убрать временные решения и оставить один владелец routing ambiguity contract.

#### Зависит от

Этапы 1-3.

#### Контракт этапа

Must fix:

- убрать временные helpers, debug logging, TODO/FIXME и dead code в области routing ambiguity;
- не оставлять два разных владельца определения active routing keys;
- сохранить линейный код `validate -> resolve -> return`;
- удалить неиспользуемые imports, locals и test scaffolds;
- убедиться, что error messages не расходятся между tests и документацией;
- проверить, что comments описывают финальный контракт, а не историю обсуждения.

Inspect only:

- декоративные переименования без снижения сложности;
- перенос routing runtime в новые модули;
- micro-optimizations без performance contract;
- изменение existing route resolver order для single-route cases.

#### Не делать в этом этапе

- Не расширять scope на storage hardening или public exports.
- Не менять actor/group routing behavior.
- Не добавлять abstractions без второго места использования.

#### Тесты этапа

- Запустить focused runtime tests, измененные на этапах 1-2.
- Запустить `pnpm run test:types`, если менялся `LiteFsmErrorCode` или public types.
- Запустить `pnpm run check-types`.
- Запустить `pnpm run lint`.
- Запустить `git diff --check`.

#### Критерий завершения

- В активной области нет временного кода и stale comments.
- Focused runtime tests и type/check gates проходят.
- Диагностика и cheatsheets используют один термин: `LITE_FSM_AMBIGUOUS_ROUTE_META`.

## 6. Критерий полной готовности

Работа считается готовой, когда выполнены все условия:

- ambiguous route meta бросает `LITE_FSM_AMBIGUOUS_ROUTE_META` до вызова route resolvers;
- single-route behavior сохранен для `actorId`, `groupId`, `groupTag` и одного plugin `routeMeta` key;
- ambiguity проверяется при initial action и при replacement action из storage/plugin phases;
- failed dispatch не меняет state, не вызывает subscribers/effects/reactions и не вызывает `onError` автоматически;
- `PLUGIN-SYSTEM-CHEATSHEET.md`, `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` описывают one-route contract;
- `pnpm run test`, `pnpm run test:types`, `pnpm run check-types`, `pnpm run lint` проходят;
- `git diff --check` проходит;
- docs build не запускался агентом.
