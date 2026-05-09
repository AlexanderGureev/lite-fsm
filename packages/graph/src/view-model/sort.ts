export const compareText = (left: string, right: string): number => left.localeCompare(right);

export const orderedUnique = <T>(items: readonly T[]): T[] => {
  const seen = new Set<T>();
  const result: T[] = [];

  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }

  return result;
};

export const sortedUniqueStrings = (items: readonly string[]): string[] => orderedUnique(items).sort(compareText);
