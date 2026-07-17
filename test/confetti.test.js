import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnConfetti, stepConfetti, COLORS } from '../src/confetti.js';

// A fixed sequence stands in for Math.random so particle values are exact
// and reproducible, without requiring the celebration itself to be seeded.
function sequence(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test('spawnConfetti: default count produces that many particles', () => {
  const particles = spawnConfetti(100, 50);
  assert.equal(particles.length, 28);
});

test('spawnConfetti: count 0 produces no particles', () => {
  assert.deepEqual(spawnConfetti(0, 0, { count: 0 }), []);
});

test('spawnConfetti: a fractional or negative count is floored/clamped to a valid size', () => {
  assert.equal(spawnConfetti(0, 0, { count: 3.9 }).length, 3);
  assert.equal(spawnConfetti(0, 0, { count: -5 }).length, 0);
});

test('spawnConfetti: every particle starts at the origin with positive life and a listed color', () => {
  const particles = spawnConfetti(42, 17, { count: 12 });
  for (const p of particles) {
    assert.equal(p.x, 42);
    assert.equal(p.y, 17);
    assert.ok(p.life > 0);
    assert.equal(p.life, p.maxLife);
    assert.ok(COLORS.includes(p.color));
  }
});

test('spawnConfetti: an injected random makes the burst deterministic', () => {
  const random = sequence([0.5, 0.5, 0, 0.25, 0.75, 0.1]);
  const a = spawnConfetti(0, 0, { count: 2, random: sequence([0.5, 0.5, 0, 0.25, 0.75, 0.1]) });
  const b = spawnConfetti(0, 0, { count: 2, random });
  assert.deepEqual(a, b);
});

test('stepConfetti: moves a particle by its velocity and applies gravity', () => {
  const particle = { x: 0, y: 0, vx: 100, vy: -50, rotation: 0, spin: 2, life: 1000, maxLife: 1000 };
  const [next] = stepConfetti([particle], 100);
  assert.equal(next.x, 10); // 100px/s * 0.1s
  assert.ok(next.y < 0); // still rising, but gravity has begun pulling vy up
  assert.ok(next.vy > particle.vy); // gravity increased vy (less negative / more positive)
  assert.equal(next.rotation, 0.2); // 2 rad/s * 0.1s
});

test('stepConfetti: a zero-length step leaves position and rotation unchanged', () => {
  const particle = { x: 5, y: 5, vx: 10, vy: 10, rotation: 1, spin: 1, life: 500, maxLife: 500 };
  const [next] = stepConfetti([particle], 0);
  assert.equal(next.x, particle.x);
  assert.equal(next.y, particle.y);
  assert.equal(next.rotation, particle.rotation);
  assert.equal(next.life, particle.life);
});

test('stepConfetti: a particle whose life expires is dropped', () => {
  const particle = { x: 0, y: 0, vx: 0, vy: 0, rotation: 0, spin: 0, life: 50, maxLife: 50 };
  assert.deepEqual(stepConfetti([particle], 50), []);
  assert.deepEqual(stepConfetti([particle], 999), []);
});

test('stepConfetti: an empty list stays empty', () => {
  assert.deepEqual(stepConfetti([], 16), []);
});
