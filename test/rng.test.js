import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randomInt, randomFloat, pick } from '../src/rng.js';

test('createRng produces an identical stream for the same seed', () => {
  const a = createRng(42);
  const b = createRng(42);
  const seqA = Array.from({ length: 100 }, () => a());
  const seqB = Array.from({ length: 100 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test('createRng produces different streams for different seeds', () => {
  const a = createRng(1);
  const b = createRng(2);
  const seqA = Array.from({ length: 20 }, () => a());
  const seqB = Array.from({ length: 20 }, () => b());
  assert.notDeepEqual(seqA, seqB);
});

test('createRng stays within [0, 1) across many draws', () => {
  const rng = createRng(7);
  for (let i = 0; i < 10000; i += 1) {
    const value = rng();
    assert.ok(value >= 0 && value < 1, `out of range: ${value}`);
  }
});

test('createRng accepts boundary seeds', () => {
  for (const seed of [0, -1, 2 ** 31, -(2 ** 31)]) {
    const rng = createRng(seed);
    assert.ok(Number.isFinite(rng()));
  }
});

test('createRng rejects non-finite seeds', () => {
  for (const bad of [NaN, Infinity, undefined, 'abc']) {
    assert.throws(() => createRng(bad), TypeError);
  }
});

test('randomInt covers both endpoints and never exceeds them', () => {
  const rng = createRng(3);
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const value = randomInt(rng, 2, 5);
    assert.ok(Number.isInteger(value));
    assert.ok(value >= 2 && value <= 5);
    seen.add(value);
  }
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5]);
});

test('randomInt with min === max always returns that value', () => {
  const rng = createRng(9);
  for (let i = 0; i < 50; i += 1) {
    assert.equal(randomInt(rng, 4, 4), 4);
  }
});

test('randomFloat stays within [min, max)', () => {
  const rng = createRng(11);
  for (let i = 0; i < 5000; i += 1) {
    const value = randomFloat(rng, -3, 3);
    assert.ok(value >= -3 && value < 3);
  }
});

test('pick returns an element of the array', () => {
  const rng = createRng(13);
  const items = ['a', 'b', 'c'];
  for (let i = 0; i < 100; i += 1) {
    assert.ok(items.includes(pick(rng, items)));
  }
});

test('pick rejects empty or non-array input', () => {
  const rng = createRng(1);
  assert.throws(() => pick(rng, []), TypeError);
  assert.throws(() => pick(rng, null), TypeError);
});
