export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;

export type Assert<T extends true> = T;

export type IsAny<T> = 0 extends 1 & T ? true : false;
export type NotAny<T> = IsAny<T> extends true ? false : true;

export type IsNever<T> = [T] extends [never] ? true : false;
export type NotNever<T> = IsNever<T> extends true ? false : true;

export type IsUnknown<T> = IsAny<T> extends true ? false : unknown extends T ? true : false;
