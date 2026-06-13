import type { TypedUseManagerHook, TypedUseSelectorHook, TypedUseTransitionHook } from "@lite-fsm/react";
import {
  useManager as useLiteFsmManager,
  useSelector as useLiteFsmSelector,
  useTransition as useLiteFsmTransition,
} from "@lite-fsm/react";
import type {
  TypedUseEntityCountHook,
  TypedUseEntityListHook,
  TypedUseEntitySnapshotHook,
  EntityListOptions,
} from "@lite-fsm/entities/react";
import {
  useEntityCount as useLiteFsmEntityCount,
  useEntityList as useLiteFsmEntityList,
  useEntitySnapshot as useLiteFsmEntitySnapshot,
} from "@lite-fsm/entities/react";
import type { EntityId } from "@lite-fsm/entities";

import type { AppMachines } from ".";
import type { AppEvents } from "./types";

export const useGameManager: TypedUseManagerHook<AppMachines, AppEvents> = useLiteFsmManager;
export const useGameSelector: TypedUseSelectorHook<AppMachines> = useLiteFsmSelector;
export const useGameTransition: TypedUseTransitionHook<AppEvents> = useLiteFsmTransition;

export const useGameEntitySnapshot: TypedUseEntitySnapshotHook<AppMachines> = <
  Key extends Parameters<TypedUseEntitySnapshotHook<AppMachines>>[0],
>(
  templateKey: Key,
  entityId: EntityId | null | undefined,
) => useLiteFsmEntitySnapshot<AppMachines, Key>(templateKey, entityId);

export const useGameEntityCount: TypedUseEntityCountHook<AppMachines> = <
  Key extends Parameters<TypedUseEntityCountHook<AppMachines>>[0],
>(
  templateKey: Key,
  options?: EntityListOptions,
) => useLiteFsmEntityCount<AppMachines, Key>(templateKey, options);

export const useGameEntityList: TypedUseEntityListHook<AppMachines> = <
  Key extends Parameters<TypedUseEntityListHook<AppMachines>>[0],
>(
  templateKey: Key,
  options?: EntityListOptions,
) => useLiteFsmEntityList<AppMachines, Key>(templateKey, options);
