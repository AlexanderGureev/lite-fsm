/**
 * Функция compose объединяет несколько функций в одну.
 * Композиция происходит справа налево: compose(f, g, h)(x) = f(g(h(x)))
 *
 * Поддерживаются как обычные композиции функций, так и middleware-стиль
 * композиции (используемый в MachineManager).
 */
export function compose(): <T>(x: T) => T;
export function compose<A, R>(f1: (a: A) => R): (a: A) => R;
export function compose<A, B, R>(f1: (b: B) => R, f2: (a: A) => B): (a: A) => R;
export function compose<A, B, C, R>(f1: (c: C) => R, f2: (b: B) => C, f3: (a: A) => B): (a: A) => R;
export function compose<A, B, C, D, R>(f1: (d: D) => R, f2: (c: C) => D, f3: (b: B) => C, f4: (a: A) => B): (a: A) => R;
export function compose<A, B, C, D, E, R>(
  f1: (e: E) => R,
  f2: (d: D) => E,
  f3: (c: C) => D,
  f4: (b: B) => C,
  f5: (a: A) => B,
): (a: A) => R;

// Специальный случай для middleware
export function compose<T, R = T>(
  ...fns: Array<(next: (action: T) => R) => (action: T) => R>
): (next: (action: T) => R) => (action: T) => R;

export function compose(...fns: Function[]) {
  if (fns.length === 0) {
    return <T>(x: T) => x;
  }

  return fns.reduce(
    (a, b) =>
      (...args: any[]) =>
        a(b(...args)),
  );
}

export const WILDCARD = "*";
