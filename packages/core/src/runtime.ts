// Small ports for nondeterminism, so tests can pin time and ids.

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

export const systemClock: Clock = { now: () => new Date() };

export const uuidGenerator: IdGenerator = { next: () => crypto.randomUUID() };

export function fixedClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

export function sequentialIds(prefix = "id"): IdGenerator {
  let n = 0;
  return { next: () => `${prefix}-${++n}` };
}
