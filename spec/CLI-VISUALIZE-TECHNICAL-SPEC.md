# Техническое задание: `lite-fsm visualize`

## Цель

Реализовать `lite-fsm visualize`, локальный запуск `apps/visualizer` из `@lite-fsm/cli` с готовым project graph document и доступом к исходникам через local API.

Этап 1 готовит CLI host: сборку project graph, local HTTP server, static serving, session/source API и packaging artifact.
Интеграция UI visualizer с `?session=...` и `/api/*` относится к этапу 2, поэтому в этапе 1 browser URL является host contract для следующего этапа, а не acceptance-критерием того, что UI уже отрисовал graph document.

## Общие ограничения

- Не публиковать `apps/visualizer` отдельным npm-пакетом.
- Не реализовывать codegen в этой итерации.
- Не добавлять runtime web-framework dependency.
- Не запускать docs build.
- Новая чистая логика должна иметь 100% coverage по statements, branches, functions, lines.

## Этап 1: CLI и local server

### Scope

- Работать только в `packages/cli`.
- Не менять source code `apps/visualizer` в этапе 1.
- Не требовать, чтобы текущий `apps/visualizer` в этапе 1 прочитал `?session=...` или вызвал `/api/session`; это будет подключено в этапе 2.
- Разрешено запускать build `apps/visualizer` и копировать его build artifact.
- Добавить команду `lite-fsm visualize`.
- Поднять local HTTP server.
- Отдавать static build visualizer.
- Отдавать session/source API.
- Подготовить packaging build/copy pipeline для visualizer artifact.

### CLI command

Команда:

```bash
lite-fsm visualize --entry src/store/index.ts
```

Флаги:

- `--entry <path>`: обязательный путь к TypeScript entrypoint.
- `--tsconfig <path>`: опциональный explicit tsconfig.
- `--port <number>`: опциональный порт, default `3030`; допустимы только integer values `1..65535`.
- `--no-open`: не открывать браузер, только напечатать URL.

Поведение:

- Компилировать project graph через существующий `buildProjectGraph`.
- Если entry/tsconfig/project setup содержит blocking CLI diagnostics, не стартовать server.
- Если graph document построен с graph diagnostics, стартовать server.
- Если port занят, вернуть CLI diagnostic и не стартовать server.
- После успешного старта печатать URL локальной сессии в stdout.
- Писать CLI/graph diagnostics в stderr.
- После успешного старта удерживать CLI process.
- Server живет до `SIGINT`/`SIGTERM`.
- `SIGINT`/`SIGTERM` закрывает HTTP server и завершает process с exit code `0`.
- Startup failure возвращает command result с exit code `1`.
- Auto-shutdown после закрытия browser tab не реализовывать.

### CLI files

Создать:

```text
packages/cli/src/visualize/
  command.ts
  options.ts
  run-visualize.ts
  session.ts
  server.ts
  routes.ts
  http.ts
  static-assets.ts
  open-browser.ts
  types.ts
```

Требования:

- `command.ts`: регистрация commander command.
- `options.ts`: нормализация raw options и diagnostics.
- `run-visualize.ts`: build graph -> create session -> start server -> open browser.
- `session.ts`: session id/token, capabilities, file allowlist, source read.
- `server.ts`: lifecycle `start/stop`, bind `127.0.0.1`.
- `routes.ts`: route registry.
- `http.ts`: URL, JSON response, error response, MIME, method handling.
- `static-assets.ts`: static serving из `dist/visualizer`.
- `open-browser.ts`: platform opener.
- `types.ts`: shared internal types.
- Зарегистрировать command в `packages/cli/src/cli/create-program.ts`.
- `run-visualize.ts` должен проверять наличие static root и `dist/visualizer/index.html` до печати URL.
- Если static artifact отсутствует, command должен вернуть CLI diagnostic и завершиться как startup failure с exit code `1`.

### Session contract

Session token:

- Генерировать криптографически стойко.
- Передавать в browser URL как `/?session=<token>`.
- Query parameter `session` содержит session token, а не session id.
- API routes требуют корректный token.

Session response:

```ts
{
  ok: true;
  sessionId: string;
  capabilities: VisualizerHostCapabilities;
  entry: {
    path: string;
    tsconfigPath?: string;
  };
  projectRoot: string;
  exportDocument: LiteFsmProjectGraphExportDocument;
}
```

`projectRoot` в response должен быть normalized absolute project root.

### HTTP API

Bind:

```text
127.0.0.1:<port>
```

Routes:

```text
GET /?session=<token>
GET /api/session?token=<token>
GET /api/source?token=<token>&fileName=<project-relative-file>
GET /
GET /assets/*
```

`GET /api/source` success response:

```ts
{
  ok: true;
  fileName: string;
  language: "ts";
  hash: string;
  text: string;
}
```

API error response:

```ts
{
  ok: false;
  code: string;
  message: string;
}
```

HTTP status codes:

- `200`: success.
- `400`: invalid query, invalid `fileName` shape.
- `401`: missing or invalid token.
- `404`: unknown source file or missing static asset.
- `405`: method mismatch.
- `409`: source hash no longer matches `graphResult.files`.
- `500`: unexpected server failure.

JSON responses:

- `Content-Type: application/json; charset=utf-8`.

### Source API rules

- Source API отдает только files из `graphResult.files`.
- `fileName` принимает только project-relative file names из graph document.
- Absolute paths отклонять.
- `..` отклонять.
- URL-encoded traversal отклонять.
- Unknown files отклонять.
- Source читать через `CliFileSystem`.
- Source hash должен соответствовать hash из `graphResult.files`.
- Source hash для `/api/source` считать тем же stable hash algorithm, который `@lite-fsm/graph` использует для `LiteFsmGraphProjectFile.hash`; не использовать SHA-256 helper из `SourceCache.sourceHash`.
- Добавить тест совместимости: source read в visualize-session для файла из `graphResult.files` возвращает тот же `hash`, что записан в `graphResult.files`.
- Если source hash не соответствует hash из `graphResult.files`, вернуть `409 source-stale`.
- Auto-recompile при stale source в V1 не реализовывать.
- В `/api/session` source text не встраивать.

### Static assets

- Build `apps/visualizer` копировать в:

```text
packages/cli/dist/visualizer/
```

- Artifact для CLI должен собираться с `VITE_VISUALIZER_BASE_PATH=/`, чтобы `index.html` ссылался на `/assets/*`, которые раздает CLI server.
- Static root вычислять относительно installed/built `@lite-fsm/cli/dist`, не относительно `process.cwd()`.
- Команда должна работать из любого project cwd при запуске через `npx @lite-fsm/cli`.
- HTTP server должен отдавать только files внутри `dist/visualizer`.
- Root `/` должен отдавать `index.html`.
- SPA fallback для неизвестных non-API paths должен отдавать `index.html`.
- MIME whitelist обязателен для `.html`, `.js`, `.css`, `.svg`, `.png`, `.ico`, `.json`, `.map`.
- Path traversal за пределы static root запрещен.

### Web server implementation

- Использовать только `node:http` и стандартные Node APIs.
- Не добавлять Express/Fastify/Hono.
- Реализовать route registry:

```ts
type VisualizerRoute = {
  method: "GET" | "POST";
  path: string;
  auth: "none" | "session";
  handle(context: VisualizerRouteContext): Promise<VisualizerHttpResponse> | VisualizerHttpResponse;
};
```

- V1 routes: `sessionRoute`, `sourceRoute`.
- API routes в V1 принимают только `GET`; остальные methods возвращают `405`.
- Static routes в V1 принимают только `GET`; остальные methods возвращают `405`.
- Future routes должны добавляться без изменения `server.ts`.

### Browser opener

- Использовать `child_process.spawn`.
- Не использовать shell.
- Передавать URL отдельным аргументом.
- Не интерполировать URL в command string.
- `--no-open` полностью обходит browser opener.
- Browser opener failure должен вернуть CLI diagnostic, закрыть server и завершить startup failure с exit code `1`.

### Packaging

- `apps/visualizer` остается private app.
- `@lite-fsm/cli` публикует собранную статику visualizer внутри `dist/visualizer`.
- Добавить отдельный copy script для `apps/visualizer/dist -> packages/cli/dist/visualizer`.
- Обновить build pipeline `@lite-fsm/cli`.
- Build order:
  1. Build `@lite-fsm/graph`.
  2. Build `apps/visualizer` with `VITE_VISUALIZER_BASE_PATH=/`.
  3. Build `@lite-fsm/cli` JS/types; this step may clean `packages/cli/dist`.
  4. Copy `apps/visualizer/dist/*` into `packages/cli/dist/visualizer/`.
  5. Run pack/smoke artifact check.
- Добавить pack/smoke проверку наличия `packages/cli/dist/visualizer/index.html`.
- Pack/smoke проверка должна выполняться после финального build/copy visualizer artifact.

### Unit tests

Coverage для новой чистой CLI логики:

- 100% statements.
- 100% branches.
- 100% functions.
- 100% lines.

Покрыть:

- `options.ts`: required flags, invalid port, default port `3030`, `--no-open`, `--tsconfig`.
- `session.ts`: token/id shape, source allowlist, unknown file, traversal, hash mismatch.
- `http.ts`: JSON responses, status codes, method mismatch, route mismatch, token errors.
- `static-assets.ts`: MIME, root index, SPA fallback, traversal, missing asset.
- `static-assets.ts`: missing `dist/visualizer/index.html` startup diagnostic.
- `routes.ts`: `/api/session`, `/api/source`, success responses, error responses.
- `routes.ts`: `405` для non-GET API/static requests.
- `run-visualize.ts`: blocking diagnostics, graph diagnostics with document, `--no-open`, default port, port errors, startup failure exit code.
- `open-browser.ts`: platform command selection, no shell, URL as argv, opener failure.

### Smoke checks

- CLI command starts server for fixture project.
- `npx -p @lite-fsm/cli lite-fsm visualize --entry <path>` works from external project cwd after package build/pack.
- `/api/session` returns project graph export.
- `/api/source` returns source for file from graph document.
- `--no-open` does not call browser opener.
- Published package artifact includes `dist/visualizer/index.html`.

### Этап 1 acceptance criteria

- `lite-fsm visualize --entry <path> --no-open` starts local server.
- Без `--port` используется port `3030`.
- Command prints session URL.
- API routes work with session token.
- API does not return files outside allowlist.
- Stale source returns `409 source-stale`.
- Static root resolves from installed/built `@lite-fsm/cli/dist`.
- Browser opener runs without shell.
- `@lite-fsm/cli` tarball contains `dist/visualizer/index.html`.
- Missing `dist/visualizer/index.html` fails startup with CLI diagnostic and exit code `1`.
- New CLI pure logic has 100% unit coverage.

## Этап 2: Visualizer и интеграция

### Scope

- Работать в `apps/visualizer`.
- Заменить scattered URL loaders на единый startup boundary.
- Сохранить `?config=` behavior.
- Добавить `?session=<token>` behavior.
- Подключить local session graph document к существующему analyze/model pipeline.
- Добавить async source access для `local-session`.
- Не менять CLI API contract из этапа 1.
- После изменений rebuild `apps/visualizer` и повторно copy artifact в `packages/cli/dist/visualizer`.

### Startup files

Создать:

```text
apps/visualizer/src/startup/
  StartupLoader.tsx
  resolve-startup-input.ts
  project-export-entry.ts
  local-session-entry.ts
  types.ts
```

Требования:

- `App.tsx` должен рендерить один startup boundary: `StartupLoader`.
- Запрещено добавлять независимые URL loader components напрямую в `App.tsx`.
- `resolve-startup-input.ts`: pure selection logic.
- `project-export-entry.ts`: async загрузка `?config=` flow.
- `local-session-entry.ts`: async загрузка `?session=` flow.
- `types.ts`: shared startup types.
- `ProjectExportConfigLoader` удалить или превратить во внутреннюю часть `startup/project-export-entry.ts`.
- `StartupLoader` должен быть idempotent.
- `StartupLoader` должен дедуплицировать запуск по startup key: `kind + token/config href`.
- `StartupLoader` не должен dispatch-ить duplicate `startup.loaded` для одного startup input.
- `StartupLoader` не должен dispatch-ить duplicate `startup.load.failed` для одного startup input.

### Startup routing

- При отсутствии startup query params использовать `pasted-source`.
- Если URL содержит только `config`, использовать `project-export`.
- Если URL содержит только `session`, использовать `local-session`.
- Если URL содержит одновременно `session` и `config`, использовать `session`.
- `?config=` behavior должен остаться без регрессий.
- `/?session=<token>` должен работать независимо от `?config=`.

### Startup async contract

Все startup entrypoints должны иметь async contract:

```ts
type StartupEntryKind = "pasted-source" | "project-export" | "local-session";

type StartupEntry = {
  kind: StartupEntryKind;
  load(input: StartupLoadInput): Promise<StartupLoadResult>;
};

type StartupLoadResult =
  | {
      kind: "source-input";
      inputMode: Extract<VisualizerInputMode, { kind: "pasted-source" }>;
    }
  | {
      kind: "graph-document-input";
      inputMode: VisualizerInputMode;
      document: LiteFsmGraphDocument;
      hostCapabilities: VisualizerHostCapabilities;
      consoleTitle: string;
      consoleMessage: string;
    };
```

Entry behavior:

- `pasted-source` returns resolved `Promise` without network IO.
- `pasted-source` sets ready source-input state.
- `pasted-source` does not start graph compile automatically.
- `project-export` fetches JSON export from `?config=`.
- `project-export` returns graph-document input.
- `local-session` fetches `/api/session?token=<token>`.
- `local-session` returns graph-document input.

### Local session state

`local-session` input mode must store:

```ts
{
  kind: "local-session";
  sessionId: string;
  token: string;
  capabilities: VisualizerHostCapabilities;
  files: readonly LiteFsmGraphProjectFile[];
  entryPath: string;
  tsconfigPath?: string;
}
```

### Local session UI view

`local-session` должен отображаться как отдельный input mode.

Требования:

- `SourceInputModeView` должен иметь отдельный variant `{ kind: "local-session"; ... }`.
- Selectors не должны fallback-ить `local-session` в `pasted-source`.
- Source workspace должен render-ить local session card/state отдельно от paste source и JSON import.
- Topbar input badge должен показывать `LOCAL` или другой отдельный label для `local-session`.
- В local session mode кнопка `Compile & open` не показывается как действие pasted-source.
- В local session mode источник graph document считается уже загруженным через startup.
- UI должен показывать `entryPath`, `files.length`, `projectRoot` или capabilities summary, если эти данные доступны.

### Startup reducer commands

Reducer commands:

```ts
{ type: "startup.loaded"; result: StartupLoadResult }
{ type: "startup.load.failed"; entryKind: StartupEntryKind; issue: StartupLoadIssue }
```

Requirements:

- `startup.load.failed` adds diagnostic to console.
- `startup.load.failed` does not change current input mode.
- `startup.loaded` with `source-input` sets source input mode.
- `startup.loaded` with `graph-document-input` uses shared graph document helper.

### Shared graph document helper

Create reducer helper:

```ts
loadGraphDocumentInput(snapshot, input): Reduction
```

Helper input:

- `inputMode`
- `document`
- `inputVersion`
- `hostCapabilities`
- `consoleTitle`
- `consoleMessage`
- optional leading effects

Use helper for:

- `startup.loaded` with `result.kind === "graph-document-input"`.

Do not duplicate reset/pipeline logic between `project-export` and `local-session`.

### Source access files

Создать:

```text
apps/visualizer/src/source-access/
  types.ts
  source-cache.ts
  source-client.ts
  source-resolver.ts
```

Requirements:

- `types.ts`: source access state/result types.
- `source-client.ts`: HTTP client for `/api/source?token=<token>&fileName=<fileName>`.
- `source-cache.ts`: pure cache helpers keyed by `fileName + hash`.
- `source-resolver.ts`: pure resolution rules for pasted source, project export embedded source, local session cache state.

### Source access state/effects

Добавить workbench state slice:

```ts
type SourceAccessState = {
  entries: Record<string, SourceAccessEntry>;
};

type SourceAccessEntry =
  | { status: "loading"; fileName: string; hash: string }
  | { status: "ready"; fileName: string; hash: string; text: string }
  | { status: "error"; fileName: string; hash: string; code: string; message: string };
```

Cache key:

```ts
type SourceAccessCacheKey = string;
```

Requirements:

- Cache key must be created only by `sourceAccessCacheKey(fileName, hash)`.
- Direct string concatenation for source cache keys is forbidden.
- `sourceAccessCacheKey(fileName, hash)` must be collision-safe for file names containing `:`, `/`, `%`, `#`, `?`, whitespace, and unicode.
- Either encode components or use a structured tuple serialized by a stable helper.
- All cache read/write helpers must accept `fileName` and `hash`, not a prebuilt arbitrary string key.

Internal commands:

```ts
{ type: "source-access.fetch.succeeded"; sessionId: string; fileName: string; hash: string; text: string }
{ type: "source-access.fetch.failed"; sessionId: string; fileName: string; hash: string; code: string; message: string }
```

Effects:

```ts
{ kind: "source-access.fetch"; sessionId: string; token: string; fileName: string; hash: string }
```

Requirements:

- Handling `source.overlay.opened` must resolve whether source fetch is needed.
- For `local-session` cache miss, `source.overlay.opened` sets cache entry to `loading` and emits `source-access.fetch` with current `sessionId`.
- `source.overlay.opened` must not emit duplicate fetch effect while the same key is already `loading` or `ready`.
- `source-access.fetch.succeeded` sets cache entry to `ready` only when current input mode is the same `local-session` and `sessionId` matches.
- `source-access.fetch.failed` sets cache entry to `error` only when current input mode is the same `local-session` and `sessionId` matches.
- Reducer must ignore stale source fetch results whose `sessionId` does not match current `local-session`.
- Reducer must ignore source fetch results when current input mode is not `local-session`.
- `EffectRunnerServices` must receive a source access client/service.
- Fetch side effects must be handled by the existing workbench effect runner pattern.
- UI components must not run source fetch directly.
- UI components should continue to dispatch source overlay intent commands, not transport-specific source fetch commands.

### Source resolution contract

`workbench/source-overlay.ts` must remain a pure view builder.

Do not add to `workbench/source-overlay.ts`:

- fetch.
- cache.
- host-specific branching.
- transport-specific branching.

Selectors must not:

- run fetch.
- create side effects.

`buildSourceOverlayView` must accept resolved source result:

```ts
type SourceTextResolution =
  | { status: "ready"; text: string }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "unavailable"; message: string };
```

Resolution behavior:

- On overlay open, determine anchor `fileName` and expected `hash`.
- `pasted-source` source resolution is synchronous.
- `project-export` startup asynchronously loads JSON export through `?config=`.
- After JSON export is loaded, `project-export` source overlay resolves source synchronously only from embedded `sources`.
- Do not add per-source fetch for `project-export`.
- If embedded `sources` are missing, source overlay shows unavailable fallback.
- For `local-session`, expected hash must be resolved by matching `anchor.loc.fileName` against `inputMode.files`.
- If no matching `inputMode.files` entry exists for `anchor.loc.fileName`, source resolver returns unavailable fallback and does not fetch.
- `local-session` checks source cache first after expected hash is resolved.
- On `local-session` cache miss, dispatch/effect starts async source fetch.
- During source fetch, selector returns `loading`.
- On successful source fetch, source cache updates.
- On source fetch error, source cache/error state updates and overlay shows fallback.
- For `409 source-stale`, overlay shows dedicated stale-source fallback.

### Source overlay UI states

Support:

- ready snippet.
- full file mode when source text is available.
- loading state.
- unavailable fallback.
- error fallback for `400`, `401`, `404`, `409`, `500`.
- dedicated fallback message for `409 source-stale`.

### Unit tests

Coverage for new pure visualizer logic:

- 100% statements.
- 100% branches.
- 100% functions.
- 100% lines.

Покрыть:

- `startup/resolve-startup-input.ts`: no params, config only, session only, session-vs-config precedence.
- `StartupLoader`: startup key дедупликация и отсутствие duplicate dispatch для same startup input.
- `startup/project-export-entry.ts`: config fetch success/failure.
- `startup/local-session-entry.ts`: session fetch success/failure, token persistence.
- `SourceInputModeView`: `local-session` variant and no fallback to `pasted-source`.
- Source workspace: separate local session card/state.
- Startup reducer commands: `source-input`, `graph-document-input`, load failure.
- `loadGraphDocumentInput`: shared reset/pipeline behavior for graph-document inputs.
- `source-access/source-cache.ts`: cache key, cache hit/miss, update, error state.
- `source-access/source-cache.ts`: collision-safe cache key helper and no direct key concatenation.
- `source-access/source-client.ts`: success response, API error response, network failure.
- Source access effects/internal commands: `source.overlay.opened` cache-miss scheduling, fetch effect emission with `sessionId`, succeeded, failed, stale `sessionId` ignored, non-local input ignored, duplicate loading suppression, ready suppression.
- `source-access/source-resolver.ts`: pasted source, embedded project export source, local-session hash lookup from `inputMode.files`, local-session missing file fallback, local-session cache hit, local-session loading, local-session error, unavailable source.
- Source overlay: ready state, loading state, unavailable fallback, error fallback, `409 source-stale`.
- Regression: existing `?config=` flow remains working.

### Integration checks

- `/?session=<token>` loads `/api/session?token=<token>`.
- Browser UI opens with graph document from local session.
- Source overlay fetches source through `/api/source`.
- Source overlay uses cache on repeated open.
- Stale source fetch result from previous `sessionId` is ignored.
- Source overlay does not fetch when local-session file is absent from `inputMode.files`.
- `?config=` still loads project graph export.
- If `session` and `config` are both present, `session` is used.
- Rebuild `apps/visualizer`.
- Copy `apps/visualizer/dist` to `packages/cli/dist/visualizer`.
- Repeat pack/smoke artifact check.

### Этап 2 acceptance criteria

- `App.tsx` contains one startup boundary.
- Startup entries use one async startup flow.
- `StartupLoader` deduplicates same startup input.
- `pasted-source` enters ready source-input state without automatic compile.
- `project-export` and `local-session` graph-document inputs use shared reducer helper.
- `local-session` state stores `sessionId`, `token`, `capabilities`, `files`, `entryPath`, `tsconfigPath`.
- `local-session` is rendered as separate Source input mode, not as pasted source.
- `/?session=<token>` opens visualizer with graph document.
- `?config=` remains working.
- `session` query param has priority over `config`.
- Source access is isolated in `apps/visualizer/src/source-access`.
- `workbench/source-overlay.ts` contains no fetch/cache/host-specific logic.
- Source fetch runs through workbench command/effect flow, not UI components.
- Source fetch results are applied only when `sessionId` matches current `local-session`.
- Missing local-session file metadata returns unavailable fallback without fetch.
- Source overlay for `local-session` supports loading state.
- Source overlay for `local-session` supports error fallback.
- Source overlay for `local-session` supports `409 source-stale` fallback.
- New visualizer pure logic has 100% unit coverage.

## Финальный acceptance criteria

- Canonical invocation `npx -p @lite-fsm/cli lite-fsm visualize --entry <path>` works from an external project cwd.
- Short invocation `npx @lite-fsm/cli visualize --entry <path>` works when npm resolves the package bin to `lite-fsm`.
- `lite-fsm visualize --entry <path>` starts local server and prints URL.
- Default port is `3030`.
- `--no-open` does not open browser.
- Browser UI opens with ready graph document.
- Source overlay obtains source through local API for local sessions.
- Local API never returns files outside graph allowlist.
- Stale source returns `409 source-stale`.
- Browser opener runs without shell.
- `@lite-fsm/cli` tarball contains `dist/visualizer/index.html`.
- All new pure logic has 100% unit coverage.
