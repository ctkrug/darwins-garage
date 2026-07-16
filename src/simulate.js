// Runs one genome against one track and scores it. Everything here is a pure
// function of (genome, track, options): Matter is stepped on a fixed timestep
// and never reads the wall clock or Math.random, which is what makes a share
// link reproduce the original run exactly.

import Matter from 'matter-js';
import { buildCar, applyMotor, hasNaNPosition, chassisTilt, lowestOffset } from './car.js';
import { heightAt, finishX, trackSegments, isValidTrack } from './track.js';

const { Engine, Composite, Bodies } = Matter;

export const SIM_DEFAULTS = Object.freeze({
  timestep: 1000 / 60,
  maxTicks: 1200,
  // Past this tilt the chassis is on its side or roof and is done: scoring it
  // any further would reward cars that topple forward across the line.
  flipAngle: (Math.PI * 2) / 3,
  // A car that has gained under stallDistance px over stallTicks has stopped;
  // ending early keeps a 40-generation run inside its time budget.
  stallTicks: 100,
  stallDistance: 10,
  startX: 0,
  startGap: 6,
  terrainThickness: 60,
  gravityY: 1,
});

/**
 * Simulate one genome and return its result.
 * @param {object} genome
 * @param {object} track
 * @param {object} [options]
 * @param {boolean} [options.recordFrames] - capture per-tick poses for replay.
 *   Off by default: a 40-generation evolution run would otherwise retain
 *   millions of pose objects.
 * @returns {{fitness: number, distance: number, finished: boolean, failed: boolean,
 *            failReason: string|null, ticks: number, frames: object[]|null}}
 */
export function simulateGenome(genome, track, options = {}) {
  if (!isValidTrack(track)) {
    throw new TypeError('simulateGenome: track is not valid; validate it before simulating');
  }
  const config = { ...SIM_DEFAULTS, ...options };
  const recordFrames = Boolean(options.recordFrames);

  const engine = Engine.create();
  engine.gravity.y = config.gravityY;
  // Fixed sub-stepping and a fixed delta keep the run bit-reproducible.
  engine.timing.timeScale = 1;

  Composite.add(engine.world, buildTerrain(track, config));

  const startY = heightAt(track, config.startX) - lowestOffset(genome) - config.startGap;
  const car = buildCar(genome, { x: config.startX, y: startY });
  Composite.add(engine.world, car.composite);

  const goal = finishX(track);
  const frames = recordFrames ? [] : null;

  let distance = 0;
  let failed = false;
  let failReason = null;
  let finished = false;
  let ticks = 0;
  let lastProgressTick = 0;
  let lastProgressX = 0;

  for (; ticks < config.maxTicks; ticks += 1) {
    applyMotor(car);
    Engine.update(engine, config.timestep);

    if (hasNaNPosition(car)) {
      // A blown-up constraint would otherwise poison fitness with NaN and make
      // the whole population incomparable.
      failed = true;
      failReason = 'exploded';
      break;
    }

    const x = car.chassis.position.x - config.startX;
    if (x > distance) distance = x;
    if (recordFrames) frames.push(captureFrame(car, ticks));

    if (chassisTilt(car) >= config.flipAngle) {
      failed = true;
      failReason = 'flipped';
      break;
    }
    if (car.chassis.position.x >= goal) {
      finished = true;
      break;
    }
    if (x > lastProgressX + config.stallDistance) {
      lastProgressX = x;
      lastProgressTick = ticks;
    } else if (ticks - lastProgressTick > config.stallTicks) {
      failReason = 'stalled';
      break;
    }
  }

  // Fitness is exactly the furthest the chassis got. A flip stops the clock, so
  // a car that topples forward scores only the ground it covered upright — the
  // degenerate "fall over once" strategy earns nothing extra.
  const fitness = round6(Math.max(0, distance));

  return {
    fitness,
    distance: fitness,
    finished,
    failed,
    failReason,
    ticks: ticks + 1,
    frames,
  };
}

/** Simulate and keep the per-tick poses, for replaying a single car. */
export function replayGenome(genome, track, options = {}) {
  return simulateGenome(genome, track, { ...options, recordFrames: true });
}

/** Static terrain bodies for a track: one rotated slab per segment. */
export function buildTerrain(track, options = {}) {
  const thickness = options.terrainThickness ?? SIM_DEFAULTS.terrainThickness;
  return trackSegments(track).map(({ a, b }) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    // Slabs are centred half a thickness below the surface line, along the
    // segment's downward normal, so the drawn terrain and the collision
    // surface agree rather than the slab straddling the line.
    const cx = (a.x + b.x) / 2 - (Math.sin(angle) * thickness) / 2;
    const cy = (a.y + b.y) / 2 + (Math.cos(angle) * thickness) / 2;
    return Bodies.rectangle(cx, cy, length + thickness, thickness, {
      isStatic: true,
      angle,
      label: 'terrain',
      friction: 1,
    });
  });
}

function captureFrame(car, tick) {
  return {
    tick,
    chassis: { x: car.chassis.position.x, y: car.chassis.position.y, angle: car.chassis.angle },
    wheels: car.wheels.map((w) => ({
      x: w.body.position.x,
      y: w.body.position.y,
      angle: w.body.angle,
      radius: w.radius,
    })),
  };
}

// Physics accumulates float noise well below a pixel; rounding keeps fitness
// comparisons and the "same seed, same score" guarantee stable to report.
function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}
