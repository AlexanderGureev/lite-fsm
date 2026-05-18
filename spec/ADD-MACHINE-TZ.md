# ТЗ: `lite-fsm add-machine`

## Цель

Добавить в `@lite-fsm/cli` команду для быстрого добавления нового domain machine в проект, созданный через:

```bash
lite-fsm create my-app --template vite
lite-fsm create my-app --template next
```

Команда должна избавить пользователя от ручного создания файла автомата и ручного подключения его в `src/store`.

## Команда

Публичный интерфейс v1:

```bash
lite-fsm add-machine <name>
```

Пример для разработки из монорепы:

```bash
cd vite-test
node ../packages/cli/scripts/lite-fsm-dev.mjs add-machine user-session
```

Команда всегда работает относительно `cwd` проекта. В v1 нет аргументов пути к проекту и нет опции `--store`.

## Архитектура реализации

Команду нужно реализовать как маленький `plan/apply` pipeline, а не как набор прямых записей в filesystem. Это сохраняет атомарность v1 и оставляет понятные точки расширения для будущих опций.

Рекомендуемая структура:

```txt
packages/cli/src/add-machine/
  command.ts          # commander wrapper + diagnostics output
  options.ts          # raw CLI options -> AddMachineOptions
  name.ts             # <name> -> fileName/exportName/eventType/eventNamespace
  store-shape.ts      # чтение и проверка generated src/store
  patch-index.ts      # pure patcher для src/store/index.ts
  patch-types.ts      # pure patcher для src/store/types.ts
  template.ts         # machine file contents
  run-add-machine.ts  # orchestration: validate -> plan -> write
```

Командный слой должен быть тонким:

```ts
registerAddMachineCommand(program, context, setResult)
runAddMachineCommand(context, rawOptions)
```

Он отвечает только за интеграцию с `commander`, запись formatted diagnostics в `stderr` и сохранение `CommandResult`.

Основная логика живет в `run-add-machine.ts` и делится на два этапа:

```ts
const plan = createAddMachinePlan(context, options);
if (!plan.ok) return createCommandResult(plan.diagnostics);

const result = applyAddMachinePlan(context, plan.plan);
```

Внутренний контракт плана:

```ts
type AddMachinePlan = {
  machine: NormalizedMachineName;
  files: {
    create: { relativePath: string; contents: string }[];
    update: { relativePath: string; contents: string }[];
  };
};
```

`createAddMachinePlan` должен прочитать текущий store, проверить структуру, проверить конфликты и построить все будущие содержимые файлов в памяти. Он не должен писать на диск.

`applyAddMachinePlan` должен только применить уже готовый план. Если план не построен, filesystem не меняется.

Атомарность v1 означает отсутствие записей до успешно построенного плана. Если ошибка записи возникла уже во время `applyAddMachinePlan`, команда возвращает `LFC_WRITE_FAILED`, но rollback ранее записанных файлов в v1 не требуется. Это соответствует текущему поведению `create` pipeline.

### Границы ответственности

`options.ts`:

- валидирует наличие `<name>`;
- возвращает `LFC_INVALID_OPTIONS` для отсутствующего или нестрокового имени;
- не знает про filesystem и шаблоны.

`name.ts`:

- единственный владелец naming policy;
- поддерживает `kebab-case`, `snake_case`, `camelCase`;
- возвращает `fileName`, `exportName`, `eventType`, `eventNamespace`;
- проверяет, что `exportName` является валидным JS identifier.

`store-shape.ts`:

- единственный владелец текущего generated store layout;
- знает относительные пути `src/store/index.ts`, `src/store/types.ts`, `src/store/create-machine.ts`, `src/store/machines`;
- читает source файлов;
- возвращает структурированный snapshot store или diagnostics.

`patch-index.ts`:

- чистая функция без filesystem;
- принимает source `index.ts` и `NormalizedMachineName`;
- возвращает patched source или `LFC_ADD_MACHINE_PATCH_FAILED`;
- отвечает только за import и key в `machines`.

`patch-types.ts`:

- чистая функция без filesystem;
- принимает source `types.ts` и `NormalizedMachineName`;
- возвращает patched source или `LFC_ADD_MACHINE_PATCH_FAILED`;
- отвечает только за type import machine events и union `AppEvents`.

`template.ts`:

- единственный владелец текста нового machine file;
- в будущем может выбрать другой template без изменения patchers.

`run-add-machine.ts`:

- orchestrator без string-patching деталей;
- порядок: normalize options -> read store -> detect conflicts -> patch in memory -> write plan -> print success.

### Расширяемость

Новые возможности должны добавляться через существующие владельцы:

| Возможность | Где расширять |
| --- | --- |
| `--event` | `options.ts` + `name.ts` |
| `--store src/shared/store` | `options.ts` + `store-shape.ts` |
| `--template effect` | `options.ts` + `template.ts` |
| actor template | новый template или отдельная команда поверх общего plan/apply подхода |
| поддержка другого store layout | `store-shape.ts` + новые patchers |

В v1 не нужно добавлять registry для templates или store layouts. Registry стоит вводить только когда появится минимум второй реально поддерживаемый template/layout. До этого явные модули проще тестировать и дешевле поддерживать.

## Поддерживаемая структура проекта

v1 поддерживает только store shape, который генерирует `lite-fsm create`:

```txt
src/store/create-machine.ts
src/store/deps.ts
src/store/hooks.ts
src/store/index.ts
src/store/types.ts
src/store/machines/
```

Минимально обязательные файлы для команды:

```txt
src/store/create-machine.ts
src/store/index.ts
src/store/types.ts
src/store/machines/
```

Если структура не найдена или файл не похож на generated shape, команда должна завершиться с diagnostic и `exitCode: 1`.

## Нормализация имени

`<name>` принимает `kebab-case`, `snake_case` и `camelCase`.

Пример:

```bash
lite-fsm add-machine user-session
```

Нормализованные значения:

```txt
file name: src/store/machines/user-session.ts
export name / machine key: userSession
event type: DO_USER_SESSION_INIT
event namespace import: userSession
```

Имя должно давать валидный JavaScript identifier для export/key. Невалидное имя завершается `LFC_INVALID_OPTIONS`.

Ожидаемые примеры нормализации:

| Input | fileName | exportName | eventType | eventNamespace |
| --- | --- | --- | --- | --- |
| `user-session` | `user-session` | `userSession` | `DO_USER_SESSION_INIT` | `userSession` |
| `user_session` | `user-session` | `userSession` | `DO_USER_SESSION_INIT` | `userSession` |
| `userSession` | `user-session` | `userSession` | `DO_USER_SESSION_INIT` | `userSession` |

Команда должна отклонять имена с пустыми сегментами, leading digit после нормализации, невалидными символами, reserved JavaScript keywords или конфликтом после нормализации с уже существующим machine key/export.

## Генерируемый machine file

Команда создает минимальный domain machine без `effects`, `reducer`, `groupTag`, actor lifecycle и кастомного context:

```ts
import type { FSMEvent } from "@lite-fsm/core";
import { createMachine } from "../create-machine";

export type Events = FSMEvent<"DO_USER_SESSION_INIT">;

export const userSession = createMachine({
  config: {
    IDLE: { DO_USER_SESSION_INIT: "READY" },
    READY: {},
  },
  initialState: "IDLE",
  initialContext: {},
});
```

v1 всегда использует:

```txt
initialState: "IDLE"
target state: "READY"
initialContext: {}
event: DO_<NAME>_INIT
```

Дополнительные template options вроде `--event`, `--initial-state`, `--context`, `--actor` в v1 не нужны.

## Патч `src/store/index.ts`

Команда должна добавить import рядом с существующими machine imports и добавить key в `machines`.

До:

```ts
import { MachineManager, type MachinesState } from "@lite-fsm/core";
import { immerMiddleware } from "@lite-fsm/middleware/immer";
import { app } from "./machines/app";
import type { AppEvents } from "./types";

export const machines = {
  app,
};
```

После:

```ts
import { MachineManager, type MachinesState } from "@lite-fsm/core";
import { immerMiddleware } from "@lite-fsm/middleware/immer";
import { app } from "./machines/app";
import { userSession } from "./machines/user-session";
import type { AppEvents } from "./types";

export const machines = {
  app,
  userSession,
};
```

Порядок вставки: append после существующих machine imports и после существующих keys в `machines`.

В v1 достаточно targeted string patchers под generated shape. TypeScript AST не требуется.

## Патч `src/store/types.ts`

`src/store/types.ts` должен оставаться агрегатором событий, а не местом, куда разработчик руками дописывает события каждого автомата. Команда добавляет type namespace import нового machine module и подключает его `Events` type в `AppEvents`.

```ts
import type * as userSession from "./machines/user-session";

export type AppEvents =
  | ExistingEvents
  | userSession.Events;
```

Генерируемый machine file обязан экспортировать:

```ts
export type Events = FSMEvent<"DO_USER_SESSION_INIT">;
```

### Старый inline AppEvents формат

Команда должна поддержать текущий generated `types.ts`:

```ts
import type { FSMEvent } from "@lite-fsm/core";

export type AppEvents = FSMEvent<"DO_INIT">;
```

Ожидаемый результат:

```ts
import type { FSMEvent } from "@lite-fsm/core";
import type * as userSession from "./machines/user-session";

export type AppEvents =
  | FSMEvent<"DO_INIT">
  | userSession.Events;
```

Если старый generated shape содержит несколько event literals внутри `FSMEvent`, команда может сохранить их внутри одного existing member:

```ts
import type { FSMEvent } from "@lite-fsm/core";
import type * as userSession from "./machines/user-session";

export type AppEvents =
  | FSMEvent<"DO_INIT" | "DO_OTHER_INIT">
  | userSession.Events;
```

Также поддерживается старый union из нескольких `FSMEvent<...>`:

```ts
export type AppEvents = FSMEvent<"DO_INIT"> | FSMEvent<"DO_OTHER_INIT">;
```

Ожидаемый результат:

```ts
import type { FSMEvent } from "@lite-fsm/core";
import type * as userSession from "./machines/user-session";

export type AppEvents =
  | FSMEvent<"DO_INIT">
  | FSMEvent<"DO_OTHER_INIT">
  | userSession.Events;
```

### Новый aggregator shape

Если `types.ts` уже использует machine-local event modules:

```ts
import type * as app from "./machines/app";

export type AppEvents = app.Events;
```

команда добавляет новый import и union member:

```ts
import type * as app from "./machines/app";
import type * as userSession from "./machines/user-session";

export type AppEvents =
  | app.Events
  | userSession.Events;
```

Если `AppEvents` в `src/store/types.ts` уже содержит inline payload unions, кастомные generic-типы или иной сложный shape, команда должна завершиться с `LFC_ADD_MACHINE_PATCH_FAILED` и подсказкой подключить machine events вручную.

Payload events остаются поддержанным пользовательским сценарием, но они должны жить внутри machine-local type alias:

```ts
// src/store/machines/user-session.ts
export type Events =
  | FSMEvent<"LOGIN", { email: string }>
  | FSMEvent<"LOGOUT">;
```

После генерации разработчик должен иметь возможность менять события нового автомата только в `src/store/machines/user-session.ts`, не заходя в `src/store/types.ts`.

## Обновление `create` template

В рамках этой задачи нужно обновить store overlay, который генерирует `lite-fsm create`, чтобы новые проекты сразу использовали aggregator shape.

`packages/cli/src/create-project/templates/shared-store.ts` должен генерировать `src/store/machines/app.ts` с machine-local events:

```ts
import type { FSMEvent } from "@lite-fsm/core";
import { createMachine } from "../create-machine";

export type Events = FSMEvent<"DO_INIT">;

export const app = createMachine({
  config: {
    IDLE: { DO_INIT: "READY" },
    READY: {},
  },
  initialState: "IDLE",
  initialContext: {},
  effects: {
    READY: ({ getState }) => {
      const root = getState();
      if (root.app.state !== "READY") return;
    },
  },
});
```

`src/store/types.ts` в новых проектах должен быть aggregator:

```ts
import type * as app from "./machines/app";

export type AppEvents = app.Events;
```

Это не меняет runtime API, но делает `app` и все будущие машины одинаковыми: события конкретного автомата редактируются в файле этого автомата.

## Конфликты

Команда должна завершаться без изменений при любом preflight-конфликте:

```txt
src/store/machines/user-session.ts уже существует
machines уже содержит userSession
src/store/types.ts уже содержит import namespace userSession
src/store/types.ts уже содержит userSession.Events
старый inline AppEvents формат уже содержит DO_USER_SESSION_INIT
```

Проверка literal event `DO_USER_SESSION_INIT` обязательна только для старого inline `AppEvents` формата, где `FSMEvent<...>` записан прямо в `src/store/types.ts`. В aggregator-схеме команда не обязана читать все machine files и гарантировать глобальную уникальность event literal по всему проекту.

В v1 нет `--force`.

Перед записью файлов команда должна:

1. Проверить store structure.
2. Нормализовать имя.
3. Проверить конфликты.
4. Построить все patch results в памяти.
5. Только после этого писать файлы.

## Diagnostics

Добавить diagnostic codes:

```ts
"LFC_ADD_MACHINE_STORE_NOT_FOUND"
"LFC_ADD_MACHINE_CONFLICT"
"LFC_ADD_MACHINE_PATCH_FAILED"
```

Переиспользовать существующие:

```ts
"LFC_INVALID_OPTIONS"
"LFC_WRITE_FAILED"
```

Рекомендации по применению:

| Code | Когда использовать |
| --- | --- |
| `LFC_INVALID_OPTIONS` | отсутствует `<name>` или имя невозможно нормализовать в валидный identifier |
| `LFC_ADD_MACHINE_STORE_NOT_FOUND` | нет ожидаемого `src/store` shape |
| `LFC_ADD_MACHINE_CONFLICT` | уже существует файл, machine key, event namespace import, `Events` union member или event literal в старом inline `AppEvents` формате |
| `LFC_ADD_MACHINE_PATCH_FAILED` | `index.ts` или `types.ts` не соответствует поддерживаемому shape |
| `LFC_WRITE_FAILED` | ошибка записи файла |

## Success output

При успешном добавлении команда печатает короткий отчет:

```txt
Added machine userSession.

Files:
  src/store/machines/user-session.ts
  src/store/index.ts
  src/store/types.ts

Use:
  transition({ type: "DO_USER_SESSION_INIT" })
```

Форматтеры, install, lint и другие внешние команды не запускаются.

## Тестирование

Нужны unit-тесты CLI через memory fs, аналогично `tests/cli/create-project/create-project.test.ts`.

Покрыть:

- `add-machine user-session` создает файл, патчит `index.ts`, патчит простой `FSMEvent<"DO_INIT">`.
- Новый machine file экспортирует `Events` рядом с `createMachine`.
- Поддержку `FSMEvent<"DO_INIT" | "DO_OTHER_INIT">`.
- Поддержку `FSMEvent<"DO_INIT"> | FSMEvent<"DO_OTHER_INIT">`.
- Поддержку aggregator shape `import type * as app from "./machines/app"; export type AppEvents = app.Events;`.
- Нормализацию `kebab-case`, `snake_case`, `camelCase`.
- Ошибку при missing name / invalid name.
- Ошибку при missing generated store files.
- Ошибку при existing machine file.
- Ошибку при existing machine key в `machines`.
- Ошибку при existing event namespace import или union member в `AppEvents`.
- Ошибку при unsupported `AppEvents` shape с payload union.
- Ошибку при unsupported `index.ts` shape.
- Обновленный `create` template генерирует `app.Events` и aggregator `src/store/types.ts`.
- Сгенерированный store после `create` + `add-machine` проходит TypeScript check без ошибок type-only import cycle.
- `createProgram(...).parse(["node", "lite-fsm", "add-machine", "user-session"])` регистрирует команду.
- `stdout` содержит success output.
- `stderr` содержит formatted diagnostics при ошибках.

Тесты называются на русском. Runtime behavior покрывается Vitest. Tstyche не нужен, если публичные импортируемые TS-типы не меняются.

Для `packages/cli/src/add-machine/**` требуется строгий 100% coverage по statements, branches, functions и lines. Особенно важно покрыть чистые модули `name.ts`, `store-shape.ts`, `patch-index.ts`, `patch-types.ts`, `template.ts` и ветки orchestration в `run-add-machine.ts`, потому что команда меняет пользовательские файлы.

`packages/cli/vitest.config.ts` нужно обновить так, чтобы `coverage.include` учитывал `src/add-machine/**/*.ts`; иначе требование 100% coverage не будет проверяться CLI coverage job.

## Документация

Обновить:

```txt
packages/cli/README.md
API-CHEATSHEET.md
```

`TYPES-CHEATSHEET.md` обновлять не нужно, если команда не добавляет public TypeScript entrypoint или новые JSON/HTTP contracts.

Не запускать docs build и команды, которые транзитивно запускают docs build.

## Out of scope для v1

- `--store`, `--project`, `--cwd`.
- `--force`.
- Кастомные states/events/context через CLI options.
- Actor templates.
- AST-based patching.
- Автоформатирование.
- Поддержка произвольных пользовательских store layouts.
- Поддержка сложных inline `AppEvents` в `src/store/types.ts` с payload без ручной правки.

## Acceptance criteria

Команда считается готовой, если:

1. `lite-fsm add-machine user-session` в проекте, созданном `lite-fsm create`, добавляет компилируемый domain machine.
2. `src/store/index.ts` импортирует и регистрирует новый machine key.
3. `src/store/machines/user-session.ts` экспортирует `Events`, а `src/store/types.ts` подключает его через `import type * as userSession` и `userSession.Events`.
4. Повторный запуск с тем же именем завершается conflict diagnostic и не перезаписывает файл.
5. `lite-fsm create` генерирует initial `app.Events` и aggregator `src/store/types.ts`, совместимые с `add-machine`.
6. Сгенерированный store после `create` + `add-machine` проходит TypeScript check без ошибок type-only import cycle.
7. Команда работает через dev runner:

   ```bash
   cd vite-test
   node ../packages/cli/scripts/lite-fsm-dev.mjs add-machine user-session
   ```

8. Unit-тесты CLI проходят без запуска docs build.
