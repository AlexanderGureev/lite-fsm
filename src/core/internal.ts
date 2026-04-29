// Internal-symbols для координации MachineManager ↔ bundled middleware.

// Sentinel из normalize: transition от имени disposed actor → full no-op.
export const LATE_DISPATCH = Symbol.for("lite-fsm.late-dispatch");

// Symbol-slot для `createEffect`: per-instance cleanup-callback в actor bag без расширения public API.
export const REGISTER_BAG_DISPOSE = Symbol.for("lite-fsm.registerBagDispose");
