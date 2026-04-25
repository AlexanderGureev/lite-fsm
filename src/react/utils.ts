import React from "react";

/* v8 ignore next -- Selected branch depends on the module environment. */
export const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;
