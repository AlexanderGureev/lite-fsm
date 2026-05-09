# Lite FSM Graph Compiler: implementation log

Краткий лог прогресса по [`GRAPH-COMPILER-SPEC.md`](GRAPH-COMPILER-SPEC.md). Это не новая спека, а карточка состояния, чтобы не терять контекст между этапами.

## Состояние

| Поле             | Значение                                                                                                                                                                                                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Дата             | 2026-05-09                                                                                                                                                                                                                                                                                                        |
| Готово           | Этапы 0-9 IR/API/harness, Source Catalog/Candidates, Partial Evaluator, ConfigGraphCompiler, ManagerLinker/select API, ReducerCompiler, EffectsCompiler, GraphAssembler, общий `compiler/ast.ts`, Semantic Analyzer, Simulator, этап 11 view-model projection, этапы 12a architecture foundation, 12b visual direction и 12b-shadcn-foundation |
| Package          | `@lite-fsm/graph`, private/experimental                                                                                                                                                                                                                                                                           |
| Public API       | `compileLiteFsmGraph(source, options?)`, `selectMachineGraph(document, selector?)`, `analyzeLiteFsmGraph(document, options?)`, `@lite-fsm/graph/simulator`, `@lite-fsm/graph/view-model` + IR/analyzer/simulator/view-model-типы |
| Текущий output   | `LiteFsmGraphDocument`: source metadata, compiler diagnostics, machines, linked managers, config states/transitions, reducer cases/transitions, effect emissions, machine facts и `initialContextJson`; `GraphAnalysisResult`: analyzer diagnostics; `GraphSimulationSnapshot`: slices/timeline/choices/emissions |
| Еще не строится  | CLI, полноценные Source/L1/L2/L3 visualizer flows, manual simulation UI и source overlay behavior                                                                                                                                                                                                                  |
| Fixture contract | `tests/graph/fixtures/graph-sources.ts`: 28 machine candidates, 3 manager candidates, полный assembler snapshot                                                                                                                                                                                                   |
| Coverage         | `apps/visualizer` pure logic на последнем 12b-shadcn-foundation прогоне: 100% statements/branches/functions/lines                                                                                                                                                                                                 |

## Ключевые решения

- Root public surface оставлен маленьким: `@lite-fsm/graph` экспортирует только `compileLiteFsmGraph`, `selectMachineGraph`, `analyzeLiteFsmGraph` и IR/analyzer-типы.
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
- Compiler теперь заполняет `LiteFsmGraphMachine.initialContextJson` только для JSON-safe object initial context; simulator использует его как стартовый context и не реконструирует данные из `initialContextSummary.text`.
- `@lite-fsm/graph/simulator` добавлен как отдельный subpath export; root `@lite-fsm/graph` не реэкспортирует simulator runtime, но экспортирует общие `GraphJsonValue`/`GraphJsonObject` IR-типы.
- Simulator реализован как headless symbolic runtime с document/manager/machines scope, deterministic domain/actorTemplate slices, immutable snapshot, timeline graph, manual effect emissions, object events with payload/meta, branch/evaluation policies и controlled `LFG_SIM_*` diagnostics.
- Dispatch идет через общий bus: selected/routed consumers commit-ятся атомарно, reducer branches уточняют только accepted config edges, state-specific acceptance приоритетнее wildcard, external empty-consumption dispatch считается successful step.
- `@lite-fsm/graph/view-model` добавлен как отдельный subpath export; root `@lite-fsm/graph` не реэкспортирует view-model.
- View-model строит read-only visualizer projection: machine/manager summaries, event topic catalog, relation index, workbench rows, source/diagnostic anchors, simulation overlay flags и canonical row mappings.
- Folded reducer branches, которые не добавляют информации к config edge, представлены через `GraphConfigRow.foldedReducerTransitionIds`; mapping simulator refs к `rowId` централизован в `GraphVisualizerRowMappingIndex`.
- `apps/visualizer` создан как private Vite/React app для Stage 12a с app/workbench/source/services/diagnostics/console/codegen/validation/cards/canvas boundaries, static host adapter, no-op codegen/validation/canvas и strict coverage для pure logic.
- Stage 12b зафиксировал отдельный app-local дизайн visualizer-а в `apps/visualizer/DESIGN.md`; root `DESIGN.md` остается спецификацией playground и не расширяется ради visualizer-а.
- Visualizer shell теперь использует 12b dark dense tool tokens и static style fixture для tabs, source snippet, machine card rows, semantic badges, console diagnostics, timeline, focus-visible и long-label wrapping без реализации Source/L1/L2/L3 graph behavior.
- `lucide-react` добавлен как зависимость `@lite-fsm/visualizer` для стандартных UI icon affordances; custom SVG icon system не вводился.
- Stage 12b-shadcn-foundation добавил app-local shadcn/Tailwind v4 foundation внутри `apps/visualizer`: `components.json`, generated baseline components в `src/ui`, `cn` в `src/lib/utils` и semantic theme bridge в `src/styles.css`.
- Visualizer shell пересобран на shadcn primitives (`Tabs`, `Button`, `Badge`, `Input`, `Textarea`, `Select`, `Card`, `Separator`, `ScrollArea`, `Tooltip`, `Alert`) и thin presentational wrappers для graph grammar без graph behavior/source pipeline/simulation logic.
- `apps/visualizer/DESIGN.md` расширен разделом `UI kit`, который фиксирует shadcn ownership, allowed variants, Tailwind token policy, CSS ownership и custom graph-specific grammar.

## Проверки

Последний успешный набор для Stage 12b-shadcn-foundation:

```txt
pnpm --filter @lite-fsm/visualizer check-types
pnpm --filter @lite-fsm/visualizer build
pnpm --filter @lite-fsm/visualizer test:coverage
pnpm --filter @lite-fsm/visualizer test:e2e
```

Root/docs build не запускался.

Дополнительная visual QA: `agent-browser` screenshots для `1440x900`,
`1280x560` и `360x720`; horizontal overflow во всех трех viewports отсутствует.

## Следующий этап

Этап 12c: source pipeline и console.
