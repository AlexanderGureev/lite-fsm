export type RandomSource = () => number;

const hashSeed = (seed: string) => {
  let hash = 2_166_136_261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
};

export const createSeededRandom = (seed: string): RandomSource => {
  let state = hashSeed(seed);

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const randomBetween = (random: RandomSource, min: number, max: number) => min + (max - min) * random();

export const randomInt = (random: RandomSource, min: number, maxExclusive: number) => {
  if (maxExclusive <= min) throw new Error("randomInt expects maxExclusive to be greater than min");
  return Math.floor(randomBetween(random, min, maxExclusive));
};
