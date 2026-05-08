# Lite FSM Graph Compiler: implementation log

Краткий лог прогресса по [`GRAPH-COMPILER-SPEC.md`](GRAPH-COMPILER-SPEC.md). Это не новая спека, а карточка состояния, чтобы не терять контекст между этапами.

## Состояние

| Поле | Значение |
| --- | --- |
| Дата | 2026-05-08 |
| Готово | Этапы 0-9: IR/API/harness, Source Catalog/Candidates, Partial Evaluator, ConfigGraphCompiler, ManagerLinker/select API, ReducerCompiler, EffectsCompiler, GraphAssembler, общий `compiler/ast.ts`, Semantic Analyzer, headless simulator одной машины (упрощённый pipeline) |
| Package | `@lite-fsm/graph`, private/experimental |
| Public API | `compileLiteFsmGraph(source, options?)`, `selectMachineGraph(document, selector?)`, `analyzeLiteFsmGraph(document, options?)` + IR/analyzer-типы; `@lite-fsm/graph/simulator`: `createGraphSimulator(machine, options?)` + simulator-типы |
| Текущий output | `LiteFsmGraphDocument`: source metadata, compiler diagnostics, machines, linked managers, config states/transitions, reducer cases/transitions, effect emissions и machine facts; `GraphAnalysisResult`: analyzer diagnostics; `GraphSimulator`: symbolic single-machine snapshots, choices, history и suggested emissions |
| Еще не строится | CLI/UI |
| Fixture contract | `tests/graph/fixtures/graph-sources.ts`: 28 machine candidates, 3 manager candidates, полный assembler snapshot |
| Coverage | `packages/graph/src/**/*.ts`, кроме `types.ts`: 100% statements/branches/functions/lines |

## Ключевые решения

- Root public surface оставлен маленьким: `@lite-fsm/graph` экспортирует только `compileLiteFsmGraph`, `selectMachineGraph`, `analyzeLiteFsmGraph` и IR/analyzer-типы.
- `createGraphSimulator` добавлен только в subpath `@lite-fsm/graph/simulator`; root entrypoint не реэкспортирует simulator runtime или simulator-типы.
- `ts-morph` добавлен как direct dependency `@lite-fsm/graph`, потому что compiler парсит строки во время выполнения.
- `SourceAdapter` скрывает `ts-morph`; публичный API не протекает parser-типами.
- Ambient API names распознаются только если нет local/import binding; lookalike imports и alias chains игнорируются.
- `PartialEvaluator` не знает FSM-семантику и возвращает structured `known`/`external`/`dynamic`/`unsupported`.
- `createConfig`, `createReducer`, `createEffect` раскрываются только как transparent parse wrappers в ожидаемых позициях.
- `ConfigGraphCompiler` строит только config layer: states, accepted transitions, `initialState`, `initialContextSummary`, `groupTag`, `persistence` и `kind`.
- `ManagerLinker` раскрывает manager object literals/local const maps через `PartialEvaluator`, связывает inline/referenced machines и заполняет manager refs без пересканирования AST в selector-е.
- `selectMachineGraph` работает только поверх готового `LiteFsmGraphDocument` и возвращает controlled diagnostics для not found/ambiguous selectors.
- Dynamic/external targets сохраняются как dynamic graph targets с diagnostics; unsupported config fragments не валят весь document.
- `ReducerCompiler` извлекает symbolic reducer cases из `switch`, `if`/`else if`/`else`, прямых `state.state` assignments, ternary targets и `return { state }`; `nextState` раскрывается только через join с config/wildcard acceptance.
- Reducer-layer transitions добавляются отдельно от config transitions и не создают acceptance для событий, которых нет в `config`/wildcard.
- `EffectsCompiler` извлекает `GraphEmission` из inline/local effects, `createEffect` wrappers, direct `transition(...)`, domain `meta` routing и actor-only routing sugar; emissions остаются отдельным слоем и не создают state transitions.
- Escaped `transition`, dynamic event type, unsupported effects/effect entries и invalid domain actor routing возвращают compiler diagnostics без падения документа.
- `GraphAssembler` нормализует порядок machines/managers, transitions, reducer cases, emissions и diagnostics, назначает final `machineId` для machine diagnostics и не зависит от AST/pattern matching.
- Graph compiler tests больше не читают `xstate/graph-parser-fixtures.ts`; fixture-кейсы живут в `tests/graph/fixtures/graph-sources.ts`, чтобы `xstate/` можно было удалить отдельно.
- Общие AST-утилиты для feature compilers вынесены в `packages/graph/src/compiler/ast.ts` (`unwrapTransparent`, `propertyNameText`, `bindingNameText`, `readMachineOptions`/`readMachineOption`, `statementsFromBranch`, `isActionTypeAccess`, `condition`, `combineConfidence`, `stringFromExpression`); локальные дубликаты в `candidates`/`config`/`manager`/`reducer`/`effects` удалены.
- Из `pipeline.ts` удалены неиспользуемые `AstNodeRef`/`CompilerPass`/`PatternRule`/`GraphTargetSlice`-алиас; контракты slice-ов и `CompilerContext` остаются единственными внутренними типами pipeline-а.
- Самые большие feature-compiler файлы разнесены в подпапки без изменения публичного контракта: `effects.ts` -> `effects/{setup,routing}.ts`, `reducer.ts` -> `reducer/{setup,writes}.ts`, `evaluator.ts` -> `evaluator/{types,object,wrappers}.ts`, `assembler.ts` -> `assembler/{sort,machine,manager}.ts`. Точки входа (`compileEffectsGraph`, `compileReducerGraph`, `createPartialEvaluator`, `assembleGraphDocument`) и публичные типы остаются в исходных файлах через прямой re-export, тесты `tests/graph/*` и `compile.ts` не правились.
- `analyzeLiteFsmGraph` добавлен как отдельный semantic layer поверх `LiteFsmGraphDocument`; compiler не запускает analyzer автоматически и не мутирует document.
- Analyzer использует внутренний `GraphAnalysisIndex`, `scope` как discriminated union и registry v1 rules: `unknown-target`, `unreachable-state`, `dead-end-state`, `actor-template-shape`, `reducer-config-consistency`, `effect-event-acceptance`, `wildcard-shadowing`.
- Analyzer diagnostics отделены кодами `LFG_ANALYZER_*`; `document.diagnostics` остается слоем compiler diagnostics.
- `GraphSimulator` работает только по `LiteFsmGraphMachine`: не исполняет reducer/effects/user code, а вычисляет accepted config transitions, effective reducer branches, controlled unresolved-target results и suggested emissions.
- Simulator event handling вынесен во внутренний fixed pipeline: prepare command -> resolve candidates -> select branch -> evaluate target -> commit snapshot -> build controlled result. Накопление состояния в одном `TransactionContext` без промежуточных narrowed типов; failure dispatch в один `failure(ctx, ...)` по `command.kind`. `evaluateCandidate` оставлен thin wrapper над `evaluateTarget` как точка расширения для будущего trusted/payload/context evaluator-а без изменения public facade.
- Simulator start/restart не запускает initial effects; emissions появляются только после успешного шага и повторяют runtime precedence: state-specific effect при реальном входе в state, иначе wildcard effect.
- `followEmission` применяет только `routing.kind === "default"`; actor/group/tag/unscoped/unknown routing остаются visible, но не доставляются в simulator одной машины.
- `followEmission` для event с несколькими reducer branches возвращает `ambiguous-transition` с candidates; UI выбирает ветку через `choose`.
- Actor template simulator поддерживает `spawnLifecycle` из `__INIT` и `activeActor` с явным или однозначно выводимым public start state; wildcard transitions/effects не применяются из `__INIT` и terminal pseudo-state.

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

Этап 10 CLI или этап 11 view-model. Time travel, payload-aware simulation и полный context log перенесены в этапы 13-14.
