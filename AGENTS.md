# AGENTS.md

## Project

`lite-fsm` is a lightweight TypeScript finite state machine library.

- `lite-fsm`: framework-agnostic FSM core, `createMachine`, `MachineManager`, effects and middleware.
- `lite-fsm/react`: React context and hooks.
- `lite-fsm/middleware`: optional middleware integrations, including DevTools and Immer.

## Guidelines

- Keep the public API small, predictable and strongly typed.
- Prefer simple TypeScript functions and `type` aliases over extra abstractions.
- Preserve ESM/CJS exports and generated `.d.ts`/`.d.cts` package types.
- Add or update Vitest tests for runtime behavior and Tstyche tests for type behavior.
- Do not add runtime dependencies lightly; React, Immer and `use-sync-external-store` are peer/optional.
- Use `npm` commands from the repo root.

## Structure

- `src/core/`: FSM runtime, manager, types and interfaces.
- `src/react/`: React provider, context and hooks.
- `src/middleware/`: middleware entrypoints and integrations.
- `tests/`: runtime tests, smoke tests and Tstyche type tests.
- `docs/` and `playground/`: documentation and demos.

## Commands

- `npm run test`: run Vitest tests.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run test:types`: run source type tests with Tstyche.
- `npm run check-types`: run TypeScript checks and source type tests.
- `npm run lint`: run ESLint.
- `npm run build`: build ESM/CJS bundles and declarations.
- `npm run test:types:dist`: validate built package types.
- `npm run verify:release`: full release verification.
- `npm run docs:dev`: start docs locally.
- `npm run playground:dev`: start playground locally.
