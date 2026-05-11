/* eslint-disable @typescript-eslint/no-unused-vars */

// @ts-nocheck
import { createMachine, MachineManager } from "@lite-fsm/core";

export type Events =
  | FSMEvent<"CHECK_ACTIVE_ONBOARDING_RESOLVE", { selected: Artist[] }>
  | FSMEvent<"CHECK_ACTIVE_ONBOARDING_REJECT">
  | FSMEvent<"SAVE_ONBOARDING_STATE_RESOLVE">
  | FSMEvent<"SAVE_ONBOARDING_STATE_REJECT">
  | FSMEvent<"FETCH_ONBOARDING">
  | FSMEvent<"FETCH_ONBOARDING_RESOLVE", { data: Artist[]; pagination: Pagination }>
  | FSMEvent<"FETCH_ONBOARDING_REJECT">
  | FSMEvent<"FINISH_ONBOARDING">
  | FSMEvent<"FINISH_ONBOARDING_RESOLVE">
  | FSMEvent<"FINISH_ONBOARDING_REJECT">;

type Context = {
  data: Artist[] | null;
  pagination: Pagination;
  hasNext: boolean;
};

const initialContext: Context = {
  data: null,
  pagination: {
    limit: 50,
    offset: undefined,
  },
  hasNext: true,
};

const FINISH_DELAY = 2000;

export const onboarding = createMachine({
  config: {
    "*": {
      ONBOARDING_SELECT_ARTIST: "SAVE_ONBOARDING_STATE",
      ONBOARDING_UNSELECT_ARTIST: "SAVE_ONBOARDING_STATE",
      ONBOARDING_SEARCH_SELECT_ARTIST: "SAVE_ONBOARDING_STATE",
      ONBOARDING_SEARCH_UNSELECT_ARTIST: "SAVE_ONBOARDING_STATE",

      FETCH_ONBOARDING_RESOLVE: null,
      FETCH_RELATED_ONBOARDING_RESOLVE: null,

      FINISH_ONBOARDING: "FINISH_ONBOARDING_PENDING",
      IAM_LOGOUT_RESOLVE: "DISABLED",
      IAM_LOGIN_RESOLVE: "CHECK_ACTIVE_ONBOARDING",
    },

    IDLE: {
      DO_INIT: "CHECK_ACTIVE_ONBOARDING",
    },

    CHECK_ACTIVE_ONBOARDING: {
      CHECK_ACTIVE_ONBOARDING_RESOLVE: "STARTUP_ONBOARDING",
      CHECK_ACTIVE_ONBOARDING_REJECT: "DISABLED",
    },

    FETCH_ONBOARDING_PENDING: {
      FETCH_ONBOARDING_RESOLVE: "READY",
      FETCH_ONBOARDING_REJECT: "READY",
    },

    SAVE_ONBOARDING_STATE: {
      SAVE_ONBOARDING_STATE_RESOLVE: "READY",
      SAVE_ONBOARDING_STATE_REJECT: "READY",
    },

    FINISH_ONBOARDING_PENDING: {
      FINISH_ONBOARDING_RESOLVE: "END",
      FINISH_ONBOARDING_REJECT: "READY",
    },

    STARTUP_ONBOARDING: {
      FETCH_ONBOARDING: "FETCH_ONBOARDING_PENDING",
    },

    READY: {
      FETCH_ONBOARDING: "FETCH_ONBOARDING_PENDING",
    },

    DISABLED: {},
    ERROR: {},
    END: {},
  },
  initialState: "IDLE",
  initialContext,
  reducer: (s, action, { nextState }) => {
    s.state = nextState;

    switch (action.type) {
      case "FETCH_ONBOARDING_RESOLVE": {
        const artists = s.context.data?.filter((obj, index, self) => index === self.findIndex((o) => o.id === obj.id));
        s.context.data = [...(artists || []), ...action.payload.data];
        s.context.pagination = action.payload.pagination;
        break;
      }
      case "ONBOARDING_SEARCH_SELECT_ARTIST": {
        const filtered = (s.context.data || []).filter((a) => a.id !== action.payload.id);
        s.context.data = [action.payload, ...filtered];
        break;
      }

      case "FETCH_RELATED_ONBOARDING_RESOLVE": {
        if (!s.context.data || action.payload.search) break;

        const index = s.context.data.findIndex((a) => a.id === action.payload.artistId);
        if (index === -1) break;

        s.context.data.splice(index + 1, 0, ...action.payload.data);
        break;
      }

      case "FETCH_ONBOARDING_REJECT":
        s.context.hasNext = false;
        break;
    }
  },
  effects: {
    SAVE_ONBOARDING_STATE: ({ getState, transition, services }) => {
      try {
        const { selected } = getState().onboardingSelect.context;
        services.localStorageService.setItem(ONBOARDING_DATA_KEY, selected);

        transition({
          type: "SAVE_ONBOARDING_STATE_RESOLVE",
        });
      } catch (err) {
        transition({
          type: "SAVE_ONBOARDING_STATE_REJECT",
        });
      }
    },
    CHECK_ACTIVE_ONBOARDING: async ({ getState, transition, services, condition }) => {
      try {
        let error = false;

        await Promise.all([
          condition((a) => {
            if (a.type === "FETCH_COLLECTIONS_REJECT") {
              error = true;
              return true;
            }

            return ["FETCH_COLLECTIONS_RESOLVE"].includes(a.type);
          }),
          condition(() => getState().trial.state === "DONE"),
        ]);

        const { collections, iamSession, trialModal } = getState();

        if (error) throw new Error("collections fetch failed");

        if (!iamSession.context.isAuthorized) throw new Error("isAuthorized === false");
        if (!collections.context.visible) throw new Error("collections not found");

        for (const [, collection] of Object.entries(collections.context.visible)) {
          if (collection.length) throw new Error("collections already initialized");
        }

        if (trialModal.state === "VISIBLE") {
          await condition(() => getState().trialModal.state === "CLOSED");
        }

        const selected = services.localStorageService.getItem<Artist[]>(ONBOARDING_DATA_KEY) || [];

        transition({
          type: "CHECK_ACTIVE_ONBOARDING_RESOLVE",
          payload: { selected },
        });
      } catch (err) {
        transition({
          type: "CHECK_ACTIVE_ONBOARDING_REJECT",
        });
      }
    },

    FETCH_ONBOARDING_PENDING: async ({ getState, services, transition }) => {
      try {
        const { pagination, data } = getState().onboarding.context;
        const { selected } = getState().onboardingSelect.context;

        const response = await services.entityResolver.create("ONBOARDING").GET({ ...pagination });

        let items = response.items.filter((item) => !data?.find((artist) => artist.id === item.id));
        if (!data) items = items.filter((item) => !selected.filter((artist) => artist.id === item.id).length);

        transition({
          type: "FETCH_ONBOARDING_RESOLVE",
          payload: {
            data: !data ? selected.concat(items) : items,
            pagination: {
              limit: pagination.limit,
              offset: (pagination.offset || 0) + pagination.limit,
            },
          },
        });
      } catch (err: any) {
        logger.error("[onboarding]", "FETCH_ONBOARDING_PENDING error", err?.message);

        transition({
          type: "FETCH_ONBOARDING_REJECT",
        });
      }
    },

    FINISH_ONBOARDING_PENDING: async ({ getState, services, transition }) => {
      try {
        const { selected } = getState().onboardingSelect.context;
        const analytics = getRecomSetupAnalytics({ getState });

        const artistsIds = selected.map((a) => a.id);
        const artistsCount = selected.length;

        services.ymService.reachGoal("recom_setup_finish", {
          user_id: analytics.userId,
          device_type: analytics.deviceType,
          artists_count: artistsCount,
          artists_ids: artistsIds,
          ...(analytics.san ? { san: analytics.san } : {}),
          ...(analytics.userUid ? { valkyra_id: analytics.userUid } : {}),
        });

        await Promise.all([
          sleep(FINISH_DELAY),
          services.entityResolver.create("ONBOARDING_FINISH").POST({
            artist_ids: artistsIds,
          }),
        ]);

        transition({
          type: "FINISH_ONBOARDING_RESOLVE",
        });
      } catch (err: any) {
        logger.error("[onboarding]", "FINISH_ONBOARDING_PENDING error", err?.message);

        transition({
          type: "FINISH_ONBOARDING_REJECT",
        });
      }
    },

    STARTUP_ONBOARDING: ({ services, transition, getState }) => {
      const eventSent = services.localStorageService.getItem<boolean>(ONBOARDING_EVENT_SENT_KEY);
      if (!eventSent) {
        const analytics = getRecomSetupAnalytics({ getState });

        services.ymService.reachGoal("recom_setup_shown", {
          user_id: analytics.userId,
          device_type: analytics.deviceType,
          ...(analytics.san ? { san: analytics.san } : {}),
          ...(analytics.userUid ? { valkyra_id: analytics.userUid } : {}),
        });
        services.localStorageService.setItem(ONBOARDING_EVENT_SENT_KEY, true);
      }

      services.router?.push("/onboarding");

      transition({
        type: "FETCH_ONBOARDING",
      });
    },

    END: ({ services }) => {
      services.localStorageService.removeItem(ONBOARDING_DATA_KEY);
      services.router?.push("/");
    },
  },
});
