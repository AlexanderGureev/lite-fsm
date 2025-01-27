export const compose = (...func: Array<(...args: any[]) => (...args: any[]) => any>) => {
  if (!func.length) return <T>(arg: T) => arg;

  return func.reduce(
    (a, b) =>
      (...args: any[]) =>
        a(b(...args)),
  );
};

export const WILDCARD = "*";
