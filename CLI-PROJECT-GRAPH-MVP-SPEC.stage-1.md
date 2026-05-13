# Lite FSM CLI project graph export: stage-1 Graph Compiler

## Навигация

- [Index](CLI-PROJECT-GRAPH-MVP-SPEC.md)
- [Лог реализации](CLI-PROJECT-GRAPH-MVP-IMPLEMENTATION-LOG.md)
- [Этап 2: CLI](CLI-PROJECT-GRAPH-MVP-SPEC.stage-2.md)
- [Этап 3: Visualizer](CLI-PROJECT-GRAPH-MVP-SPEC.stage-3.md)

## Этап 1. Graph Compiler

### Цель

`@lite-fsm/graph` умеет собрать graph из project entrypoint через host без
CLI-specific кода.

### Область изменений

```txt
packages/graph/
```

Этап не должен создавать CLI package и не должен читать filesystem напрямую.

### Public Graph API

Добавить public exports в `@lite-fsm/graph`:

```ts
export type LiteFsmGraphProjectHost = {
  readSource(fileName: string): string | undefined;
  resolveModule(input: {
    fromFileName: string;
    moduleSpecifier: string;
  }): LiteFsmGraphProjectModuleResolution;
};

export type LiteFsmGraphProjectModuleResolution =
  | { kind: "resolved"; fileName: string }
  | { kind: "core"; moduleSpecifier: string }
  | { kind: "external"; moduleSpecifier: string }
  | { kind: "not-found"; moduleSpecifier: string }
  | { kind: "unsupported-extension"; moduleSpecifier: string; extension: string };

export type CompileLiteFsmGraphProjectOptions = {
  entryFileName: string;
  projectRoot?: string;
  host: LiteFsmGraphProjectHost;
};

export type LiteFsmGraphProjectFile = {
  fileName: string;
  language: "ts";
  roles: readonly Array<"entry" | "machine" | "barrel" | "helper">;
  hash: string;
};

export type LiteFsmGraphProjectResult = LiteFsmGraphResult & {
  files: readonly LiteFsmGraphProjectFile[];
};

export declare function compileLiteFsmGraphProject(
  options: CompileLiteFsmGraphProjectOptions,
): LiteFsmGraphProjectResult;
```

Правила:

1. `compileLiteFsmGraph(source, options)` остается совместимым single-source API.
2. `compileLiteFsmGraphProject(options)` является project API для CLI.
3. API синхронный.
4. Graph package не парсит tsconfig.
5. Graph package не читает filesystem напрямую.
6. Graph package использует только `LiteFsmGraphProjectHost`.
7. CLI позже будет владеть tsconfig, TypeScript resolver-ом и source cache.
8. При изменении публичного API обновить `API-CHEATSHEET.md` и
   `TYPES-CHEATSHEET.md`, если они покрывают graph tooling API.

### Project Host Contract

Правила:

1. `entryFileName` и все `fileName`, которые возвращает host, являются
   normalized absolute paths.
2. `projectRoot`, если передан, является normalized absolute path.
   Effective project root равен `projectRoot`, а если он не передан —
   directory name от `entryFileName`. CLI всегда передает выбранный project
   root явно; fallback существует только для прямого использования public graph
   API.
3. `resolveModule` принимает original module specifier из source file и
   normalized absolute `fromFileName`.
4. `resolveModule` возвращает дискриминированный результат, а не неоднозначный
   `undefined`.
5. `resolveModule` должен поддерживать TypeScript extensionless resolution для
   `.ts` files и directory `index.ts`, например `./root` -> `./root/index.ts`.
6. `kind: "resolved"` возвращает normalized absolute source file path только для
   files, которые CLI разрешил читать как project source.
7. `kind: "core"` возвращается только для specifiers из Core Module Alias Map.
   Эти modules не являются project source.
8. `kind: "external"` возвращается для non-relative imports, которые не
   распознаны выбранным tsconfig как project-local candidates или resolved вне
   project root / в `node_modules`. Package subpaths вроде `lite-fsm/middleware`
   считаются external ignored imports, если их bindings не участвуют в selected
   manager map/helper provenance.
9. `kind: "not-found"` возвращается для relative imports и project-local alias
   candidates, которые должны были resolve внутрь project root, но не найдены.
10. `kind: "unsupported-extension"` возвращается для explicit unsupported
    extensions из original specifier.
11. Graph compiler мапит module resolution `kind` в project diagnostics без
    дублирования TypeScript resolver rules в compiler:
    - `unsupported-extension` дает `LFG_PROJECT_MODULE_UNSUPPORTED_EXTENSION`;
    - `not-found`, если import нужен для machine/helper/barrel, дает
      `LFG_PROJECT_MODULE_NOT_FOUND`;
    - `external`, если binding использован только как manager map spread, дает
      `LFG_PROJECT_MANAGER_SPREAD_UNRESOLVED`;
    - `core` используется только для provenance checks и не читается как source.
12. `readSource` вызывается только для `entryFileName` и paths из
    `kind: "resolved"`.
13. `readSource` возвращает `undefined`, если file не найден или не может быть
    прочитан; graph compiler превращает это в project diagnostic.
14. Graph package не вызывает Node filesystem APIs и не знает о tsconfig.
15. `fileExists`, `directoryExists`, `realpath` и другие filesystem/query APIs не
    входят в public graph host. Они принадлежат CLI resolver/source cache и не
    должны протекать в `@lite-fsm/graph` public API.
16. Path casing и symlink normalization принадлежат host/CLI; graph compiler
    использует returned paths as identity keys.
17. Internal identity paths всегда absolute paths из host. Exported paths для
    `document.source`, `SourceLocation.fileName`, `LiteFsmGraphProjectFile` и
    CLI JSON строятся отдельно из effective project root.
18. Compiler не читает unrelated imports из reachable files. Например imports
    middleware/services/hooks/selectors в `store/index.ts` не должны вызывать
    `readSource`, если их bindings не участвуют в выбранном manager map или
    helper provenance.
19. `LiteFsmGraphProjectFile.roles` содержит все роли файла. Same-file
    entry/machine обязан получить обе роли, например `["entry", "machine"]`.

### File-Aware Types

Расширить существующие graph types additively:

```ts
export type SourceLocation = {
  fileName?: string;
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
};

export type GraphSourceFile = {
  fileName: string;
  language: GraphLanguage;
  hash?: string;
};

export type GraphSource = {
  filename?: string;
  language: GraphLanguage;
  hash?: string;
  kind?: "single-file" | "project";
  entryFileName?: string;
  files?: readonly GraphSourceFile[];
};
```

Правила:

1. Существующие single-source documents остаются валидными.
2. Отсутствующий `GraphSource.kind` означает single-file document.
3. Project compiler выставляет `document.source.kind = "project"`.
4. Project compiler выставляет `document.source.entryFileName` как exported
   path, а не internal identity path.
5. Project compiler заполняет `document.source.files` exported paths.
6. Project compiler выставляет `SourceLocation.fileName` для каждой созданной
   loc.
7. Single-source compiler может оставлять `SourceLocation.fileName` undefined.
8. `line` и `column` являются 1-based.
9. `offset` является 0-based offset внутри файла, указанного в `fileName`.
10. Project mode хранит `fileName` в exported path format: normalized
    POSIX-style relative path, если file находится внутри effective project
    root; иначе normalized absolute path.
11. Visualizer labels строятся из `loc.fileName`, `loc.start.line` и
    `loc.start.column`.
12. `loc.start.offset` и `loc.end.offset` всегда являются offsets внутри source
    file, на который указывает `loc.fileName`; offsets из разных files никогда не
    сравниваются между собой без `fileName`.
13. Любое сравнение/dedup locations в graph/view-model/visualizer должно
    включать `fileName`, если он есть. Ключ вида `line:column:offset` без
    `fileName` допустим только для single-source documents.

### Project Compiler Pipeline

Pipeline:

```txt
normalize options
  -> create entry source unit
  -> discover MachineManager candidates in entry
  -> выбрать manager
  -> evaluate manager map in entry unit
  -> resolve manager entry bindings/imports/barrels через host
  -> create machine/helper/barrel source units
  -> prove lite-fsm helper provenance
  -> create project machine candidates
  -> bind manager entries to machine candidates
  -> compile каждую machine с context ее source unit
  -> create project manager link
  -> assemble LiteFsmGraphDocument
  -> return LiteFsmGraphProjectResult
```

Правила compilation:

1. Переиспользовать существующие `SourceAdapter`, `SourceCatalog`,
   `PartialEvaluator`, candidates, config/reducer/effects compiler и assembler.
2. Создавать один source unit на parsed file; units кэшируются по normalized
   absolute path.
3. File parse diagnostics привязывать к соответствующему source unit.
4. Читать только files, достижимые из selected manager map, imports/barrels для
   referenced machine symbols и typed helper wrapper resolution.
5. В machine source unit не traversed runtime value imports, используемые внутри
   config/reducer/effects как constants/utils/SSR helpers. Они остаются
   symbolic/external в existing compiler semantics и не блокируют project graph
   construction.
6. Type-only imports не участвуют в traversal.
7. Imported machine file может иметь extra exports; project compiler компилирует
   только symbols, referenced selected manager map.
8. Никогда не выполнять полный project directory scan.
9. Manager discovery запускается только в entrypoint.
10. Manager map evaluation использует entry source unit.
11. Machine config/reducer/effects компилируются из original machine source unit.
12. Каждый machine candidate получает свой compiler context.
13. Compiler context machine source unit содержит helper provenance map для
   direct core imports и proven typed wrappers, reachable из этого source unit.
14. Manager links создаются только из entries выбранной manager map.
15. Output machine order повторяет порядок выбранной manager map.
16. Существующие `LFG_*` diagnostics из machine compilation сохраняются.
17. Project-level diagnostics use `LFG_PROJECT_*`.

### Internal Ownership Rules

Project compiler не должен превращаться в монолитный orchestrator. Новую
project-логику держать в модулях с одним владельцем ответственности:

1. source units/cache: чтение через host, parse diagnostics, exported paths,
   hashes и file roles;
2. imports/resolution: import table и вызовы `host.resolveModule` без
   manager/machine semantics;
3. barrels: named re-export resolution и cycle handling;
4. manager-map: выбор manager, first argument, spreads, namespace rest и порядок
   entries;
5. helper-provenance: core imports, `lite-fsm` alias и typed wrapper proof/cache;
6. machine-resolution: binding manager entries к original machine declarations;
7. project-assembler/diagnostics: deterministic result, roles, source metadata,
   `LFG_PROJECT_*` factories и sorting.

Модуль не должен владеть чужими правилами: resolver не знает про manager map,
barrel resolver не компилирует machines, CLI не повторяет graph compiler rules.

### Deterministic Project Output

Детерминированность project compiler является частью public contract.

Правила:

1. Все output arrays должны иметь стабильный порядок, не зависящий от insertion
   order runtime `Map`/`Set`, filesystem order или порядка обхода TypeScript
   resolver internals.
2. `document.managers[*].machineRefs` сохраняет порядок выбранной manager map.
3. `document.machines` сохраняет порядок selected manager entries после раскрытия
   supported spreads/rest. Если несколько manager keys указывают на один machine
   declaration, machine появляется по первому manager key, а `managerKeys`
   сохраняет порядок всех связанных manager keys.
4. `files` в `LiteFsmGraphProjectResult` и `document.source.files` идут в одном
   порядке: entry file первым, затем project files в порядке первого
   семантического использования из selected manager map traversal. Если два файла
   получают одинаковый discovery index, tie-breaker — exported POSIX path
   ascending.
5. `LiteFsmGraphProjectFile.roles` не содержит duplicates и всегда сортируется в
   фиксированном порядке: `entry`, `machine`, `barrel`, `helper`.
6. `GraphSourceFile[]` содержит те же exported paths и hashes, что top-level
   `files`; если source file имеет несколько roles, `GraphSourceFile` не
   дублируется.
7. Diagnostics sorting в project mode использует tuple:
   `loc.fileName ?? ""`, `loc.start.offset ?? MAX_SAFE_INTEGER`, `code`,
   `message`. Для single-source documents старый порядок остается совместимым,
   потому что `fileName` отсутствует у всех diagnostics.
8. Любые location-based ids/dedup keys в graph/view-model/visualizer используют
   `fileName` перед line/column/offset, если `fileName` есть.
9. CLI JSON envelope имеет стабильный top-level key order:
   `version`, `createdBy`, `entry`, `graph`, `files`, `diagnostics`.
10. Nested object key order следует порядку type definitions в этом документе.
    Arrays не сортируются повторно в CLI; CLI сохраняет order, полученный от
    graph compiler.

### Manager Selection

1. `MachineManager` поддерживается только как named import из `@lite-fsm/core`
   или `lite-fsm`, включая local alias import.
2. Candidate call должен resolve в core `MachineManager`.
3. Поддерживаемые forms: top-level `MachineManager(...)`, arrow expression,
   block factory с `const manager = MachineManager(...); ...; return manager`.
4. Если найден ровно один manager candidate, выбрать его.
5. Если найдено несколько manager candidates, вернуть blocking diagnostic
   `LFG_PROJECT_MANAGER_AMBIGUOUS`.
6. Не поддерживаются: non-core manager import, `getMachines()`, `export default`,
   class/static/object methods, nested functions, destructured declarations.
7. Public manager selector (`--manager`) не входит в MVP.

### Manager Map

1. Manager first argument должен resolve в object literal в entry source unit.
2. Same-file `const` и `export const` object literal поддерживаются.
3. Поддерживаются inline object literal, same-file object binding, shorthand
   identifiers, explicit keys, string literal keys и same-file object spreads.
4. Spread expression поддерживается, если resolve в same-file local object,
   namespace rest binding или external binding, который можно пропустить как
   warning после найденных local entries.
5. Namespace rest binding поддерживается только для формы
   `const { named, ...rest } = namespaceImport`.
6. Destructured keys исключаются из rest binding.
7. Rest binding сохраняет порядок named exports barrel.
8. Imported manager maps не поддерживаются.
9. Unresolved external spread дает warning и пропускается, если уже resolved хотя
   бы один local machine entry.
   Binding из non-relative import, который host не resolved внутрь project root,
   считается external spread. Канонический пример: `...playerMachines` из
   `@player/store`.
10. Manager options argument игнорируется.
11. Неподдерживаемые entries дают warnings.
12. Должен resolve хотя бы один machine entry.
13. Duplicate manager keys не входят в MVP; при встрече можно вернуть warning
    без last-write-wins semantics.
14. Не поддерживаются: imported manager maps, dynamic manager maps,
    computed keys, namespace object spread `{ ...machines }`, inline
    `createMachine({ ... })` в manager map.

### Machine Resolution

1. Manager entry expression должен resolve в `createMachine({ ... })` call.
2. First `createMachine` argument должен быть object literal после supported
   transparent unwraps.
3. Machine declaration может быть `const machine = createMachine(...)`.
4. Machine declaration может быть `export const machine = createMachine(...)`.
5. Поддерживаются same-file machines, direct named imports, named barrel
   re-exports, aliased re-exports и namespace import from named barrel.
6. Project compiler resolves только symbols, referenced выбранной manager map.
7. Project compiler не компилирует unreferenced machines из imported files.
8. Namespace rest binding исключает destructured keys из resulting entry set.
9. Relative module specifiers без extension и directory `index.ts` должны
    resolves через host.
10. Machine id preference берется из unique manager key.
11. Не поддерживаются: default imports/exports, `export *`, `makeMachine()`,
    `createMachine(machineConfig)`, conditional manager entry expressions.

### Helper Provenance

1. `MachineManager` должен быть direct import из core module в entrypoint.
2. Core module specifiers: `@lite-fsm/core` и `lite-fsm`.
3. `createMachine`, `createConfig`, `createReducer` и `createEffect` могут быть
   direct imports из core module.
4. Эти helpers могут быть simple typed wrappers вида `export const localHelper:
   TypedCreate*Fn<...> = baseCoreHelper`.
5. Runtime wrappers не поддерживаются.
6. Typed-wrapper resolution следует по named imports и named re-exports.
7. Wrapper initializer должен resolve в corresponding direct core module helper.
8. Wrapper import может быть relative import или project-local alias import,
   если host resolves его внутрь project root.
9. Для каждого machine source unit project compiler строит effective helper map:
   direct core imports из этого файла плюс proven typed wrappers, импортированные
   этим файлом. Candidate discovery и transparent unwraps используют именно этот
   effective helper map.
10. Project compiler не расширяет reducer/effect/config semantics; он только
    доказывает provenance typed wrapper и добавляет proven helpers в
    `SourceCatalog`/compiler context original machine source unit, чтобы
    существующий compiler мог применить transparent unwraps.
11. Wrapper provenance кэшируется по helper file absolute path и helper name,
    чтобы все machines, импортирующие один `store/create-machine.ts`, видели
    одинаковый helper map без повторного чтения source.
12. Если wrapper import не proven, affected machine получает warning
    `LFG_PROJECT_HELPER_PROVENANCE_UNSUPPORTED` и пропускается, если уже найдены
    другие resolved machines.

### Barrels

1. Поддерживаются только named re-exports: `export { a } from "./a"` и
   `export { a as b } from "./a"`.
2. Следовать по named re-export chains только для requested symbols.
3. Сохранять already resolved symbols, если другой symbol failed.
4. Останавливать affected symbol resolution при module cycle.
5. Сообщать unsupported barrel syntax как warning.
6. Сообщать unresolved re-export target как warning.
7. `export *` и default re-exports не входят в MVP.

### Graph Diagnostics

Graph project diagnostic codes:

```ts
type GraphProjectDiagnosticCode =
  | "LFG_PROJECT_ENTRY_NOT_FOUND"
  | "LFG_PROJECT_ENTRY_PARSE_ERROR"
  | "LFG_PROJECT_MANAGER_NOT_FOUND"
  | "LFG_PROJECT_MANAGER_AMBIGUOUS"
  | "LFG_PROJECT_MANAGER_PROVENANCE_UNSUPPORTED"
  | "LFG_PROJECT_MANAGER_MAP_UNSUPPORTED"
  | "LFG_PROJECT_MANAGER_SPREAD_UNRESOLVED"
  | "LFG_PROJECT_MANAGER_ENTRY_UNRESOLVED"
  | "LFG_PROJECT_NO_MACHINE_ENTRIES"
  | "LFG_PROJECT_MACHINE_UNRESOLVED"
  | "LFG_PROJECT_MACHINE_UNSUPPORTED_CREATE_ARGUMENT"
  | "LFG_PROJECT_CREATE_MACHINE_PROVENANCE_UNSUPPORTED"
  | "LFG_PROJECT_HELPER_PROVENANCE_UNSUPPORTED"
  | "LFG_PROJECT_NAMESPACE_IMPORT_UNSUPPORTED"
  | "LFG_PROJECT_NAMESPACE_REST_UNSUPPORTED"
  | "LFG_PROJECT_EXPORT_NOT_FOUND"
  | "LFG_PROJECT_BARREL_UNSUPPORTED"
  | "LFG_PROJECT_MODULE_NOT_FOUND"
  | "LFG_PROJECT_MODULE_PARSE_ERROR"
  | "LFG_PROJECT_MODULE_UNSUPPORTED_EXTENSION"
  | "LFG_PROJECT_MODULE_CYCLE";
```

Правила:

1. Fatal/blocking policy применяется в CLI на этапе 2.
2. Graph compiler выставляет severity и diagnostic code достаточно подробно,
   чтобы CLI не дублировал compiler rules.
3. File-level diagnostics должны включать file identity через
   `diagnostic.loc.fileName`, если file известен. Top-level `fileName` в
   `GraphDiagnostic` не добавляется.
4. Если affected manager entry/machine не может быть resolved, но уже есть хотя
   бы одна resolved local machine, compiler возвращает warning на affected symbol
   и сохраняет partial document.
5. Если после обработки selected manager map не осталось ни одной resolved local
   machine, compiler добавляет blocking `LFG_PROJECT_NO_MACHINE_ENTRIES`.

Severity policy:

| Code | Severity policy |
| ---- | --------------- |
| `LFG_PROJECT_ENTRY_NOT_FOUND` | `error` always |
| `LFG_PROJECT_ENTRY_PARSE_ERROR` | `error` always |
| `LFG_PROJECT_MANAGER_NOT_FOUND` | `error` always |
| `LFG_PROJECT_MANAGER_AMBIGUOUS` | `error` always |
| `LFG_PROJECT_MANAGER_PROVENANCE_UNSUPPORTED` | `error` always |
| `LFG_PROJECT_MANAGER_MAP_UNSUPPORTED` | `error` always |
| `LFG_PROJECT_MANAGER_SPREAD_UNRESOLVED` | `warning`; skipped when at least one local machine entry is resolved |
| `LFG_PROJECT_MANAGER_ENTRY_UNRESOLVED` | `warning` for affected entry; paired with `LFG_PROJECT_NO_MACHINE_ENTRIES` when no local machine resolves |
| `LFG_PROJECT_NO_MACHINE_ENTRIES` | `error` when selected manager map yields zero resolved local machines |
| `LFG_PROJECT_MACHINE_UNRESOLVED` | `warning` for affected machine entry; paired with `LFG_PROJECT_NO_MACHINE_ENTRIES` when no local machine resolves |
| `LFG_PROJECT_MACHINE_UNSUPPORTED_CREATE_ARGUMENT` | `warning` for affected machine; paired with `LFG_PROJECT_NO_MACHINE_ENTRIES` when all selected machines are skipped |
| `LFG_PROJECT_CREATE_MACHINE_PROVENANCE_UNSUPPORTED` | `warning` for affected machine; paired with `LFG_PROJECT_NO_MACHINE_ENTRIES` when all selected machines are skipped |
| `LFG_PROJECT_HELPER_PROVENANCE_UNSUPPORTED` | `warning` for affected helper/machine; paired with `LFG_PROJECT_NO_MACHINE_ENTRIES` when all selected machines are skipped |
| `LFG_PROJECT_NAMESPACE_IMPORT_UNSUPPORTED` | `warning` for affected namespace binding; paired with `LFG_PROJECT_NO_MACHINE_ENTRIES` when no local machine resolves |
| `LFG_PROJECT_NAMESPACE_REST_UNSUPPORTED` | `warning` for affected rest binding; paired with `LFG_PROJECT_NO_MACHINE_ENTRIES` when no local machine resolves |
| `LFG_PROJECT_EXPORT_NOT_FOUND` | `warning` for affected requested symbol; paired with `LFG_PROJECT_NO_MACHINE_ENTRIES` when no local machine resolves |
| `LFG_PROJECT_BARREL_UNSUPPORTED` | `warning` for affected requested symbol; paired with `LFG_PROJECT_NO_MACHINE_ENTRIES` when no local machine resolves |
| `LFG_PROJECT_MODULE_NOT_FOUND` | `warning` for affected requested symbol; paired with `LFG_PROJECT_NO_MACHINE_ENTRIES` when no local machine resolves |
| `LFG_PROJECT_MODULE_PARSE_ERROR` | `warning` when partial graph can still include at least one local machine; `error` when it prevents all selected machines from resolving |
| `LFG_PROJECT_MODULE_UNSUPPORTED_EXTENSION` | `warning` for affected requested symbol; paired with `LFG_PROJECT_NO_MACHINE_ENTRIES` when no local machine resolves |
| `LFG_PROJECT_MODULE_CYCLE` | `warning` for affected requested symbol; paired with `LFG_PROJECT_NO_MACHINE_ENTRIES` when no local machine resolves |

### Tests

Runtime tests используют Vitest. Public type tests используют Tstyche при
изменении public types. Названия тестов должны быть на русском.

Graph project compiler tests:

1. same-file manager и same-file machine;
2. entry импортирует machine напрямую;
3. entry импортирует machine через named barrel;
4. entry импортирует aliased barrel export;
5. machine file использует direct `createMachine` import;
6. machine file использует simple typed helper wrappers;
7. `lite-fsm` direct import считается core module alias;
8. entry импортирует namespace из named barrel и читает member access;
9. namespace rest destructuring исключает явно destructured keys;
10. unresolved external spread дает warning и не блокирует local machines;
11. несколько managers дают blocking diagnostic;
12. unsupported manager map блокирует output;
13. unresolved manager entry дает warning, когда другая machine resolves;
14. unsupported `createMachine(machineConfig)` дает warning и пропускает
    machine;
15. project document source locations содержат `loc.fileName`;
16. diagnostics/source anchor identity включает `loc.fileName`: два locations с
    одинаковыми line/column/offset в разных files не dedupe/bind как один item;
17. deterministic `files`, `document.source.files`, diagnostics и `roles` order;
18. `real-store-shape` fixture создает IR для expected local machines и warning для
    unresolved external spread;
19. playground example smoke checks используют manifest expected keys и не
    требуют compiler semantics вне MVP;
20. existing single-source compiler snapshots остаются совместимыми.

Coverage requirements:

1. Новые pure modules в `packages/graph/src/project/**` должны иметь strict 100%
   coverage по statements/branches/functions/lines.
2. `packages/graph/vitest.config.ts` должен включать все новые project compiler
   tests в `test:unit` и `test:coverage`. Текущий machine-flow-only include нельзя
   оставлять, если project tests из-за него не запускаются.

### Verification

Основные команды проверки этапа:

```bash
pnpm --filter @lite-fsm/graph test:unit
pnpm --filter @lite-fsm/graph test:coverage
pnpm --filter @lite-fsm/graph check-types
pnpm run test:types
pnpm run check-types
```

Не запускать docs build commands.

### Acceptance Gate

Этап 1 завершен, когда:

1. `compileLiteFsmGraphProject` возвращает `LiteFsmGraphProjectResult`.
2. Project compiler обрабатывает same-file machines.
3. Project compiler обрабатывает direct named imports.
4. Project compiler обрабатывает named barrel re-exports.
5. Project compiler обрабатывает `lite-fsm` как core module alias.
6. Project compiler обрабатывает namespace imports из named barrels.
7. Project compiler обрабатывает namespace rest destructuring.
8. Project compiler обрабатывает supported manager map object spreads.
9. `real-store-shape` manager map создает IR для local machines и warning для
   unresolved external spread.
10. Project compiler обрабатывает simple typed helper wrappers.
11. Project compiler проходит playground smoke checks по manifest без расширения
    compiler semantics вне MVP.
12. Output graph содержит selected manager.
13. Output manager содержит machine refs with manager keys.
14. Output machines содержат states, transitions и emissions из существующей
   graph compiler logic.
15. Output locations содержат `loc.fileName` в project mode.
16. Output `files`, `document.source.files`, diagnostics и `roles` имеют
    deterministic order по правилам выше.
17. Поведение existing `compileLiteFsmGraph(source)` остается совместимым.
18. Ни один graph MVP code path не генерирует synthetic source.
