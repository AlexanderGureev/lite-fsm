import React from "react";

// SSR-safe layout-effect: на сервере → useEffect (нет DOM-layout фазы).
/* v8 ignore next -- ветка выбирается один раз на module load. */
export const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;
