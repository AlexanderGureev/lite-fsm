import { describe, expect, test } from "tstyche";
import type { AnyEvent, EffectType, FSMEvent, Reducer, SType, State, WILDCARD } from "lite-fsm";

import type { Assert, Equal, IsAny, IsNever, IsUnknown, NotAny, NotNever } from "./_helpers";

describe("SType", () => {
  test("является точным union string | number | symbol", () => {
    expect<SType>().type.toBe<string | number | symbol>();
    expect<NotAny<SType>>().type.toBe<true>();
    expect<NotNever<SType>>().type.toBe<true>();
  });

  test("принимает string/number/symbol literals", () => {
    expect<"idle">().type.toBeAssignableTo<SType>();
    expect<42>().type.toBeAssignableTo<SType>();
    expect<symbol>().type.toBeAssignableTo<SType>();
  });

  test("отклоняет непримитивные keys", () => {
    expect<boolean>().type.not.toBeAssignableTo<SType>();
    expect<object>().type.not.toBeAssignableTo<SType>();
    expect<null>().type.not.toBeAssignableTo<SType>();
    expect<undefined>().type.not.toBeAssignableTo<SType>();
  });
});

describe("WILDCARD", () => {
  test("является точным literal \"*\"", () => {
    expect<WILDCARD>().type.toBe<"*">();
    expect<NotAny<WILDCARD>>().type.toBe<true>();
  });

  test("присваивается к string и SType, но не к произвольному literal", () => {
    expect<WILDCARD>().type.toBeAssignableTo<string>();
    expect<WILDCARD>().type.toBeAssignableTo<SType>();
    expect<"*">().type.toBeAssignableTo<WILDCARD>();
    expect<"idle">().type.not.toBeAssignableTo<WILDCARD>();
    expect<string>().type.not.toBeAssignableTo<WILDCARD>();
  });
});

describe("State<S>", () => {
  test("исключает wildcard, number и symbol из union", () => {
    expect<State<"idle" | "running" | "*">>().type.toBe<"idle" | "running">();
    expect<State<"idle" | "*" | 1 | symbol>>().type.toBe<"idle">();
    expect<State<"idle" | "*">>().type.toBe<"idle">();
  });

  test("сохраняет обычные string literal unions без изменений", () => {
    expect<State<"a" | "b" | "c">>().type.toBe<"a" | "b" | "c">();
    expect<State<"solo">>().type.toBe<"solo">();
  });

  test("схлопывается в never, когда union состоит только из исключённых members", () => {
    type _StarOnlyBecomesNever = Assert<IsNever<State<"*">>>;
    type _NumberOnlyBecomesNever = Assert<IsNever<State<1 | 2>>>;
    type _SymbolOnlyBecomesNever = Assert<IsNever<State<symbol>>>;
    type _MixedExcludedBecomesNever = Assert<IsNever<State<"*" | number | symbol>>>;
    type _NeverInNeverOut = Assert<IsNever<State<never>>>;
  });

  test("пропускает generic string literal type без изменений", () => {
    expect<State<string>>().type.toBe<string>();
  });

  test("результат всегда присваивается к string", () => {
    expect<State<"idle">>().type.toBeAssignableTo<string>();
    expect<State<"idle" | "done">>().type.toBeAssignableTo<string>();
  });
});

describe("EffectType", () => {
  test("является точным union \"every\" | \"latest\"", () => {
    expect<EffectType>().type.toBe<"every" | "latest">();
    expect<"every">().type.toBeAssignableTo<EffectType>();
    expect<"latest">().type.toBeAssignableTo<EffectType>();
    expect<"first">().type.not.toBeAssignableTo<EffectType>();
    expect<string>().type.not.toBeAssignableTo<EffectType>();
  });
});

describe("Reducer<S, P>", () => {
  test("параметр P по умолчанию принимает безопасную форму unknown event", () => {
    const reducer: Reducer<{ count: number }> = (state, action) => {
      void action.type;
      void action.payload;
      return state;
    };
    expect(reducer).type.toBe<Reducer<{ count: number }>>();
  });

  test("конкретный event сужает параметр action", () => {
    type IncEvent = FSMEvent<"INC", { amount: number }>;
    expect<Reducer<{ count: number }, IncEvent>>().type.toBe<
      (state: { count: number }, action: IncEvent) => { count: number }
    >();
  });

  test("state type не ограничен: primitive, object и null принимаются", () => {
    type IncEvent = FSMEvent<"INC">;
    expect<Reducer<number, IncEvent>>().type.toBe<(state: number, action: IncEvent) => number>();
    expect<Reducer<string, IncEvent>>().type.toBe<(state: string, action: IncEvent) => string>();
    expect<Reducer<null, IncEvent>>().type.toBe<(state: null, action: IncEvent) => null>();
    expect<Reducer<ReadonlyArray<number>, IncEvent>>().type.toBe<
      (state: ReadonlyArray<number>, action: IncEvent) => ReadonlyArray<number>
    >();
  });

  test("return type точно совпадает со state type", () => {
    type R = Reducer<{ a: 1 }, FSMEvent<"X">>;
    expect<ReturnType<R>>().type.toBe<{ a: 1 }>();
    expect<Parameters<R>>().type.toBe<[{ a: 1 }, FSMEvent<"X">]>();
  });
});

describe("FSMEvent<Name, Payload>", () => {
  test("без payload получается только { type }", () => {
    type E = FSMEvent<"PING">;
    expect<E>().type.toBe<{ type: "PING" }>();
    type _NoPayloadKey = Assert<Equal<keyof E, "type">>;

    const ok: E = { type: "PING" };
    expect(ok).type.toBe<E>();

    // @ts-expect-error!
    const withUndefined: E = { type: "PING", payload: undefined };
    void withUndefined;
  });

  test("явный undefined payload сохраняет обязательный ключ payload", () => {
    type E = FSMEvent<"X", undefined>;
    expect<E>().type.toBe<{ type: "X"; payload: undefined }>();
    type _PayloadKey = Assert<Equal<keyof E, "type" | "payload">>;
  });

  test("payload: any сохраняет обязательный payload типа any", () => {
    type E = FSMEvent<"ANY", any>;
    type _Shape = Assert<Equal<E, { type: "ANY"; payload: any }>>;

    const withPayload: E = { type: "ANY", payload: { anything: 1 } };
    expect(withPayload).type.toBe<E>();

    // @ts-expect-error!
    const withoutPayload: E = { type: "ANY" };
    void withoutPayload;
  });

  test("payload: unknown обязателен и остаётся unknown", () => {
    type E = FSMEvent<"U", unknown>;
    expect<E>().type.toBe<{ type: "U"; payload: unknown }>();
    type _PayloadIsUnknown = Assert<IsUnknown<E["payload"]>>;

    const ok: E = { type: "U", payload: "anything" };
    expect(ok.payload).type.toBe<unknown>();

    // @ts-expect-error!
    const missing: E = { type: "U" };
    void missing;
  });

  test("payload: null обязателен, потому что null не равен undefined", () => {
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

  test("payload: void сохраняет обязательный ключ payload, хотя void принимает undefined", () => {
    type E = FSMEvent<"V", void>;
    expect<E>().type.toBe<{ type: "V"; payload: void }>();

    const withUndefined: E = { type: "V", payload: undefined };
    expect(withUndefined).type.toBe<E>();

    // @ts-expect-error!
    const missing: E = { type: "V" };
    void missing;
  });

  test("payload с undefined в union сохраняет обязательный ключ payload", () => {
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

  test("primitive payloads: string, number, boolean и literals обязательны", () => {
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

  test("object payloads с optional props сохраняют форму и требуют ключ payload", () => {
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

  test("readonly arrays и tuples сохраняются как payload", () => {
    type E = FSMEvent<"A", readonly string[]>;
    type T = FSMEvent<"T", readonly [1, 2, 3]>;

    expect<E>().type.toBe<{ type: "A"; payload: readonly string[] }>();
    expect<T>().type.toBe<{ type: "T"; payload: readonly [1, 2, 3] }>();
  });

  test("payload Record<string, never> обязателен", () => {
    type E = FSMEvent<"R", Record<string, never>>;
    expect<E>().type.toBe<{ type: "R"; payload: Record<string, never> }>();

    const ok: E = { type: "R", payload: {} };
    expect(ok).type.toBe<E>();
  });

  test("never payload схлопывается в { type }, потому что never является subtype undefined", () => {
    type E = FSMEvent<"NE", never>;
    expect<E>().type.toBe<{ type: "NE" }>();

    const ok: E = { type: "NE" };
    expect(ok).type.toBe<E>();
  });

  test("never Name схлопывается в never", () => {
    type E = FSMEvent<never>;
    type _EventIsNever = Assert<IsNever<E>>;
  });

  test("union Name без payload становится distributive event union", () => {
    type E = FSMEvent<"LEFT" | "RIGHT">;
    expect<E>().type.toBe<{ type: "LEFT" } | { type: "RIGHT" }>();
  });

  test("union Name с payload становится distributive event union", () => {
    type E = FSMEvent<"A" | "B", { id: string }>;
    expect<E>().type.toBe<{ type: "A"; payload: { id: string } } | { type: "B"; payload: { id: string } }>();
  });

  test("generic string Name создаёт обычный { type: string }", () => {
    type E = FSMEvent<string>;
    expect<E>().type.toBe<{ type: string }>();
  });

  test("generic string Name с payload оставляет оба типа широкими", () => {
    type E = FSMEvent<string, { x: number }>;
    expect<E>().type.toBe<{ type: string; payload: { x: number } }>();
  });

  test("unions из FSMEvent с разной формой payload остаются структурно различимыми", () => {
    type Login = FSMEvent<"LOGIN", { userId: string }>;
    type Logout = FSMEvent<"LOGOUT">;
    type Save = FSMEvent<"SAVE", { id: string; draft?: boolean }>;

    type Union = Login | Logout | Save;
    type _LoginExtract = Assert<Equal<Extract<Union, { type: "LOGIN" }>, Login>>;
    type _LogoutExtract = Assert<Equal<Extract<Union, { type: "LOGOUT" }>, Logout>>;
    type _SaveExtract = Assert<Equal<Extract<Union, { type: "SAVE" }>, Save>>;
  });

  test("повторный Name с разными payloads сохраняет union typing для payload", () => {
    type E = FSMEvent<"SET", { value: string }> | FSMEvent<"SET", { value: number }>;
    const stringVariant: E = { type: "SET", payload: { value: "a" } };
    const numberVariant: E = { type: "SET", payload: { value: 1 } };
    expect(stringVariant.payload.value).type.toBe<string>();
    expect(numberVariant.payload.value).type.toBe<number>();
  });

  test("any payload больше не является особым escape hatch для optional payload", () => {
    type _AnyIsRequired = Assert<Equal<FSMEvent<"X", any>, { type: "X"; payload: any }>>;
    type _UnknownIsRequired = Assert<Equal<FSMEvent<"X", unknown>, { type: "X"; payload: unknown }>>;
    type _AnyIsNotUnknown = Assert<Equal<IsAny<unknown>, false>>;
  });

  test("широкий event по умолчанию безопасен и не any", () => {
    expect<AnyEvent>().type.toBe<{ type: string; payload?: unknown }>();
    expect<NotAny<AnyEvent>>().type.toBe<true>();
  });
});
