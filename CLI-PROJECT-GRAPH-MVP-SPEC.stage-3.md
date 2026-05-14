# Lite FSM CLI project graph export: stage-3 Visualizer

## Навигация

- [Index](CLI-PROJECT-GRAPH-MVP-SPEC.md)
- [Лог реализации](CLI-PROJECT-GRAPH-MVP-IMPLEMENTATION-LOG.md)
- [Этап 1: Graph Compiler](CLI-PROJECT-GRAPH-MVP-SPEC.stage-1.md)
- [Этап 2: CLI](CLI-PROJECT-GRAPH-MVP-SPEC.stage-2.md)

После acceptance gate этапа 3 выполнить финальную приемку из [index](CLI-PROJECT-GRAPH-MVP-SPEC.md#финальная-приемка-mvp).

## Этап 3. Visualizer

### Цель

Visualizer принимает готовый graph export document и строит model без source
compile. Document-based pipeline должен быть first-class path: file input в MVP
является только browser adapter-ом над готовым `LiteFsmGraphDocument`, а будущий
`lite-fsm visualize` local session должен подключиться к тому же pipeline без
нового UI/state flow.

### Входные условия

Перед стартом этапа 3 должен быть завершен этап 2. На входе есть JSON document
версии `lite-fsm.project-graph-export/v1`, созданный CLI.

### Область изменений

```txt
apps/visualizer/
```

Этап добавляет только простое browser-поле выбора файла для загрузки CLI JSON
export.
Repo-root fixture `tests/fixtures/project-graph-export/v1/real-store-shape.json`
создается на этапе 2 и используется visualizer tests как cross-package contract.
Drag-and-drop JSON import, чтение original project files из browser runtime и
rendering project source snippets не входят в MVP.
Local session server, browser auto-open, watch mode и codegen apply также не
входят в этап 3, но state/services границы должны оставить для них явное место.

### Project Export Document Contract

Stage 3 должен быть реализуем только с `index`, `implementation log` и этим
stage-файлом, поэтому browser parser принимает CLI envelope по этому контракту:

```ts
type LiteFsmGraphProjectFile = {
  fileName: string;
  language: "ts";
  roles: readonly Array<"entry" | "machine" | "barrel" | "helper">;
  hash: string;
};

type CliDiagnostic = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  file?: string;
  loc?: {
    line: number;
    column: number;
  };
  hint?: string;
};

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

Правила:

1. Visualizer валидирует document structurally by version and required fields.
2. Visualizer извлекает `graph` и не импортирует `@lite-fsm/cli` runtime/package
   code.
3. Canonical repo-root fixture для parser/model tests:
   `tests/fixtures/project-graph-export/v1/real-store-shape.json`.
4. `diagnostics` на верхнем уровне содержит только CLI diagnostics; graph
   diagnostics остаются в `graph.diagnostics`.
5. JSON export не содержит original source text.

### Project Export Input

Минимальная работа для MVP:

1. Добавить простой `<input type="file" accept=".json,application/json">`.
2. Прочитать выбранный файл через browser `File.text()`.
3. Добавить parser/validator для `lite-fsm.project-graph-export/v1`.
4. Добавить pipeline path, который принимает `LiteFsmGraphDocument` напрямую.
5. Запускать `analyzeLiteFsmGraph(document)`.
6. Запускать `buildGraphVisualizerModel(document)`.
7. Обходить `compileLiteFsmGraph(source)` для project graph export.
8. Добавить file-aware source anchor labels.
9. Добавить fallback для source overlay без source text.
10. Сохранить существующее поведение Source tab.
11. File input adapter должен после parsing вызывать общий document pipeline, а
    не собственный analyzer/model flow.
12. Project export load не должен перезаписывать pasted source как будто это
    original project source.

Не требуется:

1. Drag and drop JSON import.
2. Recent files/history.
3. Открытие original files из static browser mode.
4. Rendering project source snippets.

### Visualizer Ownership Rules

Project export support не должен смешивать browser IO, parsing и model build:

1. file input остается thin UI adapter над `File.text()`;
2. parser/validator владеет только structural validation envelope v1;
3. document pipeline принимает готовый `LiteFsmGraphDocument` и не вызывает
   `compileLiteFsmGraph(source)`;
4. source anchor labels/fallback живут отдельно от pasted-source compile path;
5. visualizer не импортирует `@lite-fsm/cli` runtime/package code;
6. file input, tests и future local session должны сходиться в один document
   pipeline helper;
7. future local session может заменить static host adapter на local host
   adapter, но не должен требовать другого graph/analyze/model pipeline;
8. codegen UI должен проверять host capabilities, а не package/runtime имя.

### Input Modes For Local Session

Этап 3 реализует только existing pasted-source mode и new project-export mode.
Но модель состояния должна явно различать source-backed и document-backed input,
чтобы future `lite-fsm visualize` не связывал project locations с Source tab.

Ожидаемые режимы:

```ts
type VisualizerInputMode =
  | { kind: "pasted-source"; source: SourceSession }
  | {
      kind: "project-export";
      document: LiteFsmGraphDocument;
      files: LiteFsmGraphProjectFile[];
      entryPath: string;
    }
  | {
      kind: "local-session";
      sessionId: string;
      capabilities: VisualizerHostCapabilities;
    };
```

Правила:

1. Workbench state должен иметь явный discriminant текущего input source:
   `inputMode` или эквивалентное поле. Нельзя выводить режим из пустого source,
   filename или текущего compile status.
2. MVP может реализовать shape выше напрямую или через эквивалентные поля, но
   selectors/effects не должны выводить project source text из Source tab.
3. `project-export` является static/read-only: `canReadFiles`, `canWriteFiles`
   и `canApplyPatch` остаются `false`.
4. `local-session` в будущем будет единственным режимом, где
   `VisualizerHostAdapter.readFile`, `previewPatch` и `applyPatch` могут быть
   доступны.
5. Document pipeline не должен требовать `SourceSession.source`.
6. Source editor остается UX для pasted source и не становится hidden transport
   для project export JSON.

### Source Anchors

Правила:

1. Рендерить file-aware anchor labels, если существует `loc.fileName`.
2. Использовать label format `<path>:<line>:<column>`, где `<path>` равен
   `loc.fileName`.
3. Сохранить old single-source label behavior, когда `loc.fileName`
   отсутствует.
4. Для project export visualizer не применяет `loc.start.offset` и
   `loc.start.line` к current pasted source из Source tab.
5. Показывать source overlay fallback, если original source text для
   `loc.fileName` недоступен.
6. Fallback должен показывать хотя бы anchor label `<path>:<line>:<column>` и
   короткое сообщение, что source text не включен в JSON export.
7. Если future local host adapter умеет читать `loc.fileName`, source overlay
   может показать snippet из этого файла, но fallback behavior project export
   должен остаться независимым от Source tab.

### Tests

Runtime tests используют Vitest. Названия тестов должны быть на русском.

Visualizer tests:

1. project export document parser принимает valid document;
2. project export document parser отклоняет invalid version;
3. parser принимает repo-root canonical fixture
   `tests/fixtures/project-graph-export/v1/real-store-shape.json`;
4. file input читает выбранный JSON export;
5. file input передает parsed graph в общий document pipeline;
6. model строится из exported `LiteFsmGraphDocument`;
7. project export load не перезаписывает pasted source как original source text;
8. project export mode выставляет static/read-only capabilities;
9. file-aware source anchor label содержит path, line и column;
10. source overlay fallback появляется, если source text недоступен;
11. source anchors/diagnostics с одинаковыми line/column/offset, но разными
   `fileName`, не dedupe и не bind как один source item.

Coverage requirements:

1. Parser/validator для `lite-fsm.project-graph-export/v1` и document-based
   pipeline helper должны иметь strict 100% coverage по
   statements/branches/functions/lines.
2. Все новые pure/helper modules для project export path, включая source anchor
   labels/fallback, должны иметь strict 100% coverage.
3. Pure/helper modules для input mode и document pipeline routing, если они
   добавлены, должны иметь strict 100% coverage.
4. Если новые visualizer modules не попадают в текущий coverage include, обновить
   `apps/visualizer/vitest.config.ts`.

### Verification

Основные команды проверки этапа:

```bash
pnpm --filter @lite-fsm/visualizer test:unit
pnpm --filter @lite-fsm/visualizer test:coverage
pnpm --filter @lite-fsm/visualizer check-types
pnpm run check-types
```

Не запускать docs build commands.

### Acceptance Gate

Этап 3 завершен, когда:

1. Visualizer позволяет выбрать CLI JSON export через простой file input.
2. Visualizer строит model из exported graph без compile source.
3. Visualizer source overlay имеет fallback для недоступного project source
   text.
4. Source tab продолжает работать для pasted source.
5. Existing single-source visualizer behavior остается совместимым.
6. Project export flow использует общий document pipeline, пригодный для future
   local session input.
7. Project export mode остается static/read-only и не смешивает project
   locations с current pasted source.
