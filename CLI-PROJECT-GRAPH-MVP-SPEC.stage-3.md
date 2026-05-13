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
compile.

### Входные условия

Перед стартом этапа 3 должен быть завершен этап 2. На входе есть JSON document
версии `lite-fsm.project-graph-export/v1`, созданный CLI.

### Область изменений

```txt
apps/visualizer/
```

Этап добавляет только простое browser-поле выбора файла для загрузки CLI JSON
export.
Drag-and-drop JSON import, чтение original project files из browser runtime и
rendering project source snippets не входят в MVP.

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
3. Canonical fixture для parser/model tests:
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
5. visualizer не импортирует `@lite-fsm/cli` runtime/package code.

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

### Tests

Runtime tests используют Vitest. Названия тестов должны быть на русском.

Visualizer tests:

1. project export document parser принимает valid document;
2. project export document parser отклоняет invalid version;
3. parser принимает canonical fixture
   `tests/fixtures/project-graph-export/v1/real-store-shape.json`;
4. file input читает выбранный JSON export;
5. model строится из exported `LiteFsmGraphDocument`;
6. file-aware source anchor label содержит path, line и column;
7. source overlay fallback появляется, если source text недоступен;
8. source anchors/diagnostics с одинаковыми line/column/offset, но разными
   `fileName`, не dedupe и не bind как один source item.

Coverage requirements:

1. Parser/validator для `lite-fsm.project-graph-export/v1` и document-based
   pipeline helper должны иметь strict 100% coverage по
   statements/branches/functions/lines.
2. Все новые pure/helper modules для project export path, включая source anchor
   labels/fallback, должны иметь strict 100% coverage.
3. Если новые visualizer modules не попадают в текущий coverage include, обновить
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
