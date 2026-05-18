# Техническое задание: `lite-fsm create`

## Цель

Реализовать команду `lite-fsm create <project-name>` в `@lite-fsm/cli`, которая создает готовый стартовый React-проект на Next.js или Vite с TypeScript, alias `@/*`, Tailwind CSS по умолчанию и подключенным lite-fsm store.

## Общие ограничения

- Работать только в `packages/cli`, кроме обновления документации CLI.
- Не добавлять интерактивный режим в первой версии.
- Не добавлять `--force` в первой версии.
- Не создавать `AGENTS.md`, `CLAUDE.md` и похожие agent-файлы.
- Не добавлять публичный флаг `--agents-md`.
- Не добавлять `@lite-fsm/middleware`, `immer` и middleware setup в starter.
- Не запускать docs build и команды, которые транзитивно его запускают.

## CLI

Команды:

```bash
lite-fsm create my-app --template next
lite-fsm create my-app --template vite
```

Options:

- `--template <next|vite>`: обязательный template.
- `--css <tailwind|none>`: styling preset, default `tailwind`.
- `--package-manager <pnpm|npm|yarn|bun>`: package manager, default `pnpm`.
- `--install / --no-install`: выполнять install после overlay, default `--install`.

Поведение:

- Если `--template` отсутствует или option содержит неизвестное значение, вернуть `LFC_INVALID_OPTIONS`.
- `<project-name>` резолвится относительно `context.cwd`.
- Вложенные relative paths разрешены, например `apps/demo`, если parent directory уже существует.
- Empty value, `.`, `..`, absolute paths и paths с segment `..` запрещены и возвращают `LFC_INVALID_OPTIONS`.
- Если parent directory target path не существует, вернуть `LFC_CREATE_TARGET_PARENT_MISSING` и не запускать scaffold.
- Если target directory уже существует, вернуть `LFC_CREATE_TARGET_EXISTS` и не запускать scaffold.
- После успешного создания вывести next steps:
  - `cd <project-name>`
  - dev command для выбранного package manager.
- Если ошибка произошла после scaffold, не удалять созданную директорию автоматически.
- Ошибка после scaffold должна содержать stage, на котором команда остановилась.

## Структура файлов

Создать:

```text
packages/cli/src/create-project/
  command.ts
  options.ts
  run-create-project.ts
  dependencies.ts
  package-manager.ts
  package-json.ts
  write-files.ts
  templates/
    registry.ts
    types.ts
    next.ts
    vite.ts
    shared-store.ts
  css/
    registry.ts
    types.ts
    tailwind-next.ts
    tailwind-vite.ts
    none.ts
```

Зарегистрировать `registerCreateProjectCommand` в `packages/cli/src/cli/create-program.ts`.

## Pipeline

Общий порядок выполнения:

```text
normalize options
-> resolve framework template
-> resolve css adapter
-> validate target directory
-> scaffold framework
-> apply framework adapter
-> apply css adapter
-> apply lite-fsm store adapter
-> patch package.json
-> install dependencies, если `--install`
-> validate generated files
-> print next steps
```

Внешние команды запускать только через injectable dependency:

```ts
type CreateProjectDependencies = {
  runCommand: (command: ExternalCommand) => Promise<ExternalCommandResult>;
};

type ExternalCommand = {
  command: string;
  args: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string | undefined>>;
  stage: "scaffold" | "install";
};

type ExternalCommandResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};
```

Production implementation:

- использует `node:child_process.spawn`;
- запускает command через args array, без shell;
- запускает scaffold из `context.cwd`;
- запускает install из target directory;
- pipe-ит stdout/stderr child process, зеркалит их в `context.stdout`/`context.stderr` и хранит bounded stderr tail для diagnostics;
- при `SIGINT`/`SIGTERM` пробрасывает signal в child process и завершает текущую команду;
- non-zero exit code преобразует в diagnostic с command, cwd, stage, exit code и stderr tail;
- spawn failure, например отсутствующий package manager binary, преобразует в `LFC_CREATE_SCAFFOLD_FAILED` или `LFC_CREATE_INSTALL_FAILED` с command, cwd, stage и original error message.

Тесты используют fake `runCommand` и не ходят в сеть.

## Framework Templates

### Next.js

Scaffold должен создавать TypeScript App Router проект в `src/` с alias `@/*`, Tailwind по умолчанию, без install и без agent-файлов.

Next scaffold args должны включать:

```text
--yes
--ts
--app
--src-dir
--import-alias @/*
--skip-install
--no-agents-md
```

Если `--css tailwind`, добавить `--tailwind`.

Если `--css none`, добавить `--no-tailwind`.

Подключение lite-fsm:

- создать `src/app/providers.tsx`;
- `src/app/providers.tsx` должен начинаться с `"use client"`;
- пропатчить `src/app/layout.tsx`, чтобы приложение было обернуто в `Providers`.

### Vite

Scaffold должен использовать React TypeScript template.

Vite scaffold должен выполняться без install.

После scaffold:

- добавить alias `@ -> src` в `vite.config.ts`;
- добавить `@/* -> ./src/*` в TypeScript config;
- подключить `FSMContextProvider` в `src/main.tsx`;
- сохранить или добавить import CSS entrypoint из `src/main.tsx`.

## CSS Adapters

### `tailwind`

Default для Next и Vite.

Next:

- Tailwind включается через `create-next-app --tailwind`.

Vite:

- добавить dependencies:
  - `tailwindcss`;
  - `@tailwindcss/vite`;
- подключить `tailwindcss()` в `vite.config.ts`;
- обеспечить CSS entry с:

```css
@import "tailwindcss";
```

- убедиться, что CSS entrypoint импортируется из `src/main.tsx`.

### `none`

- Не добавлять Tailwind dependencies.
- Не добавлять Tailwind plugin.
- Store, provider и alias создаются так же, как при `tailwind`.

## lite-fsm Store Overlay

Создать для обоих templates:

```text
src/store/create-machine.ts
src/store/types.ts
src/store/hooks.ts
src/store/index.ts
src/store/machines/app.ts
```

Starter machine:

- machine key: `app`;
- `initialState: "idle"`;
- `config: { idle: {} }`;
- `initialContext: {}`;
- `AppEvents = never`;
- `AppDeps = Record<string, never>`.

Добавить dependencies generated app:

- `@lite-fsm/core`;
- `@lite-fsm/react`.

Версии `@lite-fsm/*` в generated app задавать как `latest`.

Не выводить версии `@lite-fsm/core` и `@lite-fsm/react` из версии `@lite-fsm/cli`: версии CLI и runtime packages могут отличаться.

## Package Manager

Поддержать:

- `pnpm`;
- `npm`;
- `yarn`;
- `bun`.

Вынести команды scaffold/install/dev в `package-manager.ts`.

Install выполнять один раз после scaffold, overlay и patch `package.json`.

Expected command mapping:

| Package manager | Next scaffold                                                  | Vite scaffold                                            | Install        | Dev command   |
| --------------- | -------------------------------------------------------------- | -------------------------------------------------------- | -------------- | ------------- |
| `pnpm`          | `pnpm create next-app@latest <target> <next-args> --use-pnpm`  | `pnpm create vite@latest <target> --template react-ts`   | `pnpm install` | `pnpm dev`    |
| `npm`           | `npm create next-app@latest <target> -- <next-args> --use-npm` | `npm create vite@latest <target> -- --template react-ts` | `npm install`  | `npm run dev` |
| `yarn`          | `yarn create next-app <target> <next-args> --use-yarn`         | `yarn create vite <target> --template react-ts`          | `yarn install` | `yarn dev`    |
| `bun`           | `bun create next-app@latest <target> <next-args> --use-bun`    | `bun create vite@latest <target> --template react-ts`    | `bun install`  | `bun run dev` |

`<next-args>`:

```text
--yes
--ts
--app
--src-dir
--import-alias @/*
--skip-install
--no-agents-md
--tailwind | --no-tailwind
```

## File Mutation Rules

- `package.json` менять через JSON parse/stringify.
- `tsconfig*.json` менять через JSON parse/stringify.
- `vite.config.ts`, `src/main.tsx`, `src/app/layout.tsx` менять только через отдельные patch-функции.
- Patch-функция должна вернуть понятную ошибку, если ожидаемая структура файла не найдена.
- Файлы `src/store/*` и `src/app/providers.tsx` являются owned overlay files и создаются напрямую.

## Diagnostics

Добавить CLI diagnostic codes:

- `LFC_CREATE_TARGET_EXISTS`: target directory already exists.
- `LFC_CREATE_TARGET_PARENT_MISSING`: parent directory для target path не существует.
- `LFC_CREATE_SCAFFOLD_FAILED`: scaffold command failed.
- `LFC_CREATE_INSTALL_FAILED`: install command failed.
- `LFC_CREATE_PATCH_FAILED`: file patch failed.
- `LFC_CREATE_VALIDATION_FAILED`: generated project validation failed.

Ошибки invalid options должны оставаться `LFC_INVALID_OPTIONS`.

Ошибки записи файлов могут использовать существующий `LFC_WRITE_FAILED`, если ошибка относится только к filesystem write.

## Validation

После generation проверить:

- существует `package.json`;
- существуют `src/store/index.ts` и `src/store/machines/app.ts`;
- подключен provider entrypoint:
  - Next: `src/app/providers.tsx`;
  - Vite: `src/main.tsx`;
- alias настроен;
- для Vite + Tailwind подключен `@tailwindcss/vite`;
- для Vite + Tailwind есть `@import "tailwindcss";`.
- для Vite + Tailwind CSS entrypoint импортируется из `src/main.tsx`.

## Documentation

Обновить `packages/cli/README.md`:

- добавить `create` в таблицу commands;
- добавить примеры Next/Vite;
- описать options;
- указать, что Tailwind включен по умолчанию;
- указать `--css none`.

`API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` не обновлять, если публичные TypeScript API/types не меняются.

## Tests

Добавить Vitest-покрытие для:

- normalize options;
- unknown template/css/package manager;
- missing required `--template`;
- default values:
  - `--css tailwind`;
  - `--package-manager pnpm`;
  - `--install`;
- `--no-install`;
- `--no-install` skips install command;
- missing `<project-name>`;
- public `--agents-md` option is rejected;
- target path normalization relative to `context.cwd`;
- invalid target paths:
  - empty;
  - `.`;
  - `..`;
  - absolute path;
  - path with `..` segment;
- nested target path with existing parent directory;
- missing target parent directory;
- missing target parent directory does not call scaffold command;
- existing target directory;
- existing target directory does not call scaffold command;
- template registry;
- css registry;
- package manager command generation;
- табличные тесты для всех package managers:
  - Next scaffold command;
  - Vite scaffold command;
  - install command;
  - dev command;
- `runCommand` receives correct `cwd`:
  - scaffold uses `context.cwd`;
  - install uses target directory;
- `runCommand` receives args array and no shell contract;
- external command failure includes stage, command, cwd, exit code and stderr tail in diagnostic;
- external command spawn failure includes stage, command, cwd and original error message in diagnostic;
- package.json patch;
- filesystem write failure diagnostics;
- lite-fsm dependency versions are `latest`;
- Next Tailwind scaffold args;
- Next `--css none` scaffold args;
- Next `--no-agents-md`;
- Next provider file starts with `"use client"`;
- Vite Tailwind overlay;
- Vite `--css none`;
- `--css none` does not add Tailwind dependencies or plugin;
- Vite alias patch;
- TypeScript paths patch;
- Vite CSS entrypoint import in `src/main.tsx`;
- lite-fsm store overlay files;
- provider patch for Next;
- provider patch for Vite;
- generated project validation;
- validation failure diagnostics;
- scaffold command failure diagnostics;
- install command failure diagnostics;
- install failure does not delete target directory;
- file patch failure diagnostics;
- post-scaffold failure does not delete target directory;
- successful stdout next steps;
- successful fake end-to-end flow for Next Tailwind;
- successful fake end-to-end flow for Vite Tailwind;
- command boundary через `createProgram`;
- fake `runCommand`, без network и реальных scaffold-команд.

Fake scaffold fixtures должны моделировать актуальную минимальную структуру generated Next/Vite проектов:

- `package.json`;
- Next `src/app/layout.tsx`;
- Vite `src/main.tsx`;
- Vite `vite.config.ts`;
- TypeScript config files;
- CSS entrypoint.

Команды проверки:

```bash
pnpm --filter @lite-fsm/cli test:unit
pnpm --filter @lite-fsm/cli check-types
```

Docs build не запускать.

## Последовательность задач

1. Добавить diagnostic codes для `create-project`.
2. Реализовать `dependencies.ts` и типы external command runner.
3. Реализовать `options.ts`.
4. Реализовать `package-manager.ts`.
5. Реализовать `package-json.ts`.
6. Реализовать `write-files.ts`.
7. Реализовать template/css types и registries.
8. Реализовать shared lite-fsm store overlay.
9. Реализовать Next framework template.
10. Реализовать Vite framework template.
11. Реализовать `none` CSS adapter.
12. Реализовать Next Tailwind CSS adapter.
13. Реализовать Vite Tailwind CSS adapter.
14. Реализовать patch-функции для `vite.config.ts`, `src/main.tsx`, `src/app/layout.tsx`.
15. Реализовать validation generated project.
16. Реализовать `run-create-project.ts`.
17. Реализовать `command.ts`.
18. Зарегистрировать команду в `create-program.ts`.
19. Добавить unit tests для чистых модулей.
20. Добавить command boundary tests.
21. Обновить `packages/cli/README.md`.
22. Запустить разрешенные проверки CLI.
