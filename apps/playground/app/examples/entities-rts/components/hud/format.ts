export const formatCount = (value: number) => value.toLocaleString("ru-RU");

export const formatFps = (value: number) => formatCount(Math.round(value));

export const formatMs = (value: number) => {
  if (value >= 100) return `${value.toFixed(0)} мс`;
  if (value >= 10) return `${value.toFixed(1)} мс`;
  return `${value.toFixed(2)} мс`;
};

export const readCountInput = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};
