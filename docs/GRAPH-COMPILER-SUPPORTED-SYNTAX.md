# Graph Compiler: поддерживаемый синтаксис автоматов

Статус: краткий справочник по фактической реализации `@lite-fsm/graph`.

Источники правды:

- [`packages/graph/src/compiler/`](packages/graph/src/compiler/) - single-file compiler.
- [`packages/graph/src/project/`](packages/graph/src/project/) - project compiler.
- [`tests/graph/fixtures/graph-sources.ts`](tests/graph/fixtures/graph-sources.ts) - основной fixture-контракт.
- [`tests/graph/*compiler*.test.ts`](tests/graph/) - edge cases по `config`, `reducer`, `effects`, `MachineManager` и project mode.

Компилятор строит `LiteFsmGraphDocument` статически. Он не исполняет пользовательский код, `MachineManager`, `reducer`, `effect`, timers, async ordering, middleware, `dehydrate` и `hydrate`.

## Входы

Single-file:

```ts
compileLiteFsmGraph(source, {
  filename: "machine.ts",
  maxMachines: 10,
});
```

Project mode:

```ts
compileLiteFsmGraphProject({
  entryFileName: "/project/store/index.ts",
  projectRoot: "/project",
  host,
});
```

Single-file режим читает только переданную строку. Project mode резолвит файлы через `host`, выбирает один поддержанный `MachineManager(...)` в entry-файле и компилирует найденные машины.

## API provenance

Поддерживаются named imports из `@lite-fsm/core` и `lite-fsm`, включая aliases:

```ts
import { createMachine, MachineManager } from "@lite-fsm/core";
import { createMachine as makeMachine } from "lite-fsm";

export const machine = makeMachine({
  config: { IDLE: {} },
  initialState: "IDLE",
  initialContext: {},
});
```

В single-file режиме дополнительно поддержаны ambient names `createMachine`, `createConfig`, `createReducer`, `createEffect`, `MachineManager`, если они не перекрыты локальным value binding.

Для ambient `createMachine(...)` дополнительно проверяется, что первый аргумент выглядит как machine options с `config`, `initialState`, `initialContext`.

Не поддерживаются:

```ts
import * as core from "@lite-fsm/core";
core.createMachine({ config: {}, initialState: "IDLE", initialContext: {} });

const makeMachine = createMachine;
makeMachine({ config: {}, initialState: "IDLE", initialContext: {} });
```

В project mode ambient `createMachine` не принимается: provenance должен быть доказан через core import или typed helper wrapper.

## Machine options

Первый аргумент `createMachine(...)` должен быть object literal. Вокруг него раскрываются скобки, `as`, `satisfies`, type assertion.

Поддержанные формы обнаружения машин:

```ts
const localMachine = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
export const exportedMachine = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
export default createMachine({ config: {}, initialState: "IDLE", initialContext: {} });

register(createMachine({ config: {}, initialState: "IDLE", initialContext: {} }));
```

У вложенного `createMachine(...)` вне собственного initializer-а не будет `variableName`, но machine candidate все равно попадет в документ.

Поддержанные option keys:

- `config`
- `initialState`
- `initialContext`
- `reducer`
- `effects`
- `groupTag`
- `persistence`

Ключи могут быть identifier, string literal или shorthand:

```ts
const config = { IDLE: {} } as const;
const initialState = "IDLE";
const initialContext = {};

export const machine = createMachine({
  "config": config,
  initialState,
  initialContext,
});
```

`groupTag` должен быть static string. `persistence` поддерживает только `"runtime"` и `"snapshot"`.

`initialContextJson` заполняется только для JSON-safe object:

```ts
const initialContext = {
  count: 1,
  nested: { ok: true },
  list: [1, "x", null],
};
```

Для scalar/function/array context compiler сохраняет только `initialContextSummary`, без `initialContextJson`:

```ts
createMachine({ config: {}, initialState: "IDLE", initialContext: "value" });
createMachine({ config: {}, initialState: "IDLE", initialContext: () => ({}) });
createMachine({ config: {}, initialState: "IDLE", initialContext: [] });
```

## Частичное вычисление

Поддержано:

- local `const` bindings;
- object/array literals;
- string/no-substitution template, number, boolean, `null`, `undefined`;
- function expressions, arrow functions, method declarations;
- object spread из local object literal;
- static identifier/string/numeric object keys;
- computed object key из local string const;
- `as const`, `satisfies`, type assertion, parenthesized expressions;
- `createConfig(...)`, `createReducer(...)`, `createEffect(...)` как transparent wrappers в ожидаемых позициях.

Пример:

```ts
const READY = "READY";
const shared = { RESET: "IDLE" } as const;

const config = {
  IDLE: {
    GO: READY,
    ...shared,
  },
  READY: {},
} as const;
```

Не поддержано:

- imported runtime values в single-file режиме;
- `let`/`var` как источник вычисления;
- destructuring `const` bindings как источник вычисления;
- factories вроде `config: buildConfig()` или `createMachine(getOptions())`;
- dynamic computed keys;
- const cycles;
- arbitrary expressions вроде `1 + 2`, если нужна статическая строка или объект.

## `config`

Базовая форма:

```ts
const OPEN = "OPEN";

export const door = createMachine({
  config: createConfig({
    CLOSED: {
      [OPEN]: "OPENED",
      PATCH: null,
      SKIP: undefined,
    },
    OPENED: {
      CLOSE: "CLOSED",
    },
  }),
  initialState: "CLOSED",
  initialContext: {},
});
```

Поддержанные targets:

- static string - state target или terminal target;
- `null` - self/targetless transition;
- `undefined` - transition игнорируется;
- dynamic/external expression - `dynamic` target с diagnostic;
- unsupported literal kind - `unknown` target с diagnostic.

Duplicate config entries сохраняются как отдельные transitions с исходным порядком:

```ts
config: {
  IDLE: {
    GO: "READY",
    GO: null,
  },
  READY: {},
}
```

Wildcard source поддержан как отдельный source state:

```ts
createMachine({
  config: {
    "*": { RESET: "IDLE" },
    IDLE: { LOGIN: "SIGNED_IN" },
    SIGNED_IN: {},
  },
  initialState: "IDLE",
  initialContext: {},
});
```

`"*"` не поддержан как target. Terminal targets:

```ts
"__RESOLVED";
"__REJECTED";
"__CANCELLED";
```

Actor template определяется по наличию `__INIT` в `config`:

```ts
export const job = createMachine({
  groupTag: "jobs",
  persistence: "snapshot",
  config: {
    __INIT: { SPAWN: "RUNNING" },
    RUNNING: {
      COMPLETE: "__RESOLVED",
      FAIL: "__REJECTED",
    },
    "*": { CANCEL: "__CANCELLED" },
  },
  initialState: "__INIT",
  initialContext: {},
});
```

State entry должен быть object literal. Getter, method state entry и non-object state entry дают diagnostic.

## `reducer`

Reducer анализируется как символический слой поверх acceptance из `config`. Reducer case не создает acceptance transition для события, которого нет в `config` или wildcard.

Поддержанные reducer forms:

- inline arrow function;
- function expression;
- local `const` function;
- shorthand или string option key;
- `createReducer(fn)` wrapper;
- wrappers `as`/`satisfies`/скобки вокруг reducer expression.

Параметры:

```ts
reducer: (state, action, { nextState }) => {};
reducer: (s, action, { nextState: target }) => {};
```

Первый и второй параметры должны быть identifiers. `nextState` распознается только из object binding третьего параметра, включая alias.

Поддержанные ветки:

```ts
reducer: (state, action, { nextState }) => {
  switch (action.type) {
    case "SUBMIT":
      state.state = action.payload.ok ? "VALID" : "INVALID";
      return;
    case "RESET":
      return { state: nextState, context: state.context };
    default:
      state.state = nextState;
  }
};
```

```ts
reducer: (state, action) => {
  if (action.type === "DECIDE" && action.payload.score > 80) {
    state.state = "HIGH";
  } else if ("DECIDE" === action.type && action.payload.score > 40) {
    state.state = "MEDIUM";
  } else {
    state.state = "LOW";
  }
};
```

Поддержано:

- `switch (action.type)`, static string/local const `case`, `default`;
- `if`/`else if`/`else`;
- `action.type === "EVENT"` и `"EVENT" === action.type`;
- `&&` с дополнительными payload guards;
- unbraced `if`;
- expression-body reducer, возвращающий `{ state, context }`;
- eventless write, если событие выводится из remaining accepted config events;
- несколько `state.state = ...` внутри одной branch.

Поддержанные state writes:

```ts
state.state = "READY";
s.state = "READY";
state.state = nextState;
state.state = action.payload.ok ? "A" : "B";
return { state: "READY", context: state.context };
```

Не поддерживаются alias/computed/helper mutations:

```ts
const draft = state;
draft.state = "READY";

state["state"] = "READY";
setState(state, "READY");

if (action.kind === "GO") {
  state.state = "READY";
}
```

Такие формы дают diagnostics и, где возможно, partial reducer case.

## `effects`

Effects анализируются как слой emitted events. Emission не становится state transition.

Поддержанные effects forms:

- inline object literal;
- local `const` effects object;
- local object spread;
- state key и wildcard key `"*"`;
- computed key из local string const;
- plain arrow/function expression/method effect;
- local effect function;
- inline/local `createEffect({ type, effect, cancelFn })`;
- `cancelFn` игнорируется.

Пример:

```ts
const localEffect = ({ action, transition }) => {
  if (action.type === "START") {
    transition({ type: "DONE" });
  }
};

const effects = {
  LOADING: localEffect,
  "*": createEffect({
    type: "latest",
    effect: ({ transition }) => transition({ type: "AUDIT" }),
    cancelFn: () => undefined,
  }),
} as const;
```

Параметры effect:

```ts
effects: {
  READY: ({ action, transition, self }) => {
    transition({ type: "DONE" });
  },
  IDLE({ "transition": send, "action": act }) {
    if (act.type === "A") send({ type: "A_DONE" });
  },
}
```

Первый параметр может быть identifier `transition` или object binding с `transition`. `action` и `self` опциональны. Nested/computed binding для `transition` не поддержан.

Поддержанные direct calls:

```ts
transition({ type: "DONE" });
transition({ type: DONE });
transition({ type: "DONE", payload: { ok: true } });
return transition({ type: "RETURNED" });
const result = transition({ type: "DECLARED" });
await transition({ type: "AWAITED" });
```

Поддержаны `if`/`else if`/`else` и `switch (action.type)` как guard labels. Если `switch` не по `action.type`, emissions сохраняются partial с diagnostic.

Routing через `meta` поддержан и в domain, и в actor template effects:

```ts
transition({ type: "LOCAL_DONE" });
transition({ type: "ACTOR_DONE", meta: { actorId: "actor-1" } });
transition({ type: "GROUP_DONE", meta: { groupId: ["g1", "g2"] } });
transition({ type: "TAG_DONE", meta: { groupTag: "workers" } });
transition({ type: "SELF", meta: { actorId: self.actorId } });
```

Actor routing sugar поддержан только в actor template effects:

```ts
transition.unscoped({ type: "CANCEL" });
transition.actor("job-1", { type: "COMPLETE" });
transition.actor([self.actorId], { type: "COMPLETE" });
transition.group(self.groupId, { type: "COMPLETE" });
transition.tag(["jobs", "urgent"], { type: "CANCEL" });
```

Не поддерживаются dynamic event objects и escaped/deferred transition:

```ts
transition();
transition("DONE");
transition({ type: action.type });

const send = transition;
send({ type: "DONE" });

setTimeout(() => transition({ type: "DONE" }), 10);
runExternalService(transition);
```

Nested/deferred calls не извлекаются. Escape `transition` дает `LFG_EFFECT_TRANSITION_ESCAPED`.

## `MachineManager` в single-file режиме

Поддержано:

```ts
import { createMachine, MachineManager } from "@lite-fsm/core";

const first = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
const second = createMachine({ config: { READY: {} }, initialState: "READY", initialContext: {} });
const computedKey = "second";

const machines = {
  first,
  [computedKey]: second,
  inline: createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} }),
};

export const manager = MachineManager(machines, {});
```

Machine map поддерживает object literal или local `const` object literal, local object spread, shorthand entries, static string/numeric keys, computed key из local string const, local machine variables, transparent wrappers вокруг values и inline `createMachine(...)`.

```ts
MachineManager({
  wrapped: (((first) as const) satisfies unknown),
  duplicate: first,
  duplicate: first,
});
```

Duplicate refs сохраняются в `manager.machineRefs`, а `machine.managerKeys` дедуплицируются.

Не поддержано:

```ts
const alias = first;
MachineManager({ alias });

MachineManager({ helper: createMachineFactory() });
MachineManager(getMachines());
```

## Project mode

Entry-файл должен содержать ровно один поддержанный `MachineManager(...)`.

Поддержано:

```ts
import { MachineManager } from "@lite-fsm/core";
import * as machines from "./machines";

const { root, ...rest } = machines;
const cfg = { root, ...rest };

export const manager = MachineManager(cfg);
```

Также поддержан top-level expression statement:

```ts
MachineManager({ root });
```

И factory верхнего уровня:

```ts
export const makeStore = () => MachineManager({ root });

export const makeStoreWithDeps = () => {
  const manager = MachineManager({ root });
  manager.setDependencies({});
  return manager;
};
```

Project manager map поддерживает:

- object literal или local `const` object literal в entry source;
- local object spread;
- spread namespace import/rest из project barrel;
- spread project import, если export резолвится в object literal;
- shorthand и property assignments;
- static string/numeric keys;
- direct namespace access `machines.root`;
- import/re-export chains через named exports;
- type-only и недостижимые imports не читаются, если они не нужны для manager map.

Project machine entries должны ссылаться на local/imported machine binding:

```ts
import { root } from "./machines/root";
import * as machines from "./machines";

export const manager = MachineManager({
  root,
  secondary: machines.secondary,
});
```

Inline `createMachine(...)` внутри project manager map сейчас не поддержан.

Computed keys в project manager map сейчас не поддержаны, даже если выражение статически выглядит строковым.

Поддержанные barrel forms:

```ts
export { root } from "./root";
export { flow as renamedFlow } from "./flow";
```

`export * from "./machines"` как project graph barrel не поддержан.

Typed helper wrappers поддержаны для `createMachine`, `createConfig`, `createReducer`, `createEffect`, если это простая typed const-обертка над core helper:

```ts
import type { TypedCreateMachineFn, TypedCreateConfigFn } from "@lite-fsm/core";
import {
  createConfig as baseCreateConfig,
  createMachine as baseCreateMachine,
} from "@lite-fsm/core";

export const createMachine: TypedCreateMachineFn<never, never> = baseCreateMachine;
export const createConfig: TypedCreateConfigFn<never> = baseCreateConfig;
```

Такие wrappers могут проходить через named re-export chain.

Project mode не поддерживает несколько managers в entry, `export default MachineManager(...)`, nested factories, manager call внутри object/wrapper initializer, `core.MachineManager(...)`, external machine modules без project source, `export *` barrels и ambient `createMachine` в machine files.

## Partial graph и diagnostics

Компилятор старается вернуть документ вместо падения:

- dynamic config target становится `GraphTarget.kind = "dynamic"`;
- unsupported target kind становится `GraphTarget.kind = "unknown"`;
- reducer branch с неподдержанным target сохраняет case с `confidence: "unknown"`;
- effect emission с dynamic routing target сохраняется с `confidence: "partial"`;
- effect с dynamic event type emission не создает;
- unresolved config/reducer/effects/manager map оставляют машину или manager в документе без соответствующих slices.

`analyzeLiteFsmGraph(...)` работает отдельным semantic layer поверх IR и не является частью синтаксического парсинга.
