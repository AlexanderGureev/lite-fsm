type JsonObject = { [key: string]: unknown };

const KEY_ORDER = [
  "version",
  "createdBy",
  "package",
  "entry",
  "path",
  "tsconfigPath",
  "graph",
  "source",
  "filename",
  "language",
  "kind",
  "entryFileName",
  "files",
  "fileName",
  "roles",
  "hash",
  "machines",
  "managers",
  "diagnostics",
  "code",
  "severity",
  "message",
  "machineId",
  "loc",
  "start",
  "end",
  "line",
  "column",
  "offset",
  "hint",
  "id",
  "index",
  "variableName",
  "exportName",
  "managerKeys",
  "machineRefs",
  "key",
  "machineId",
  "states",
  "transitions",
  "emissions",
  "reducerCases",
] as const;

const keyRanks = new Map<string, number>(KEY_ORDER.map((key, index) => [key, index]));

const orderedKeys = (value: JsonObject): string[] => {
  return Object.keys(value).sort((left, right) => {
    const leftRank = keyRanks.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = keyRanks.get(right) ?? Number.MAX_SAFE_INTEGER;

    return leftRank === rightRank ? left.localeCompare(right) : leftRank - rightRank;
  });
};

const isPlainObject = (value: unknown): value is JsonObject => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainObject(value)) return value;

  const next: JsonObject = {};
  for (const key of orderedKeys(value)) {
    const child = value[key];
    if (child !== undefined) next[key] = stableValue(child);
  }

  return next;
};

export const stringifyStableJson = (value: unknown): string => {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
};
