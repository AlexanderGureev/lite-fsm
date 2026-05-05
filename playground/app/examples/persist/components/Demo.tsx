"use client";

import { useSelector } from "../store";

export function Demo() {
  const { id } = useSelector((rootState) => rootState.profile.context);

  return <div>{id}</div>;
}
