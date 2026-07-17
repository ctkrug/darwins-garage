import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import {
  createRandomGenome,
  normalizeGenome,
  isValidGenome,
  cloneGenome,
  clamp,
  GENOME_LIMITS,
} from '../src/genome.js';

const L = GENOME_LIMITS;

test('createRandomGenome produces a chassis within the vertex limits', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const genome = createRandomGenome(createRng(seed));
    assert.ok(genome.chassis.length >= L.minVertices && genome.chassis.length <= L.maxVertices);
  }
});

test('createRandomGenome produces wheels with valid indices, radii, and torques', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const genome = createRandomGenome(createRng(seed));
    assert.ok(genome.wheels.length >= L.minWheels && genome.wheels.length <= L.maxWheels);
    for (const wheel of genome.wheels) {
      assert.ok(Number.isInteger(wheel.vertexIndex));
      assert.ok(wheel.vertexIndex >= 0 && wheel.vertexIndex < genome.chassis.length);
      assert.ok(wheel.radius >= L.minWheelRadius && wheel.radius <= L.maxWheelRadius);
      assert.ok(wheel.torque >= L.minTorque && wheel.torque <= L.maxTorque);
    }
  }
});

test('createRandomGenome is deterministic for a given seed', () => {
  assert.deepEqual(createRandomGenome(createRng(99)), createRandomGenome(createRng(99)));
});

test('createRandomGenome varies across seeds', () => {
  assert.notDeepEqual(createRandomGenome(createRng(1)), createRandomGenome(createRng(2)));
});

test('createRandomGenome always produces a genome that validates', () => {
  for (let seed = 0; seed < 300; seed += 1) {
    assert.ok(isValidGenome(createRandomGenome(createRng(seed))));
  }
});

test('createRandomGenome rejects a missing rng', () => {
  assert.throws(() => createRandomGenome(), TypeError);
  assert.throws(() => createRandomGenome(0.5), TypeError);
});

test('normalizeGenome clamps out-of-range wheel radius and torque', () => {
  const genome = normalizeGenome({
    chassis: ring(5),
    wheels: [
      { vertexIndex: 0, radius: 9999, torque: 9999 },
      { vertexIndex: 0, radius: -50, torque: -50 },
    ],
  });
  assert.equal(genome.wheels[0].radius, L.maxWheelRadius);
  assert.equal(genome.wheels[0].torque, L.maxTorque);
  assert.equal(genome.wheels[1].radius, L.minWheelRadius);
  assert.equal(genome.wheels[1].torque, L.minTorque);
});

test('normalizeGenome clamps a wheel vertexIndex into the chassis range', () => {
  const genome = normalizeGenome({
    chassis: ring(5),
    wheels: [
      { vertexIndex: 42, radius: 20, torque: 0.05 },
      { vertexIndex: -7, radius: 20, torque: 0.05 },
    ],
  });
  assert.equal(genome.wheels[0].vertexIndex, 4);
  assert.equal(genome.wheels[1].vertexIndex, 0);
});

test('normalizeGenome pulls vertices back inside the radius band', () => {
  const genome = normalizeGenome({
    chassis: [
      { x: 5000, y: 0 },
      { x: 0, y: 1 },
      ...ring(5).slice(2),
    ],
    wheels: twoWheels(),
  });
  for (const point of genome.chassis) {
    const distance = Math.hypot(point.x, point.y);
    assert.ok(distance >= L.minVertexRadius - 1e-9 && distance <= L.maxVertexRadius + 1e-9);
  }
});

test('normalizeGenome moves an origin vertex out without producing NaN', () => {
  const genome = normalizeGenome({
    chassis: [{ x: 0, y: 0 }, ...ring(5).slice(1)],
    wheels: twoWheels(),
  });
  for (const point of genome.chassis) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }
  assert.ok(Math.hypot(genome.chassis[0].x, genome.chassis[0].y) >= L.minVertexRadius - 1e-9);
});

test('normalizeGenome truncates oversized chassis and wheel lists', () => {
  const genome = normalizeGenome({
    chassis: ring(20),
    wheels: Array.from({ length: 10 }, () => ({ vertexIndex: 0, radius: 20, torque: 0.05 })),
  });
  assert.equal(genome.chassis.length, L.maxVertices);
  assert.equal(genome.wheels.length, L.maxWheels);
});

test('normalizeGenome drops non-finite vertices and wheels', () => {
  const genome = normalizeGenome({
    chassis: [...ring(5), { x: NaN, y: 0 }, { x: 0, y: Infinity }, null],
    wheels: [...twoWheels(), { vertexIndex: 0, radius: NaN, torque: 0.05 }],
  });
  assert.equal(genome.chassis.length, 5);
  assert.equal(genome.wheels.length, 2);
});

test('normalizeGenome defaults a missing torque instead of emitting NaN', () => {
  const genome = normalizeGenome({
    chassis: ring(5),
    wheels: [
      { vertexIndex: 0, radius: 20 },
      { vertexIndex: 1, radius: 20 },
    ],
  });
  for (const wheel of genome.wheels) {
    assert.ok(Number.isFinite(wheel.torque));
    assert.ok(wheel.torque >= L.minTorque && wheel.torque <= L.maxTorque);
  }
});

test('normalizeGenome rejects a chassis whose vertices are all collinear', () => {
  // A hull of collinear points has zero area: Matter's Vertices.centre divides
  // by that area, so a genome like this would build a car whose outline and
  // wheel anchors are all NaN — invisible everywhere it's drawn, even though
  // the physics sim happens to survive it via the exploded-car NaN guard.
  assert.throws(
    () =>
      normalizeGenome({
        chassis: [
          { x: 20, y: 0 },
          { x: 30, y: 0 },
          { x: 40, y: 0 },
          { x: 50, y: 0 },
          { x: 60, y: 0 },
        ],
        wheels: twoWheels(),
      }),
    RangeError,
  );
});

test('normalizeGenome rejects a chassis whose vertices all coincide', () => {
  assert.throws(
    () =>
      normalizeGenome({
        chassis: Array.from({ length: 5 }, () => ({ x: 20, y: 0 })),
        wheels: twoWheels(),
      }),
    RangeError,
  );
});

test('normalizeGenome rejects genomes below the structural minimums', () => {
  assert.throws(() => normalizeGenome({ chassis: ring(3), wheels: twoWheels() }), RangeError);
  assert.throws(
    () => normalizeGenome({ chassis: ring(5), wheels: [{ vertexIndex: 0, radius: 20 }] }),
    RangeError,
  );
});

test('normalizeGenome rejects malformed input rather than guessing', () => {
  for (const bad of [null, undefined, 42, 'car', {}, { chassis: ring(5) }, { wheels: twoWheels() }]) {
    assert.throws(() => normalizeGenome(bad), TypeError);
  }
});

test('isValidGenome reports false instead of throwing on garbage', () => {
  assert.equal(isValidGenome(null), false);
  assert.equal(isValidGenome({ chassis: [], wheels: [] }), false);
  assert.equal(isValidGenome(createRandomGenome(createRng(5))), true);
});

test('cloneGenome produces an equal but fully detached copy', () => {
  const original = createRandomGenome(createRng(17));
  const copy = cloneGenome(original);
  assert.deepEqual(copy, original);
  copy.chassis[0].x += 100;
  copy.wheels[0].radius += 1;
  assert.notEqual(copy.chassis[0].x, original.chassis[0].x);
  assert.notEqual(copy.wheels[0].radius, original.wheels[0].radius);
});

test('clamp bounds a value at both ends and passes interior values through', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

function ring(count, radius = 60) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

function twoWheels() {
  return [
    { vertexIndex: 0, radius: 20, torque: 0.05 },
    { vertexIndex: 1, radius: 25, torque: 0.06 },
  ];
}
