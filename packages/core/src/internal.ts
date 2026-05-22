// Internal-symbols для координации MachineManager ↔ bundled middleware.

// Symbol-slot для `createEffect`: per-instance cleanup-callback в actor bag без расширения public API.
export const REGISTER_BAG_DISPOSE = Symbol.for("lite-fsm.registerBagDispose");
