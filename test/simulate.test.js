import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { createRandomGenome } from '../src/genome.js';
import { createDefaultTrack, finishX } from '../src/track.js';
import { simulateGenome, replayGenome, createSimulation, buildTerrain, SIM_DEFAULTS } from '../src/simulate.js';
import { buildCar, hasNaNPosition, chassisOutline, wheelAnchors } from '../src/car.js';

const track = createDefaultTrack();
const genomeFor = (seed) => createRandomGenome(createRng(seed));

// A deliberately competent car: a wide flat chassis on two big driven wheels.
function goodCar() {
  return {
    chassis: [
      { x: -70, y: -20 },
      { x: 0, y: -30 },
      { x: 70, y: -20 },
      { x: 70, y: 20 },
      { x: -70, y: 20 },
    ],
    wheels: [
      { vertexIndex: 3, radius: 33, torque: 0.12 },
      { vertexIndex: 4, radius: 33, torque: 0.12 },
    ],
  };
}

test('simulateGenome returns the max horizontal distance the chassis reached', () => {
  const result = simulateGenome(goodCar(), track);
  assert.ok(Number.isFinite(result.fitness));
  assert.equal(result.fitness, result.distance);
  assert.ok(result.fitness > 0, 'a driven car should cover ground');
});

test('simulateGenome is bit-identical across repeated runs', () => {
  for (let seed = 0; seed < 12; seed += 1) {
    const genome = genomeFor(seed);
    const a = simulateGenome(genome, track);
    const b = simulateGenome(genome, track);
    assert.equal(a.fitness, b.fitness, `seed ${seed} was not reproducible`);
    assert.equal(a.ticks, b.ticks);
    assert.equal(a.failReason, b.failReason);
    assert.equal(a.finished, b.finished);
  }
});

test('simulateGenome never yields NaN fitness, even for junk genomes', () => {
  for (let seed = 0; seed < 40; seed += 1) {
    const result = simulateGenome(genomeFor(seed), track);
    assert.ok(Number.isFinite(result.fitness), `seed ${seed} produced ${result.fitness}`);
    assert.ok(result.fitness >= 0);
  }
});

test('simulateGenome caps a flipped car at the distance it had when it flipped', () => {
  // Seed 3 is a genome that reliably rolls over on the default track.
  const result = simulateGenome(genomeFor(3), track);
  assert.equal(result.failReason, 'flipped');
  assert.equal(result.failed, true);
  assert.ok(result.ticks < SIM_DEFAULTS.maxTicks, 'a flip should stop the run early');

  // The cap is what stops a car being credited for ground covered after it has
  // already rolled: allowed to keep going, the same genome travels further.
  const uncapped = simulateGenome(genomeFor(3), track, { flipAngle: Math.PI });
  assert.ok(
    uncapped.fitness > result.fitness,
    `flip cap should bound fitness: capped ${result.fitness}, uncapped ${uncapped.fitness}`,
  );
});

test('a lower flip threshold ends a run no later than a higher one', () => {
  const genome = genomeFor(2);
  const strict = simulateGenome(genome, track, { flipAngle: 0.3 });
  const lax = simulateGenome(genome, track, { flipAngle: Math.PI });
  assert.ok(strict.ticks <= lax.ticks);
  assert.ok(strict.fitness <= lax.fitness + 1e-6);
});

test('simulateGenome marks a car that reaches the finish as finished', () => {
  const result = simulateGenome(goodCar(), track, { maxTicks: 4000 });
  if (result.finished) {
    assert.ok(result.fitness >= finishX(track) - 200);
    assert.equal(result.failed, false);
  }
});

test('simulateGenome stalls out a car that cannot move', () => {
  // No torque at all: the car settles and never makes progress, so the runner
  // should give up long before the tick budget is spent.
  const inert = {
    chassis: goodCar().chassis,
    wheels: [
      { vertexIndex: 3, radius: 30, torque: 0 },
      { vertexIndex: 4, radius: 30, torque: 0 },
    ],
  };
  const result = simulateGenome(inert, track);
  assert.equal(result.failReason, 'stalled');
  assert.ok(result.ticks < SIM_DEFAULTS.maxTicks, 'a dead car should stop early, not burn the budget');
  assert.ok(result.fitness < 200);
});

test('simulateGenome respects a maxTicks budget', () => {
  const result = simulateGenome(goodCar(), track, { maxTicks: 30 });
  assert.ok(result.ticks <= 30);
});

test('simulateGenome rejects an invalid track instead of simulating garbage', () => {
  assert.throws(() => simulateGenome(goodCar(), { points: [{ x: 0, y: 0 }] }), TypeError);
  assert.throws(() => simulateGenome(goodCar(), null), TypeError);
});

test('simulateGenome rejects an invalid genome', () => {
  assert.throws(() => simulateGenome({ chassis: [], wheels: [] }, track), Error);
});

test('simulateGenome records no frames unless asked', () => {
  assert.equal(simulateGenome(goodCar(), track, { maxTicks: 20 }).frames, null);
});

test('replayGenome records one frame per tick with poses for every body', () => {
  const result = replayGenome(goodCar(), track, { maxTicks: 40 });
  assert.ok(Array.isArray(result.frames));
  assert.equal(result.frames.length, result.ticks);
  for (const frame of result.frames) {
    assert.ok(Number.isFinite(frame.chassis.x) && Number.isFinite(frame.chassis.angle));
    assert.equal(frame.wheels.length, 2);
    for (const wheel of frame.wheels) {
      assert.ok(Number.isFinite(wheel.x) && Number.isFinite(wheel.y));
    }
  }
});

test('replayGenome reproduces the same fitness as a plain simulation', () => {
  // Frame recording must not perturb the physics, or a shared replay would
  // disagree with the fitness that was originally reported.
  for (let seed = 0; seed < 8; seed += 1) {
    const genome = genomeFor(seed);
    assert.equal(replayGenome(genome, track).fitness, simulateGenome(genome, track).fitness);
  }
});

test('stepping a simulation in slices matches running it in one go', () => {
  for (let seed = 0; seed < 6; seed += 1) {
    const genome = genomeFor(seed);
    const whole = simulateGenome(genome, track);

    const sliced = createSimulation(genome, track);
    while (!sliced.done) sliced.step(3);

    assert.equal(sliced.result.fitness, whole.fitness, `seed ${seed} diverged when sliced`);
    assert.equal(sliced.result.ticks, whole.ticks);
    assert.equal(sliced.result.failReason, whole.failReason);
  }
});

test('step reports completion and is a no-op afterwards', () => {
  const sim = createSimulation(goodCar(), track, { maxTicks: 10 });
  assert.equal(sim.step(10), true);
  assert.equal(sim.done, true);
  const ticks = sim.result.ticks;
  sim.step(50);
  assert.equal(sim.result.ticks, ticks, 'stepping a finished sim should not advance it');
});

test('step(0) does not advance the simulation', () => {
  const sim = createSimulation(goodCar(), track);
  sim.step(0);
  assert.equal(sim.result.ticks, 0);
});

test('buildTerrain produces one static body per track segment', () => {
  const bodies = buildTerrain(track);
  assert.equal(bodies.length, track.points.length - 1);
  assert.ok(bodies.every((b) => b.isStatic));
  assert.ok(bodies.every((b) => Number.isFinite(b.position.x) && Number.isFinite(b.position.y)));
});

test('a car stepped for 1000 ticks never produces NaN positions', () => {
  // Story 1.2's guarantee: the composite survives a long run intact.
  const sim = createSimulation(genomeFor(11), track, { maxTicks: 1000, stallTicks: 1e9, flipAngle: Math.PI });
  sim.step(1000);
  assert.equal(hasNaNPosition(sim.car), false);
});

test('buildCar wires one chassis and one body per genome wheel', () => {
  const genome = genomeFor(4);
  const car = buildCar(genome, { x: 0, y: 0 });
  assert.equal(car.chassis.label, 'chassis');
  assert.equal(car.wheels.length, genome.wheels.length);
  for (const wheel of car.wheels) {
    assert.equal(wheel.constraint.bodyA, car.chassis);
    assert.equal(wheel.constraint.bodyB, wheel.body);
  }
});

const FLAT = { id: 'flat', points: [{ x: -500, y: 0 }, { x: 6000, y: 0 }] };

const drive = (torque) =>
  simulateGenome({ ...goodCar(), wheels: goodCar().wheels.map((w) => ({ ...w, torque })) }, FLAT, {
    maxTicks: 400,
    stallTicks: 1e9,
    flipAngle: Math.PI,
  }).fitness;

test('driven wheels move the chassis forward on flat ground', () => {
  // Story 1.2's motor guarantee, isolated from the hill: the same car with its
  // motor on versus off. An undriven car should essentially sit there.
  const driven = drive(0.05);
  const undriven = drive(0);
  assert.ok(undriven < 50, `an undriven car should not travel; it went ${undriven}`);
  assert.ok(driven > 500, `a driven car should cover ground; it went ${driven}`);
});

test('torque is what moves the car, monotonically at low speeds', () => {
  // Only asserted in the low range: past a point more torque spins the wheels
  // up into a wheelie instead of forward motion, so distance is not monotonic
  // in torque across the whole gene range.
  assert.ok(drive(0.04) > drive(0.02));
  assert.ok(drive(0.02) > drive(0));
});

test('chassisOutline returns a body-local hull centred on the centre of mass', () => {
  const outline = chassisOutline(goodCar());
  assert.ok(outline.length >= 3);
  const cx = outline.reduce((s, p) => s + p.x, 0) / outline.length;
  const cy = outline.reduce((s, p) => s + p.y, 0) / outline.length;
  // Vertex mean is not the area centroid, but both sit near the origin once the
  // outline is expressed relative to the centre of mass.
  assert.ok(Math.abs(cx) < 40 && Math.abs(cy) < 40, `outline off-centre at ${cx},${cy}`);
  assert.ok(outline.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test('chassisOutline matches the hull the physics body actually uses', () => {
  // If the drawing and the physics disagreed, cars would visibly clip terrain.
  const genome = genomeFor(6);
  const outline = chassisOutline(genome);
  const car = buildCar(genome, { x: 0, y: 0 });
  assert.equal(outline.length, car.chassis.vertices.length);
  for (const point of outline) {
    const match = [...car.chassis.vertices].some(
      (v) => Math.abs(v.x - point.x) < 1e-6 && Math.abs(v.y - point.y) < 1e-6,
    );
    assert.ok(match, `outline point ${point.x},${point.y} is not a body vertex`);
  }
});

test('wheelAnchors gives one positioned wheel per genome wheel', () => {
  const genome = genomeFor(6);
  const anchors = wheelAnchors(genome);
  assert.equal(anchors.length, genome.wheels.length);
  const car = buildCar(genome, { x: 0, y: 0 });
  anchors.forEach((anchor, i) => {
    assert.equal(anchor.radius, genome.wheels[i].radius);
    // The anchor is where buildCar actually put the wheel body.
    assert.ok(Math.abs(anchor.x - car.wheels[i].body.position.x) < 1e-6);
    assert.ok(Math.abs(anchor.y - car.wheels[i].body.position.y) < 1e-6);
  });
});

test('chassisOutline and wheelAnchors reject an invalid genome', () => {
  assert.throws(() => chassisOutline({ chassis: [], wheels: [] }), Error);
  assert.throws(() => wheelAnchors(null), Error);
});
