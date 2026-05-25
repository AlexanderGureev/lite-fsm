import { describe, expect, test } from "tstyche";
import { createMachine, MachineManager } from "@lite-fsm/core";
import type {
  MachineEvents,
  MachineResultMetadata,
  MachinesState,
  ManagerAction,
  PluginTransitionEvents,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";
import {
  createDocumentationStorageMachine,
  documentationCreateMachine,
  documentationEffectMachine,
  documentationNoopPlugin,
  documentationPlugin,
  DOCUMENTATION_STORAGE_KIND,
  type DocumentationAppEvent,
  type DocumentationPluginEvent,
  type DocumentationStoragePublicState,
} from "../fixtures/plugin-system-documentation";

describe("документационный plugin fixture types", () => {
  test("typed createMachine wrapper принимает test storage kind и сохраняет metadata", () => {
    const machine = createDocumentationStorageMachine("docs/a");

    expect(machine.storage).type.toBe<typeof DOCUMENTATION_STORAGE_KIND>();
    expect(machine.doc.target).type.toBe<string>();

    type _Metadata = Assert<
      Equal<MachineResultMetadata<typeof machine>, { readonly example: "plugin-system" }>
    >;
    type _PublicState = Assert<
      Equal<MachinesState<{ readonly custom: typeof machine }>["custom"], DocumentationStoragePublicState>
    >;
    type _Events = Assert<Equal<MachineEvents<{ readonly custom: typeof machine }>, DocumentationAppEvent>>;
  });

  test("core createMachine без wrapper не принимает plugin-specific storage fields", () => {
    // @ts-expect-error!
    createMachine<DocumentationAppEvent>({
      storage: DOCUMENTATION_STORAGE_KIND,
      doc: { target: "docs/a" },
      config: {
        READY: { DOC_TICK: "READY" },
      },
      initialState: "READY",
      initialContext: {
        target: "docs/a",
        count: 0,
      },
    });
  });

  test("manager получает transition event, action.meta и extension только от текущего plugin tuple", () => {
    const manager = MachineManager(
      {
        custom: createDocumentationStorageMachine("docs/a"),
        effect: documentationEffectMachine,
      },
      { plugins: [documentationPlugin] as const },
    );
    const plain = MachineManager({ custom: createDocumentationStorageMachine("docs/a") });
    const noop = MachineManager(
      { custom: createDocumentationStorageMachine("docs/a") },
      { plugins: [documentationNoopPlugin] as const },
    );

    manager.transition({ type: "DOC_PLUGIN_EVENT", payload: { id: "a" } });
    manager.transition({ type: "DOC_TICK", meta: { docTarget: "docs/a" } });
    expect(manager.documentation.storageKind).type.toBe<typeof DOCUMENTATION_STORAGE_KIND>();
    expect(manager.documentation.machineKeys()).type.toBe<readonly string[]>();

    // @ts-expect-error!
    plain.transition({ type: "DOC_PLUGIN_EVENT", payload: { id: "a" } });
    // @ts-expect-error!
    plain.transition({ type: "DOC_TICK", meta: { docTarget: "docs/a" } });
    // @ts-expect-error!
    plain.documentation;
    // @ts-expect-error!
    noop.documentation;
  });

  test("typed scoped dep и typed scoped transition method доступны в effect deps wrapper", () => {
    documentationCreateMachine({
      storage: "instance",
      config: {
        IDLE: { DOC_START: "LOADING" },
        LOADING: { DOC_DONE: "IDLE" },
      },
      initialState: "IDLE",
      initialContext: {
        trace: "",
      },
      effects: {
        LOADING: ({ docTrace, transition }) => {
          expect(docTrace()).type.toBe<string>();
          expect(transition.docFinish("done")).type.toBe<ManagerAction<DocumentationAppEvent>>();
        },
      },
    });
  });

  test("plugin transition events не подмешиваются в MachineEvents", () => {
    type _PluginEvents = Assert<
      Equal<PluginTransitionEvents<readonly [typeof documentationPlugin]>, DocumentationPluginEvent>
    >;
    type _MachineEvents = Assert<
      Equal<
        MachineEvents<{ readonly custom: ReturnType<typeof createDocumentationStorageMachine> }>,
        DocumentationAppEvent
      >
    >;
  });
});
