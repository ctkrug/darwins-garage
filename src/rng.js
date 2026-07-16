// Seedable RNG. Shareable replay links only work if a genome+track+seed always
// plays out identically, so nothing in the evolution or physics path may call
// Math.random — everything draws from a mulberry32 stream created here.

/**
 * Create a deterministic PRNG returning floats in [0, 1).
 * @param {number} seed - any integer; coerced to uint32.
 * @returns {() => number}
 */
export function createRng(seed) {
  if (!Number.isFinite(seed)) {
    throw new TypeError(`createRng: seed must be a finite number, got ${seed}`);
  }
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] inclusive. */
export function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Float in [min, max). */
export function randomFloat(rng, min, max) {
  return min + rng() * (max - min);
}

/** Pick one element of a non-empty array. */
export function pick(rng, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new TypeError('pick: items must be a non-empty array');
  }
  return items[randomInt(rng, 0, items.length - 1)];
}
