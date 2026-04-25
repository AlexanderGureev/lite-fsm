import { describe, expect, test } from "tstyche";
import type { AnyEvent, EffectType, FSMEvent, Reducer, SType, State, WILDCARD } from "lite-fsm";

import type { Assert, Equal, IsAny, IsNever, IsUnknown, NotAny, NotNever } from "./_helpers";

describe("SType", () => {
  test("is exact union of string | number | symbol", () => {
    expect<SType>().type.toBe<string | number | symbol>();
    expect<NotAny<SType>>().type.toBe<true>();
    expect<NotNever<SType>>().type.toBe<true>();
  });

  test("accepts string/number/symbol literals", () => {
    expect<"idle">().type.toBeAssignableTo<SType>();
    expect<42>().type.toBeAssignableTo<SType>();
    expect<symbol>().type.toBeAssignableTo<SType>();
  });

  test("rejects non-primitive keys", () => {
    expect<boolean>().type.not.toBeAssignableTo<SType>();
    expect<object>().type.not.toBeAssignableTo<SType>();
    expect<null>().type.not.toBeAssignableTo<SType>();
    expect<undefined>().type.not.toBeAssignableTo<SType>();
  });
});

describe("WILDCARD", () => {
  test("is exact literal \"*\"", () => {
    expect<WILDCARD>().type.toBe<"*">();
    expect<NotAny<WILDCARD>>().type.toBe<true>();
  });

  test("is assignable to string and SType but not to arbitrary literal", () => {
    expect<WILDCARD>().type.toBeAssignableTo<string>();
    expect<WILDCARD>().type.toBeAssignableTo<SType>();
    expect<"*">().type.toBeAssignableTo<WILDCARD>();
    expect<"idle">().type.not.toBeAssignableTo<WILDCARD>();
    expect<string>().type.not.toBeAssignableTo<WILDCARD>();
  });
});

describe("State<S>", () => {
  test("excludes wildcard, number and symbol from the union", () => {
    expect<State<"idle" | "running" | "*">>().type.toBe<"idle" | "running">();
    expect<State<"idle" | "*" | 1 | symbol>>().type.toBe<"idle">();
    expect<State<"idle" | "*">>().type.toBe<"idle">();
  });

  test("preserves plain string literal unions unchanged", () => {
    expect<State<"a" | "b" | "c">>().type.toBe<"a" | "b" | "c">();
    expect<State<"solo">>().type.toBe<"solo">();
  });

  test("collapses to never when only excluded members are present", () => {
    type _StarOnlyBecomesNever = Assert<IsNever<State<"*">>>;
    type _NumberOnlyBecomesNever = Assert<IsNever<State<1 | 2>>>;
    type _SymbolOnlyBecomesNever = Assert<IsNever<State<symbol>>>;
    type _MixedExcludedBecomesNever = Assert<IsNever<State<"*" | number | symbol>>>;
    type _NeverInNeverOut = Assert<IsNever<State<never>>>;
  });

  test("passes through generic string literal type", () => {
    expect<State<string>>().type.toBe<string>();
  });

  test("result is always assignable to string", () => {
    expect<State<"idle">>().type.toBeAssignableTo<string>();
    expect<State<"idle" | "done">>().type.toBeAssignableTo<string>();
  });
});

describe("EffectType", () => {
  test("is exact union \"every\" | \"latest\"", () => {
    expect<EffectType>().type.toBe<"every" | "latest">();
    expect<"every">().type.toBeAssignableTo<EffectType>();
    expect<"latest">().type.toBeAssignableTo<EffectType>();
    expect<"first">().type.not.toBeAssignableTo<EffectType>();
    expect<string>().type.not.toBeAssignableTo<EffectType>();
  });
});

describe("Reducer<S, P>", () => {
  test("default P parameter accepts a safe unknown event shape", () => {
    const reducer: Reducer<{ count: number }> = (state, action) => {
      void action.type;
      void action.payload;
      return state;
    };
    expect(reducer).type.toBe<Reducer<{ count: number }>>();
  });

  test("specific event narrows action parameter", () => {
    type IncEvent = FSMEvent<"INC", { amount: number }>;
    expect<Reducer<{ count: number }, IncEvent>>().type.toBe<
      (state: { count: number }, action: IncEvent) => { count: number }
    >();
  });

  test("state type is unbounded (primitive, object, null all accepted)", () => {
    type IncEvent = FSMEvent<"INC">;
    expect<Reducer<number, IncEvent>>().type.toBe<(state: number, action: IncEvent) => number>();
    expect<Reducer<string, IncEvent>>().type.toBe<(state: string, action: IncEvent) => string>();
    expect<Reducer<null, IncEvent>>().type.toBe<(state: null, action: IncEvent) => null>();
    expect<Reducer<ReadonlyArray<number>, IncEvent>>().type.toBe<
      (state: ReadonlyArray<number>, action: IncEvent) => ReadonlyArray<number>
    >();
  });

  test("return type matches state type exactly", () => {
    type R = Reducer<{ a: 1 }, FSMEvent<"X">>;
    expect<ReturnType<R>>().type.toBe<{ a: 1 }>();
    expect<Parameters<R>>().type.toBe<[{ a: 1 }, FSMEvent<"X">]>();
  });
});

describe("FSMEvent<Name, Payload>", () => {
  test("no payload → only { type }", () => {
    type E = FSMEvent<"PING">;
    expect<E>().type.toBe<{ type: "PING" }>();
    type _NoPayloadKey = Assert<Equal<keyof E, "type">>;

    const ok: E = { type: "PING" };
    expect(ok).type.toBe<E>();

    // @ts-expect-error!
    const withUndefined: E = { type: "PING", payload: undefined };
    void withUndefined;
  });

  test("explicit undefined payload keeps payload key required", () => {
    type E = FSMEvent<"X", undefined>;
    expect<E>().type.toBe<{ type: "X"; payload: undefined }>();
    type _PayloadKey = Assert<Equal<keyof E, "type" | "payload">>;
  });

  test("payload: any keeps payload REQUIRED and of type any", () => {
    type E = FSMEvent<"ANY", any>;
    type _Shape = Assert<Equal<E, { type: "ANY"; payload: any }>>;

    const withPayload: E = { type: "ANY", payload: { anything: 1 } };
    expect(withPayload).type.toBe<E>();

    // @ts-expect-error!
    const withoutPayload: E = { type: "ANY" };
    void withoutPayload;
  });

  test("payload: unknown is REQUIRED and stays unknown", () => {
    type E = FSMEvent<"U", unknown>;
    expect<E>().type.toBe<{ type: "U"; payload: unknown }>();
    type _PayloadIsUnknown = Assert<IsUnknown<E["payload"]>>;

    const ok: E = { type: "U", payload: "anything" };
    expect(ok.payload).type.toBe<unknown>();

    // @ts-expect-error!
    const missing: E = { type: "U" };
    void missing;
  });

  test("payload: null is REQUIRED (null is not undefined)", () => {
    type E = FSMEvent<"N", null>;
    expect<E>().type.toBe<{ type: "N"; payload: null }>();

    const ok: E = { type: "N", payload: null };
    expect(ok).type.toBe<E>();

    // @ts-expect-error!
    const missing: E = { type: "N" };
    void missing;

    // @ts-expect-error!
    const undef: E = { type: "N", payload: undefined };
    void undef;
  });

  test("payload: void keeps payload key required (even though void accepts undefined)", () => {
    type E = FSMEvent<"V", void>;
    expect<E>().type.toBe<{ type: "V"; payload: void }>();

    const withUndefined: E = { type: "V", payload: undefined };
    expect(withUndefined).type.toBe<E>();

    // @ts-expect-error!
    const missing: E = { type: "V" };
    void missing;
  });

  test("payload with undefined in union keeps payload key REQUIRED", () => {
    type E = FSMEvent<"M", { id: string } | undefined>;
    expect<E>().type.toBe<{ type: "M"; payload: { id: string } | undefined }>();

    const withObj: E = { type: "M", payload: { id: "a" } };
    const withUndef: E = { type: "M", payload: undefined };
    expect(withObj).type.toBe<E>();
    expect(withUndef).type.toBe<E>();

    // @ts-expect-error!
    const missing: E = { type: "M" };
    void missing;
  });

  test("primitive payloads (string, number, boolean, literals) are required", () => {
    type S = FSMEvent<"S", string>;
    type N = FSMEvent<"N", number>;
    type B = FSMEvent<"B", boolean>;
    type Zero = FSMEvent<"Z", 0>;
    type False = FSMEvent<"F", false>;

    expect<S>().type.toBe<{ type: "S"; payload: string }>();
    expect<N>().type.toBe<{ type: "N"; payload: number }>();
    expect<B>().type.toBe<{ type: "B"; payload: boolean }>();
    expect<Zero>().type.toBe<{ type: "Z"; payload: 0 }>();
    expect<False>().type.toBe<{ type: "F"; payload: false }>();

    // @ts-expect-error!
    const wrong: Zero = { type: "Z", payload: 1 };
    void wrong;
  });

  test("object payloads with optional props preserve shape and require the key", () => {
    type E = FSMEvent<"O", { id: string; draft?: boolean }>;
    expect<E>().type.toBe<{ type: "O"; payload: { id: string; draft?: boolean } }>();

    const minimal: E = { type: "O", payload: { id: "x" } };
    const full: E = { type: "O", payload: { id: "x", draft: true } };
    expect(minimal).type.toBe<E>();
    expect(full).type.toBe<E>();

    // @ts-expect-error!
    const missing: E = { type: "O" };
    void missing;
  });

  test("readonly arrays and tuples are preserved as payload", () => {
    type E = FSMEvent<"A", readonly string[]>;
    type T = FSMEvent<"T", readonly [1, 2, 3]>;

    expect<E>().type.toBe<{ type: "A"; payload: readonly string[] }>();
    expect<T>().type.toBe<{ type: "T"; payload: readonly [1, 2, 3] }>();
  });

  test("Record<string, never> payload is required", () => {
    type E = FSMEvent<"R", Record<string, never>>;
    expect<E>().type.toBe<{ type: "R"; payload: Record<string, never> }>();

    const ok: E = { type: "R", payload: {} };
    expect(ok).type.toBe<E>();
  });

  test("never payload collapses to { type } because never is subtype of undefined", () => {
    type E = FSMEvent<"NE", never>;
    expect<E>().type.toBe<{ type: "NE" }>();

    const ok: E = { type: "NE" };
    expect(ok).type.toBe<E>();
  });

  test("never Name collapses to never", () => {
    type E = FSMEvent<never>;
    type _EventIsNever = Assert<IsNever<E>>;
  });

  test("union Name without payload becomes a distributive event union", () => {
    type E = FSMEvent<"LEFT" | "RIGHT">;
    expect<E>().type.toBe<{ type: "LEFT" } | { type: "RIGHT" }>();
  });

  test("union Name with payload becomes a distributive event union", () => {
    type E = FSMEvent<"A" | "B", { id: string }>;
    expect<E>().type.toBe<{ type: "A"; payload: { id: string } } | { type: "B"; payload: { id: string } }>();
  });

  test("generic string Name produces plain { type: string }", () => {
    type E = FSMEvent<string>;
    expect<E>().type.toBe<{ type: string }>();
  });

  test("generic string Name with payload keeps both wide", () => {
    type E = FSMEvent<string, { x: number }>;
    expect<E>().type.toBe<{ type: string; payload: { x: number } }>();
  });

  test("unions of FSMEvent with different payload shapes are structurally distinct", () => {
    type Login = FSMEvent<"LOGIN", { userId: string }>;
    type Logout = FSMEvent<"LOGOUT">;
    type Save = FSMEvent<"SAVE", { id: string; draft?: boolean }>;

    type Union = Login | Logout | Save;
    type _LoginExtract = Assert<Equal<Extract<Union, { type: "LOGIN" }>, Login>>;
    type _LogoutExtract = Assert<Equal<Extract<Union, { type: "LOGOUT" }>, Logout>>;
    type _SaveExtract = Assert<Equal<Extract<Union, { type: "SAVE" }>, Save>>;
  });

  test("reused Name with differing payloads keeps union typing of payload", () => {
    type E = FSMEvent<"SET", { value: string }> | FSMEvent<"SET", { value: number }>;
    const stringVariant: E = { type: "SET", payload: { value: "a" } };
    const numberVariant: E = { type: "SET", payload: { value: 1 } };
    expect(stringVariant.payload.value).type.toBe<string>();
    expect(numberVariant.payload.value).type.toBe<number>();
  });

  test("any payload is no longer a special optional-payload escape hatch", () => {
    type _AnyIsRequired = Assert<Equal<FSMEvent<"X", any>, { type: "X"; payload: any }>>;
    type _UnknownIsRequired = Assert<Equal<FSMEvent<"X", unknown>, { type: "X"; payload: unknown }>>;
    type _AnyIsNotUnknown = Assert<Equal<IsAny<unknown>, false>>;
  });

  test("default broad event is safe and not any", () => {
    expect<AnyEvent>().type.toBe<{ type: string; payload?: unknown }>();
    expect<NotAny<AnyEvent>>().type.toBe<true>();
  });
});
