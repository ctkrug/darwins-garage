import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandomGenome } from '../src/genome.js';

test('createRandomGenome produces a chassis with 5-8 vertices', () => {
  const genome = createRandomGenome(() => 0.5);
  assert.ok(genome.chassis.length >= 5 && genome.chassis.length <= 8);
});

test('createRandomGenome produces 2-4 wheels, each with a valid vertex index', () => {
  const genome = createRandomGenome(() => 0.5);
  assert.ok(genome.wheels.length >= 2 && genome.wheels.length <= 4);
  for (const wheel of genome.wheels) {
    assert.ok(wheel.vertexIndex >= 0 && wheel.vertexIndex < genome.chassis.length);
    assert.ok(wheel.radius >= 10 && wheel.radius <= 35);
  }
});

test('createRandomGenome is deterministic for a fixed rng', () => {
  const a = createRandomGenome(() => 0.3);
  const b = createRandomGenome(() => 0.3);
  assert.deepEqual(a, b);
});
