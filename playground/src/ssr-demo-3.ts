import type { MachineManagerSnapshot } from "lite-fsm";

import {
  demo2Screens,
  getDemo2Screen,
  loadGridPage,
  loadWidgetSeed,
  type Demo2ScreenConfig,
  type Demo2ScreenId,
  type GridPage,
  type WidgetSeed,
} from "./ssr-demo-2";
import type { FSMConfigType } from "./store";
import { createDemo3EntryFromSeed, getDemo3ListId } from "./store/machines/ssrDemo3EntityList";
import { createDemo3GridScreen } from "./store/machines/ssrDemo3Grid";

export { loadGridPage, loadWidgetSeed };
export type { Demo2ScreenConfig as Demo3ScreenConfig, Demo2ScreenId as Demo3ScreenId };

export const demo3Screens = demo2Screens.map((screen) => ({
  ...screen,
  title: screen.title.replace("Demo 2", "Demo 3"),
  description:
    "Та же manifest-first схема, но серверный seed приходит через FSMHydrationBoundary и MachineManager snapshots.",
})) satisfies Demo2ScreenConfig[];

export const getDemo3Screen = (id: Demo2ScreenId) => ({
  ...getDemo2Screen(id),
  title: getDemo2Screen(id).title.replace("Demo 2", "Demo 3"),
  description:
    "Та же manifest-first схема, но серверный seed приходит через FSMHydrationBoundary и MachineManager snapshots.",
});

export const getDemo3ScreenPath = (id: Demo2ScreenId) => `/ssr-demo-3/${id}`;

export const createDemo3GridSnapshot = (
  screenId: Demo2ScreenId,
  page: GridPage,
): MachineManagerSnapshot<FSMConfigType> => ({
  machines: {
    ssrDemo3Grid: {
      state: "READY",
      context: {
        screens: {
          featured: undefined,
          night: undefined,
          [screenId]: createDemo3GridScreen(screenId, page),
        },
      },
    },
  },
});

export const createDemo3EntityListSnapshot = (seed: WidgetSeed): MachineManagerSnapshot<FSMConfigType> => {
  const entry = createDemo3EntryFromSeed(seed);

  return {
    machines: {
      ssrDemo3EntityList: {
        state: "READY",
        context: {
          lists: {
            [getDemo3ListId(seed.request)]: entry,
          },
        },
      },
    },
  };
};
