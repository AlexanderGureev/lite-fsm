# Lite FSM Graph Compiler: implementation log

Краткий лог прогресса по [`GRAPH-COMPILER-SPEC.md`](GRAPH-COMPILER-SPEC.md). Это не новая спека, а карточка состояния, чтобы не терять контекст между этапами.

## Состояние

| Поле | Значение |
| --- | --- |
| Дата | 2026-05-07 |
| Готово | Этапы 0-4: IR/API/harness, Source Catalog/Candidates, Partial Evaluator, ConfigGraphCompiler, ManagerLinker/select API |
| Package | `@lite-fsm/graph`, private/experimental |
| Public API | `compileLiteFsmGraph(source, options?)`, `selectMachineGraph(document, selector?)` + IR-типы |
| Текущий output | config-only `LiteFsmGraphDocument`: source metadata, diagnostics, machines, linked managers, config states/transitions и machine facts |
| Еще не строится | reducer cases, effect emissions, analyzer, simulator, CLI/UI |
| Fixture contract | `xstate/graph-parser-fixtures.ts`: 28 machine candidates, 3 manager candidates |
| Coverage | `packages/graph/src/**/*.ts`, кроме `types.ts`: 100% statements/branches/functions/lines |

## Ключевые решения

- Public surface оставлен маленьким: runtime exports пока только `compileLiteFsmGraph`.
- `selectMachineGraph`, `analyzeLiteFsmGraph`, `createGraphSimulator` не добавлены до своих этапов.
- `ts-morph` добавлен как direct dependency `@lite-fsm/graph`, потому что compiler парсит строки во время выполнения.
- `SourceAdapter` скрывает `ts-morph`; публичный API не протекает parser-типами.
- Ambient API names распознаются только если нет local/import binding; lookalike imports и alias chains игнорируются.
- `PartialEvaluator` не знает FSM-семантику и возвращает structured `known`/`external`/`dynamic`/`unsupported`.
- `createConfig`, `createReducer`, `createEffect` раскрываются только как transparent parse wrappers в ожидаемых позициях.
- `ConfigGraphCompiler` строит только config layer: states, accepted transitions, `initialState`, `initialContextSummary`, `groupTag`, `persistence` и `kind`.
- `ManagerLinker` раскрывает manager object literals/local const maps через `PartialEvaluator`, связывает inline/referenced machines и заполняет manager refs без пересканирования AST в selector-е.
- `selectMachineGraph` работает только поверх готового `LiteFsmGraphDocument` и возвращает controlled diagnostics для not found/ambiguous selectors.
- Dynamic/external targets сохраняются как dynamic graph targets с diagnostics; unsupported config fragments не валят весь document.

## Проверки

Последний успешный набор:

```txt
pnpm exec vitest run tests/graph
pnpm exec vitest run tests/graph --coverage --coverage.include 'packages/graph/src/**/*.ts' --coverage.exclude 'packages/graph/src/types.ts'
pnpm --filter @lite-fsm/graph check-types
pnpm --filter @lite-fsm/graph build
pnpm exec tsc --noEmit -p tsconfig.test.json
pnpm run lint
pnpm run test:types
```

Root/docs build не запускался.

## Следующий этап

Этап 5: reducer branch compiler.

Он должен извлекать reducer cases и reducer-layer transitions из поддержанных `switch`/`if`/`return { state }` форм, не проверяя consistency с config.
