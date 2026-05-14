# Lite FSM CLI project graph export: stage-2 CLI

## Навигация

- [Index](CLI-PROJECT-GRAPH-MVP-SPEC.md)
- [Лог реализации](CLI-PROJECT-GRAPH-MVP-IMPLEMENTATION-LOG.md)
- [Этап 1: Graph Compiler](CLI-PROJECT-GRAPH-MVP-SPEC.stage-1.md)
- [Этап 3: Visualizer](CLI-PROJECT-GRAPH-MVP-SPEC.stage-3.md)

## Этап 2. CLI

### Цель

CLI создает resolver/cache/host для graph compiler и пишет JSON export document.
Project graph build pipeline должен быть command-agnostic: `export-graph` только
записывает результат в JSON, а тот же build слой позже должен использовать
`lite-fsm visualize` без повторной реализации resolver/cache/host.

### Входные условия

Перед стартом этапа 2 должен быть завершен этап 1. CLI использует graph package
только через public exports.

### Область изменений

```txt
packages/cli/
tests/fixtures/project-graph-export/v1/
```

### CLI File Layout

Рекомендуемая структура пакета является частью stage-2 contract. Ее можно
минимально уточнять при реализации, но ownership boundaries должны сохраниться:
bin/adapter слой не содержит domain logic, а resolver/cache/export-document
остаются тестируемыми pure/domain modules.

```txt
packages/cli/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    bin/
      lite-fsm.ts
    cli/
      context.ts
      create-program.ts
      diagnostics.ts
      node-fs.ts
      result.ts
    export-graph/
      command.ts
      export-document.ts
      options.ts
      run-export-graph.ts
      write-output.ts
    output/
      format-diagnostics.ts
      stable-json.ts
    project/
      build-project-graph.ts
      create-project-host.ts
      module-resolver.ts
      source-cache.ts
      tsconfig.ts
  tests/
    helpers/
      memory-fs.ts
    export-graph/
      export-document.test.ts
      export-graph-command.test.ts
    project/
      build-project-graph.test.ts
      module-resolver.test.ts
      source-cache.test.ts
      tsconfig.test.ts
```

Правила:

1. `src/bin/lite-fsm.ts` - thin Node entrypoint с shebang; он создает
   `CliContext`, запускает program и выставляет `process.exitCode`.
2. `src/cli/create-program.ts` - единственное место, где создается
   `commander.Command` и регистрируются команды.
3. `src/export-graph/command.ts` - commander adapter для `export-graph`; он
   нормализует argv и вызывает use-case.
4. `src/export-graph/run-export-graph.ts` - command use-case: вызывает
   command-agnostic project graph builder, создает export envelope и применяет
   write policy.
5. `src/export-graph/export-document.ts` - canonical TypeScript type, envelope
   factory и deterministic stringify helper для
   `lite-fsm.project-graph-export/v1`.
6. `src/project/build-project-graph.ts` - command-agnostic project graph builder:
   tsconfig lookup, TypeScript module resolution, source cache,
   `LiteFsmGraphProjectHost`, вызов `compileLiteFsmGraphProject` и diagnostics
   mapping. Он не знает про JSON envelope, `--out`, local server или browser UI.
7. `src/project/**` владеет tsconfig lookup, TypeScript module resolution,
   source cache и созданием `LiteFsmGraphProjectHost`.
8. `src/output/**` владеет stderr formatting и stable JSON primitives.
9. Tests используют in-memory `CliFileSystem`; Node fs adapter и bin entrypoint
   остаются thin integration adapters.

### Package Contract

`packages/cli/package.json`:

```json
{
  "name": "@lite-fsm/cli",
  "type": "module",
  "bin": {
    "lite-fsm": "./dist/bin/lite-fsm.js"
  },
  "engines": {
    "node": ">=20"
  }
}
```

Runtime-зависимости:

1. `commander`;
2. `typescript`;
3. `@lite-fsm/graph`.

Правила:

1. CLI package собирается в ESM.
2. Binary name: `lite-fsm`.
3. Build output содержит executable bin entry с shebang.
4. CLI импортирует graph только через public exports.
5. CLI не импортирует `packages/graph/src/...`.
6. CLI не запускает docs build и команды, которые транзитивно запускают docs
   build.
7. Package scripts должны включать `build`, `check-types`, `test:unit` и
   `test:coverage`; `build` не должен транзитивно запускать docs build.

### Command Contract

Команда:

```bash
lite-fsm export-graph --entry path/to/app-entry.ts --out lite-fsm.graph.json
```

Опции:

```bash
--entry <path>       обязательный entrypoint-файл
--out <path>         обязательный output JSON
--tsconfig <path>    explicit tsconfig для module resolution
```

Правила:

1. `--entry` обязателен.
2. `--out` обязателен.
3. `--out -` не поддерживается.
4. Unknown options возвращают `LFC_INVALID_OPTIONS`.
5. Diagnostics пишутся в stderr.
6. JSON payload пишется только в `--out`.
7. CLI command не вызывает `process.exit()`; entrypoint выставляет exit code.

### CLI Architecture

Поток выполнения:

```txt
src/bin/lite-fsm.ts
  -> createCliContext(...)
  -> createProgram(context)
  -> register command modules
  -> parse argv
  -> export-graph command adapter
  -> normalize options
  -> buildProjectGraph(...)
  -> create export envelope
  -> write JSON
```

Правила:

1. `commander` используется только в command registration и argv parsing.
2. Domain modules не импортируют `commander`.
3. `CliContext` владеет cwd/stdout/stderr/env/fs.
4. Use-case возвращает `CommandResult`.
5. Filesystem access идет через `CliContext.fs` или thin adapter.
6. Heavy dependencies импортируются в command execution path, не для
   `lite-fsm --help`.
7. CLI мапит command-level failures в `LFC_*`.
8. CLI не теряет graph diagnostics: они остаются внутри `graph.diagnostics`.
   Top-level export `diagnostics` содержит только `LFC_*` CLI diagnostics.
9. Project graph build result не зависит от output path. `--out`, stable JSON и
   write policy принадлежат только `export-graph`.
10. Blocking graph result может сохранять `LiteFsmGraphProjectResult` для
    diagnostics/debug consumers, но `export-graph` все равно не пишет partial
    JSON при blocking diagnostics.

Core CLI contracts:

```ts
type CliContext = {
  cwd: string;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  env: Readonly<Record<string, string | undefined>>;
  fs: CliFileSystem;
};

type CliFileSystem = {
  readFile(path: string): string;
  writeFile(path: string, contents: string): void;
  mkdir(path: string, options: { recursive: true }): void;
  rename(from: string, to: string): void;
  unlink(path: string): void;
  fileExists(path: string): boolean;
  directoryExists(path: string): boolean;
  realpath?(path: string): string;
};

type CommandResult = {
  exitCode: 0 | 1;
  diagnostics: CliDiagnostic[];
};

type ProjectGraphBuildResult = {
  project: {
    entryPath: string;
    absoluteEntryPath: string;
    projectRoot: string;
    tsconfigPath?: string;
  };
  graphResult?: LiteFsmGraphProjectResult;
  diagnostics: CliDiagnostic[];
  blocking: boolean;
};
```

Правила:

1. CLI use-case и project host работают синхронно, как public graph API.
2. Node entrypoint может использовать `node:fs` sync APIs за thin adapter.
3. Tests могут подменять `CliFileSystem` in-memory implementation.
4. `ProjectGraphBuildResult` является internal CLI contract. Его можно уточнять
   при реализации, но он должен оставаться пригодным для второго consumer-а:
   будущего `visualize` local session.

### Future Visualize Readiness

Этап 2 не реализует `lite-fsm visualize`, local HTTP server, browser open,
watch mode или codegen. Но текущая реализация не должна архитектурно блокировать
эти режимы.

Правила:

1. `project/**` modules не импортируют `export-graph/**`, не знают о JSON
   envelope и не требуют `--out`.
2. `export-graph/**` может импортировать `project/**`, но не наоборот.
3. Local project graph compile должен быть доступен как функция над
   `CliContext`, entry и optional tsconfig.
4. Source cache остается internal CLI infrastructure. JSON export не содержит
   source text, но cache design не должен исключать future read-only local
   session endpoint для source snippets.
5. `write-output.ts` отвечает только за запись export artifact. Future codegen
   apply не должен переиспользовать этот writer как общий механизм записи
   project source files.
6. Stage 2 не добавляет dependency на `apps/visualizer` или
   `@lite-fsm/visualizer`. Future `visualize` может подключить static assets
   отдельным command/server layer-ом.
7. Transport assumptions для visualizer не зашиваются в `export-graph`: никакой
   query-string payload, temp-file protocol или browser-specific format сверх
   versioned export document.

### Resolver

Выбор tsconfig:

1. Использовать explicit `--tsconfig`, если передан.
2. Иначе использовать nearest `tsconfig.json` от entry directory вверх.
3. Если nearest tsconfig не найден, продолжить с default TS resolver settings и
   project root = CLI cwd.

Project root:

1. explicit tsconfig directory, если передан `--tsconfig`;
2. nearest tsconfig directory, если он найден;
3. `CliContext.cwd`, если tsconfig не найден.

Правила source candidates:

1. Relative imports являются project source candidates.
2. Non-relative imports являются project source candidates только если
   TypeScript resolver resolves их внутри project root через `baseUrl`, `paths`
   или `rootDirs`.
3. Imports, resolved в `node_modules`, не traversed.
4. Imports, resolved вне project root, не traversed.
5. Specifiers из Core Module Alias Map не читаются как project source.
   `lite-fsm/*` package subpaths вроде `lite-fsm/middleware` тоже не traversed,
   но не дают core provenance.
6. `real-store-shape` fixture должен иметь tsconfig, в котором app-local alias
   imports резолвятся внутрь fixture root.
7. Если app-local alias не резолвится через выбранный tsconfig, affected
   machine/helper resolution дает warning и не блокирует уже resolved machines.
8. Extensionless relative imports должны resolves как TypeScript:
   `./machine` -> `./machine.ts`, затем `./machine/index.ts`.
9. Directory imports из named barrel обязаны resolves в `index.ts`.
10. CLI resolver обязан возвращать `LiteFsmGraphProjectModuleResolution`:
    `resolved`, `core`, `external`, `not-found` или `unsupported-extension`.
11. Non-relative specifier считается project-local alias candidate только если он
    matched выбранным tsconfig `paths`/`baseUrl`/`rootDirs` и resolved target должен
    лежать внутри project root. Failed project-local candidate возвращает
    `not-found`, а не `external`.
12. Non-relative specifier, который не matched project-local resolution policy,
    считается `external`. Канонический пример:
    `@player/store` в `real-store-shape`.

Поддерживаемые extensions:

1. `.ts`.

Неподдерживаемые explicit extensions возвращают
`kind: "unsupported-extension"` и затем дают
`LFG_PROJECT_MODULE_UNSUPPORTED_EXTENSION`; если extension нельзя надежно
определить через resolver, affected import возвращается как `not-found`.

### Source Cache

Правила:

1. Cache keys являются normalized absolute paths.
2. `readSource` читает каждый file не больше одного раза за command run.
3. TypeScript resolver host и graph project host используют один cache.
4. Cache сохраняет file existence и directory existence при запросе.
5. Parse source files выполняется только после extension validation.
6. Parse diagnostics включают `loc.fileName`, если source file известен.

### JSON Output

CLI записывает `LiteFsmProjectGraphExportDocument`:

```ts
type LiteFsmProjectGraphExportDocument = {
  version: "lite-fsm.project-graph-export/v1";
  createdBy: {
    package: "@lite-fsm/cli";
    version: string;
  };
  entry: {
    path: string;
    tsconfigPath?: string;
  };
  graph: LiteFsmGraphDocument;
  files: LiteFsmGraphProjectFile[];
  diagnostics: CliDiagnostic[];
};
```

Contract ownership:

1. Versioned JSON format `lite-fsm.project-graph-export/v1` is owned by
   `@lite-fsm/cli` as the only writer in MVP.
2. Canonical TypeScript type, envelope factory and deterministic stringify helper
   live in `packages/cli/src/export-graph/export-document.ts`.
3. Visualizer не импортирует `@lite-fsm/cli` runtime/package code. Browser parser
   в `apps/visualizer` валидирует document structurally by version and required
   fields, then extracts `LiteFsmGraphDocument`.
4. Cross-package compatibility фиксируется repo-root committed fixture:
   `tests/fixtures/project-graph-export/v1/real-store-shape.json`.
5. CLI tests compare generated `real-store-shape` export with this fixture.
   Visualizer tests load the same fixture as valid project export input.
6. Первичное schema/version создание на этапе 2 требует обновить CLI
   type/factory и committed fixture. Visualizer parser tests для этой fixture
   добавляются на этапе 3. После завершения этапа 3 любое schema/version
   изменение требует обновлять CLI type/factory, committed fixture и visualizer
   parser tests вместе.
7. Другие packages не создают `lite-fsm.project-graph-export/v1` documents.

Правила JSON:

1. UTF-8.
2. Two-space indent.
3. Stable key order.
4. Trailing newline.
5. Paths нормализуются в POSIX-style, когда это возможно.
6. `entry.path` хранится relative to CLI cwd, когда это возможно.
7. `entry.tsconfigPath` присутствует только при использовании tsconfig.
8. `graph` равен `compileLiteFsmGraphProject(...).document`.
9. `files` равен `compileLiteFsmGraphProject(...).files`.
10. `diagnostics` содержит только CLI diagnostics (`LFC_*`), показанные во
    время command execution.
11. JSON не содержит original source text.
12. Paths внутри `graph.source`, `graph.source.files`, `graph.*.loc.fileName`
    и top-level `files` уже являются exported paths из graph compiler result;
    CLI не переписывает source locations после compile.
13. Graph compiler diagnostics не копируются в top-level `diagnostics`; они
    остаются в `graph.diagnostics`.
14. JSON пишется только при отсутствии blocking diagnostics. Если graph compile
    завершился blocking diagnostic-ами, partial JSON export не создается.

### CLI Diagnostics

CLI diagnostics:

```ts
type CliDiagnosticSeverity = "info" | "warning" | "error";

type CliDiagnosticCode =
  | "LFC_INVALID_OPTIONS"
  | "LFC_TSCONFIG_NOT_FOUND"
  | "LFC_TSCONFIG_INVALID"
  | "LFC_GRAPH_PROJECT_FAILED"
  | "LFC_NO_MACHINES_EXPORTED"
  | "LFC_WRITE_FAILED";

type CliDiagnostic = {
  code: CliDiagnosticCode;
  severity: CliDiagnosticSeverity;
  message: string;
  file?: string;
  loc?: {
    line: number;
    column: number;
  };
  hint?: string;
};
```

Fatality matrix:

| Условие                                                                 | Owner | Severity | Blocks output |
| ----------------------------------------------------------------------- | ----- | -------- | ------------- |
| invalid CLI options                                                     | CLI   | error    | yes           |
| explicit tsconfig не найден                                             | CLI   | error    | yes           |
| nearest tsconfig не найден                                              | CLI   | info     | no            |
| tsconfig invalid                                                        | CLI   | error    | yes           |
| graph project compile выбросил unexpected exception                     | CLI   | error    | yes           |
| entry не найден / `readSource(entryFileName)` вернул `undefined`        | Graph | error    | yes           |
| entry parse error                                                       | Graph | error    | yes           |
| manager не найден                                                       | Graph | error    | yes           |
| несколько manager candidates                                            | Graph | error    | yes           |
| manager provenance unsupported                                          | Graph | error    | yes           |
| manager map unsupported                                                 | Graph | error    | yes           |
| no machine entry resolved (`LFG_PROJECT_NO_MACHINE_ENTRIES`)            | Graph | error    | yes           |
| module parse error, из-за которого не resolved ни одной machine         | Graph | error    | yes           |
| machine entry unresolved при хотя бы одной resolved machine             | Graph | warning  | no            |
| unresolved external manager map spread                                  | Graph | warning  | no            |
| unsupported barrel для affected symbol                                  | Graph | warning  | no            |
| module не найден для affected symbol                                    | Graph | warning  | no            |
| module parse error для affected symbol при хотя бы одной resolved machine | Graph | warning  | no            |
| unsupported extension для affected symbol при хотя бы одной resolved machine | Graph | warning  | no            |
| module cycle для affected symbol при хотя бы одной resolved machine     | Graph | warning  | no            |
| namespace import/rest unsupported при хотя бы одной resolved machine    | Graph | warning  | no            |
| helper provenance unsupported для affected machine                      | Graph | warning  | no            |
| unsupported machine create argument                                     | Graph | warning  | no            |
| write failed                                                            | CLI   | error    | yes           |

Graph/CLI diagnostic mapping:

1. CLI diagnostics use only `LFC_*` codes and describe command-level failures.
2. Graph diagnostics use `LFG_*` codes and stay inside `graph.diagnostics` in
   JSON output.
3. CLI prints both CLI diagnostics and graph diagnostics to stderr.
4. CLI treats any graph diagnostic with `severity: "error"` as blocking and
   returns exit code `1` with `LFC_GRAPH_PROJECT_FAILED` in `CommandResult`.
5. `LFC_GRAPH_PROJECT_FAILED` is not copied into JSON. If it is emitted, JSON is
   not written because graph output is blocked.
6. Graph diagnostics with `severity: "warning"` or `"info"` never become
   `LFC_*` diagnostics and do not block output by themselves.
7. `LFC_NO_MACHINES_EXPORTED` is emitted only when graph compile returns no
   blocking diagnostics but the resulting document has no exported manager or no
   machine refs. It blocks output.

Exit codes:

1. `0`: no blocking diagnostics.
2. `1`: blocking diagnostics or write failure.

### Write Policy

Правила:

1. Создавать parent directory автоматически.
2. Перезаписывать существующий output file.
3. Для MVP достаточно прямого sync write через `CliFileSystem.writeFile`.
4. Возвращать `LFC_WRITE_FAILED` при write errors.

### Tests

Runtime tests используют Vitest. Названия тестов должны быть на русском.

CLI tests:

1. `export-graph` пишет deterministic JSON;
2. command-agnostic project graph builder возвращает graph result для
   `real-store-shape` без зависимости от output path;
3. `real-store-shape` fixture пишет graph JSON с local machines и warning для
   unresolved external spread;
4. `--out` обязателен;
5. missing explicit `--tsconfig` блокирует command;
6. missing nearest tsconfig дает info и не блокирует command;
7. выбранный tsconfig резолвит app-local alias внутри fixture root;
8. write failure возвращает `LFC_WRITE_FAILED`;
9. unknown option возвращает `LFC_INVALID_OPTIONS`;
10. generated JSON парсится как `lite-fsm.project-graph-export/v1`;
11. generated `real-store-shape` JSON deep-equals canonical fixture
    `tests/fixtures/project-graph-export/v1/real-store-shape.json`, кроме
    intentionally variable fields, если такие поля явно перечислены в test;
12. playground example entries из manifest пишут graph JSON без blocking
    diagnostics и с expected local machine keys.

Coverage requirements:

1. CLI package должен иметь script `test:coverage`.
2. Pure/domain modules CLI (`src/cli/**`, `src/export-graph/**`,
   `src/project/**`, `src/output/**`, кроме bin adapter-ов и thin Node fs
   adapter-а) должны иметь strict 100% coverage по
   statements/branches/functions/lines.
3. Coverage обязательно покрывает option normalization, diagnostics mapping,
   tsconfig lookup, module resolver outcome kinds, source cache и deterministic
   JSON envelope/stringify.
4. Coverage обязательно покрывает command-agnostic project graph builder
   отдельно от `export-graph` command adapter/write policy.

### Verification

Основные команды проверки этапа:

```bash
pnpm --filter @lite-fsm/cli test:unit
pnpm --filter @lite-fsm/cli test:coverage
pnpm --filter @lite-fsm/cli check-types
pnpm --filter @lite-fsm/cli build
node packages/cli/dist/bin/lite-fsm.js --help
node packages/cli/dist/bin/lite-fsm.js export-graph \
  --entry packages/graph/test-fixtures/real-store-shape/store/index.ts \
  --tsconfig packages/graph/test-fixtures/real-store-shape/tsconfig.json \
  --out .tmp/lite-fsm-real-store-shape.graph.json
pnpm run check-types
```

Не запускать docs build commands.

### Acceptance Gate

Этап 2 завершен, когда:

1. CLI пишет deterministic JSON для `real-store-shape` fixture entrypoint.
2. CLI пишет graph JSON для `real-store-shape` entrypoint с namespace barrel,
   namespace rest и unresolved external spread warning.
3. CLI проходит playground smoke checks по manifest без blocking diagnostics.
4. CLI не дублирует graph compiler rules.
5. CLI не импортирует graph internals.
6. CLI command не вызывает `process.exit()`.
7. JSON export не содержит original source text.
8. Ни один CLI MVP code path не генерирует synthetic source.
9. `pnpm --filter @lite-fsm/cli build` создает executable bin entry с shebang.
10. Built bin проходит `--help` smoke и `export-graph` smoke на
    `real-store-shape` fixture.
11. Canonical `lite-fsm.project-graph-export/v1` fixture создана или обновлена.
    Visualizer parser tests, которые читают эту fixture, выполняются на этапе 3.
12. Project graph build pipeline можно вызвать без output path и JSON writer.
