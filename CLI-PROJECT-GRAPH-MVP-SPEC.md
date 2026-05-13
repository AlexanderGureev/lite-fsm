# Lite FSM CLI project graph export: MVP spec

Статус: готово к реализации MVP.

## Как использовать split

Для каждого LLM-захода передавать только:

1. этот index-файл;
2. [лог реализации](CLI-PROJECT-GRAPH-MVP-IMPLEMENTATION-LOG.md);
3. нужный stage-файл: `stage-1`, `stage-2` или `stage-3`.

После выполнения acceptance gate этапа обновлять лог реализации. Index содержит
общий contract, fixtures, глобальные запреты и финальную приемку; stage-файлы
содержат только stage-specific scope, tests, verification и acceptance gate.

## Навигация

- [Этап 1: Graph Compiler](CLI-PROJECT-GRAPH-MVP-SPEC.stage-1.md)
- [Этап 2: CLI](CLI-PROJECT-GRAPH-MVP-SPEC.stage-2.md)
- [Этап 3: Visualizer](CLI-PROJECT-GRAPH-MVP-SPEC.stage-3.md)
- [Лог реализации](CLI-PROJECT-GRAPH-MVP-IMPLEMENTATION-LOG.md)

## Контекст и цель

Цель MVP — минимальным количеством кода статически найти `lite-fsm` graph в проекте по entrypoint-файлу с `MachineManager(...)` и передать готовый `LiteFsmGraphDocument` в visualizer.

MVP не должен превращать CLI в bundler/codegen. CLI не генерирует synthetic TypeScript source, не склеивает исходники, не переименовывает локальные bindings, не переписывает references и не создает placeholders. Задача CLI — только подготовить project host: filesystem, tsconfig, module resolution и source cache.

Вся graph-specific логика должна жить в `@lite-fsm/graph`. Graph compiler через `compileLiteFsmGraphProject` получает entrypoint и host, сам находит `MachineManager`, разрешает referenced machines через imports/barrels и собирает graph document.

Project graph construction — отдельная задача от полноты compiler semantics.
Project compiler должен включать найденные machines в `LiteFsmGraphDocument`,
даже если compile config/reducer/effects для отдельных machines возвращает
partial diagnostics.

Критерий готовности MVP — не абстрактный resolver, а успешная статическая
сборка graph document из канонической `real-store-shape` fixture. Existing
playground example stores в `apps/playground/app/examples/*/store` остаются
compatibility smoke checks: они не расширяют обязательный compiler scope и
блокируют MVP только если ломается shape, уже явно описанный в этом документе.
Эти fixtures проверяют project graph construction без превращения CLI в
bundler/codegen.

## Правила реализации

1. Этапы выполнять строго по порядку: Graph Compiler -> CLI -> Visualizer.
2. Не переходить к следующему этапу, пока текущий acceptance gate не выполнен.
3. При изменении public API/types обновить `API-CHEATSHEET.md` и
   `TYPES-CHEATSHEET.md`, если они покрывают затронутый API.
4. Не запускать docs build commands: `pnpm run build`,
   `pnpm --filter @lite-fsm/docs build`, `pnpm run docs:build`,
   `pnpm run pages:build*` и любые `next build` внутри `apps/docs`.

## Результат MVP

Реализовать project-aware export graph pipeline:

```bash
lite-fsm export-graph --entry path/to/app-entry.ts --out lite-fsm.graph.json
```

Команда должна:

1. найти выбранный `MachineManager(...)` в entrypoint;
2. статически прочитать manager machine map;
3. разрешить referenced machines через imports/barrels;
4. скомпилировать найденные `createMachine({ ... })` в один
   `LiteFsmGraphDocument`;
5. записать JSON export document для visualizer.

MVP считается готовым только после прохождения всех трех этапов и финальных
критериев приемки.

## Общий объем MVP

В MVP входят:

1. пакет `@lite-fsm/cli`;
2. command `export-graph`;
3. options `--entry`, `--out`, `--tsconfig`;
4. public graph API `compileLiteFsmGraphProject`;
5. parsing `.ts`;
6. direct imports из `@lite-fsm/core`;
7. direct imports из `lite-fsm`, который временно считается alias-ом
   `@lite-fsm/core`;
8. simple typed helper wrappers для `createMachine`, `createConfig`,
   `createReducer` и `createEffect`;
9. `MachineManager(...)` в entrypoint;
10. manager map как inline object literal или same-file `const` object literal;
11. manager entries как identifiers из same-file/imported bindings;
12. namespace imports из project barrel:
    `import * as machines from "./machines"`;
13. same-file namespace destructuring с object rest:
    `const { root, ...rest } = machines`;
14. manager map object spreads из resolved same-file object bindings и
    namespace rest bindings;
15. same-file/imported declarations вида
    `const machine = createMachine({ ... })`;
16. named imports из project source;
17. named barrel re-exports:
    `export { a } from "./a"` и `export { a as b } from "./a"`;
18. deterministic JSON output;
19. file-aware source locations в graph document;
20. простой visualizer file input для загрузки готового graph document без
    повторного compile source.
21. extensionless TypeScript module resolution для `.ts` files и directory
    `index.ts`;
22. project-local alias imports, если выбранный tsconfig resolves их внутрь
    project root;
23. non-blocking compatibility smoke с existing playground example stores:
    `apps/playground/app/examples/*/store/index.ts`.

## Canonical MVP Fixtures

MVP обязан покрыть одну blocking fixture group и одну smoke fixture group:

1. `real-store-shape`: fixture в `packages/graph/test-fixtures/real-store-shape/`.
   Она фиксирует архитектуру текущего `store/`, чтобы реальный каталог `store/`
   можно было удалить без потери contract tests.
2. `playground-examples`: existing entries
   `apps/playground/app/examples/*/store/index.ts`. Это smoke checks для
   регрессий на уже поддержанных shape; они не добавляют новые обязательные
   compiler semantics к MVP.

### Real Store Shape Fixture

Fixture закоммичена как source files и читается тестами через filesystem/host,
а не импортируется как TypeScript module. Она не должна попадать в root
`tsconfig.test.json` или package `tsconfig.json` как компилируемый test module.

Файлы fixture:

```txt
packages/graph/test-fixtures/real-store-shape/
  tsconfig.json
  store/
    index.ts
    create-machine.ts
    types.ts
    machines/
      index.ts
      root/index.ts
      router/index.ts
      theme/index.ts
      app-analytics/index.ts
      app-analytics/events/navigation.ts
      app-analytics/effects/ui-button-click.ts
```

Основные ссылки:

1. [`tsconfig.json`](packages/graph/test-fixtures/real-store-shape/tsconfig.json)
2. [`store/index.ts`](packages/graph/test-fixtures/real-store-shape/store/index.ts)
3. [`store/create-machine.ts`](packages/graph/test-fixtures/real-store-shape/store/create-machine.ts)
4. [`store/machines/index.ts`](packages/graph/test-fixtures/real-store-shape/store/machines/index.ts)

Эти файлы фиксируют manager map, typed wrappers, namespace barrel и namespace
rest shape для будущих tests.

Обязательные acceptance expectations для `real-store-shape`:

1. `store/index.ts` выбирается как entrypoint.
2. `MachineManager` из `lite-fsm` проходит provenance как core manager.
3. Imports, не достижимые из выбранного manager map, игнорируются. В fixture это
   `@player/services`, `lite-fsm/middleware`, runtime services, hooks,
   selectors и любые helper functions вне `cfg`/machine declarations.
4. `import * as webMachines from "./machines"` раскрывается через named barrel.
5. Directory targets вроде `./root` resolves в `./root/index.ts`.
6. `const { root, ...rest } = webMachines` раскрывает `root` отдельно, а
   `rest` как остальные named exports barrel в исходном порядке.
7. `cfg = { root, ...rest, ...playerMachines }` дает local machine entries для
   `root` и `rest`.
8. Output manager содержит ровно эти local machine keys в таком порядке:
   `root`, `router`, `theme`, `appAnalytics`, `eventNavigation`.
9. `...playerMachines` из `@player/store` дает warning
   `LFG_PROJECT_MANAGER_SPREAD_UNRESOLVED` и не блокирует output, потому что
   local machine entries уже найдены.
10. `@/store/create-machine` resolves через fixture tsconfig paths.
11. Typed wrappers из `store/create-machine.ts` доказываются для
   `createMachine`, `createConfig`, `createReducer` и `createEffect`.
12. Machines с inline config, `createConfig`, `createReducer`, local
    `createEffect`, imported effect helper и effect call inside effect body
    включаются в graph document.
13. Effect helper call `uiButtonClickEffect(deps)` внутри effect body не
    требует deep expansion imported function body. Допустим partial diagnostic,
    если текущий compiler semantics не умеет вывести emission через этот call.
14. JSON export не содержит source text.

### Playground Examples Compatibility

MVP выполняет smoke check existing playground stores по entrypoint:

```txt
apps/playground/app/examples/*/store/index.ts
```

Supported shape для examples не должен расширять MVP за пределы уже описанных
правил:

1. `MachineManager` импортируется из `@lite-fsm/core`.
2. Manager map является same-file `const` или `export const` object literal.
3. Manager map entries являются shorthand identifiers.
4. Machine entries импортируются direct named imports из relative `.ts` files:
   `import { likes } from "./machines/likes"`.
5. Machine files импортируют typed wrapper через relative import:
   `import { createMachine } from "../create-machine"`.
6. Typed wrapper в `store/create-machine.ts` является simple wrapper над
   `createMachine` из `@lite-fsm/core`.
7. Manager factory может быть arrow expression, который directly returns
   `MachineManager(...)`, или block body с `const manager =
   MachineManager(...); manager.setDependencies(...); return manager;`.
8. `manager.setDependencies(...)`, persist setup, middleware imports,
   non-lite-fsm imports и runtime helper functions игнорируются как code outside
   selected manager map.
9. `apps/playground/tsconfig.json` path alias `@/*` должен поддерживаться host,
   но compiler не обязан сканировать examples без explicit `--entry`.

Smoke проверка готовности examples:

1. Для каждого entry из manifest ниже CLI command с `--entry` и `--tsconfig
   apps/playground/tsconfig.json` пишет JSON.
2. Для каждого entry из manifest output содержит ровно expected local machine
   keys из manager map, в указанном порядке.
3. Для manifest entries не должно быть blocking diagnostics.
4. Если новый или измененный playground example требует shape из `Не входит в
   MVP`, manifest обновляется в том же PR: entry либо получает expected keys,
   либо явный skip reason. Silent skip по glob запрещен.

Manifest current playground smoke entries:

| Entry | Expected local machine keys |
| ----- | --------------------------- |
| `apps/playground/app/examples/actor-canvas/store/index.ts` | `canvasBoard`, `canvasNetwork`, `canvasStroke` |
| `apps/playground/app/examples/album-download/store/index.ts` | `albumDownload`, `trackDownload` |
| `apps/playground/app/examples/lamp/store/index.ts` | `lamp` |
| `apps/playground/app/examples/likes-v2/store/index.ts` | `likesV2`, `likeSync` |
| `apps/playground/app/examples/likes/store/index.ts` | `likes`, `likesPending` |
| `apps/playground/app/examples/persist/store/index.ts` | `chatThread`, `chatComposer`, `chatSession` |
| `apps/playground/app/examples/roguelite/store/index.ts` | `gameSession`, `playerInput`, `bootSystem`, `enemySpawner`, `movementSystem`, `projectileMotionSystem`, `playerAutoFire`, `combatSystem`, `playerBody`, `enemyBody`, `enemyHealth`, `enemyHitFeedback`, `projectileBody` |
| `apps/playground/app/examples/ssr-demo-2/store/index.ts` | `grid`, `entityList` |
| `apps/playground/app/examples/ssr-demo-3/store/index.ts` | `grid`, `entityList` |
| `apps/playground/app/examples/ssr-demo/store/index.ts` | `profileSession`, `widgetFeed` |
| `apps/playground/app/examples/test-example/store/index.ts` | `onboarding`, `profile` |

Обязательные project-construction требования:

1. `lite-fsm` считается alias-ом `@lite-fsm/core` для provenance checks
   `MachineManager`, `createMachine` и typed helper wrappers.
2. Namespace import из project barrel раскрывается в named exports:
   `import * as appMachines from "./machines"`.
3. Same-file destructuring namespace import с rest раскрывается в набор manager
   entries:
   `const { root, ...rest } = appMachines`.
4. Destructured binding `root` связывается с `appMachines.root`.
5. Rest binding раскрывается как named exports barrel без destructured keys.
6. Manager map object spreads раскрываются только для resolved same-file object
   bindings и namespace rest bindings.
7. Unresolved external spreads дают warning и пропускаются, если уже resolved
   хотя бы один local machine entry.
8. Fixture для MVP должен использовать tsconfig, через который project-local
   alias imports резолвятся в fixture root.

### Core Module Alias Map

Временная map для обратной совместимости:

| Import specifier | Canonical package | Provenance eligible |
| ---------------- | ----------------- | ------------------- |
| `@lite-fsm/core` | `@lite-fsm/core`  | yes                 |
| `lite-fsm`       | `@lite-fsm/core`  | yes                 |
| `lite-fsm/*`     | none              | no                  |

`lite-fsm` существует как legacy alias для клиентов до переезда на
`@lite-fsm/*` 2.0+. После миграции оставшихся клиентов поддержку `lite-fsm` alias
можно удалить из project compiler. Package subpaths вроде `lite-fsm/middleware`
не являются project source и не участвуют в provenance checks.

Не входит в MVP:

1. command `export-source`;
2. command `lite-fsm export --format ...`;
3. JSON stdout output и `--out -`;
4. `.tsx`/`.js`/`.jsx` project files;
5. `export *`;
6. default exports/imports для machines;
7. imported manager maps;
8. arbitrary/dynamic manager map spreads;
9. computed manager keys;
10. namespace object spread вида `{ ...machines }`;
11. inline `createMachine({ ... })` прямо внутри manager map;
12. expansion non-lite-fsm imported constants/helpers внутри machine config;
13. source text внутри JSON export;
14. drag-and-drop UI для загрузки graph export;
15. `--dry-run`;
16. `--strict`;
17. public option `maxMachines` для project compiler.

## Глобальные запреты

MVP code path не должен:

1. генерировать synthetic TypeScript source;
2. исполнять entrypoint;
3. импортировать runtime bundle приложения;
4. сканировать директории без `--entry`;
5. дублировать graph compiler rules в CLI;
6. читать filesystem напрямую из `@lite-fsm/graph`;
7. импортировать `packages/graph/src/...` из CLI;
8. запускать docs build commands или команды, которые транзитивно запускают docs
   build.

## Этапы реализации

- [Этап 1: Graph Compiler](CLI-PROJECT-GRAPH-MVP-SPEC.stage-1.md)
- [Этап 2: CLI](CLI-PROJECT-GRAPH-MVP-SPEC.stage-2.md)
- [Этап 3: Visualizer](CLI-PROJECT-GRAPH-MVP-SPEC.stage-3.md)
- [Лог реализации](CLI-PROJECT-GRAPH-MVP-IMPLEMENTATION-LOG.md)

## Финальная приемка MVP

MVP завершен, когда:

1. Все acceptance gates этапов 1-3 выполнены.
2. Все финальные проверки ниже проходят без blocking diagnostics.
3. Ни один MVP code path не генерирует synthetic source.

Финальные проверки:

```bash
pnpm --filter @lite-fsm/graph test:unit
pnpm --filter @lite-fsm/graph test:coverage
pnpm --filter @lite-fsm/graph check-types
pnpm --filter @lite-fsm/cli test:unit
pnpm --filter @lite-fsm/cli test:coverage
pnpm --filter @lite-fsm/cli check-types
pnpm --filter @lite-fsm/cli build
node packages/cli/dist/bin/lite-fsm.js --help
node packages/cli/dist/bin/lite-fsm.js export-graph \
  --entry packages/graph/test-fixtures/real-store-shape/store/index.ts \
  --tsconfig packages/graph/test-fixtures/real-store-shape/tsconfig.json \
  --out .tmp/lite-fsm-real-store-shape.graph.json
pnpm --filter @lite-fsm/visualizer test:unit
pnpm --filter @lite-fsm/visualizer test:coverage
pnpm --filter @lite-fsm/visualizer check-types
pnpm run test:types
pnpm run check-types
```

Не запускать docs build commands.
