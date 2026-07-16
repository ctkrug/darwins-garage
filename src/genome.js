// A genome describes one vehicle: a polygonal chassis plus a set of wheels,
// each attached at a chassis vertex with its own radius and motor torque. The
// evolution engine, the physics builder, and the share-link encoder all consume
// this shape, so it stays plain JSON-serializable data rather than a class.

import { randomInt, randomFloat } from './rng.js';

export const GENOME_LIMITS = Object.freeze({
  minVertices: 5,
  maxVertices: 8,
  minWheels: 2,
  maxWheels: 4,
  minWheelRadius: 10,
  maxWheelRadius: 35,
  minTorque: 0.02,
  maxTorque: 0.12,
  chassisRadius: 60,
  minVertexRadius: 15,
  maxVertexRadius: 110,
});

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Build a random genome from a seeded rng.
 * Chassis vertices are laid out around a circle with per-vertex jitter, which
 * keeps generation 0 varied without producing degenerate slivers.
 * @param {() => number} rng
 */
export function createRandomGenome(rng) {
  assertRng(rng, 'createRandomGenome');
  const { minVertices, maxVertices, minWheels, maxWheels, chassisRadius } = GENOME_LIMITS;

  const vertexCount = randomInt(rng, minVertices, maxVertices);
  const chassis = Array.from({ length: vertexCount }, (_, i) => {
    const angle = (i / vertexCount) * Math.PI * 2;
    const jitter = 0.5 + rng();
    return {
      x: Math.cos(angle) * chassisRadius * jitter,
      y: Math.sin(angle) * chassisRadius * jitter,
    };
  });

  const wheelCount = randomInt(rng, minWheels, maxWheels);
  const wheels = Array.from({ length: wheelCount }, () => ({
    vertexIndex: randomInt(rng, 0, vertexCount - 1),
    radius: randomFloat(rng, GENOME_LIMITS.minWheelRadius, GENOME_LIMITS.maxWheelRadius),
    torque: randomFloat(rng, GENOME_LIMITS.minTorque, GENOME_LIMITS.maxTorque),
  }));

  return { chassis, wheels };
}

/**
 * Force a genome back inside its limits. Every operator that produces a genome
 * (crossover, mutation, share-link decoding) runs its output through this, so
 * downstream physics never has to defend against an impossible car.
 * @param {object} genome
 */
export function normalizeGenome(genome) {
  if (!genome || typeof genome !== 'object') {
    throw new TypeError('normalizeGenome: genome must be an object');
  }
  const { chassis, wheels } = genome;
  if (!Array.isArray(chassis) || !Array.isArray(wheels)) {
    throw new TypeError('normalizeGenome: genome needs chassis and wheels arrays');
  }

  const points = chassis
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => clampVertex(p));
  if (points.length < GENOME_LIMITS.minVertices) {
    throw new RangeError(
      `normalizeGenome: chassis needs at least ${GENOME_LIMITS.minVertices} valid vertices, got ${points.length}`,
    );
  }
  const nextChassis = points.slice(0, GENOME_LIMITS.maxVertices);

  const nextWheels = wheels
    .filter((w) => w && Number.isFinite(w.radius) && Number.isFinite(w.vertexIndex))
    .slice(0, GENOME_LIMITS.maxWheels)
    .map((w) => ({
      vertexIndex: clamp(Math.round(w.vertexIndex), 0, nextChassis.length - 1),
      radius: clamp(w.radius, GENOME_LIMITS.minWheelRadius, GENOME_LIMITS.maxWheelRadius),
      torque: clamp(
        Number.isFinite(w.torque) ? w.torque : GENOME_LIMITS.minTorque,
        GENOME_LIMITS.minTorque,
        GENOME_LIMITS.maxTorque,
      ),
    }));
  if (nextWheels.length < GENOME_LIMITS.minWheels) {
    throw new RangeError(
      `normalizeGenome: genome needs at least ${GENOME_LIMITS.minWheels} valid wheels, got ${nextWheels.length}`,
    );
  }

  return { chassis: nextChassis, wheels: nextWheels };
}

/** True when a genome satisfies every structural limit. */
export function isValidGenome(genome) {
  try {
    normalizeGenome(genome);
    return true;
  } catch {
    return false;
  }
}

/** Deep copy — genomes are passed between generations and must not alias. */
export function cloneGenome(genome) {
  return {
    chassis: genome.chassis.map((p) => ({ x: p.x, y: p.y })),
    wheels: genome.wheels.map((w) => ({ ...w })),
  };
}

function clampVertex(point) {
  const distance = Math.hypot(point.x, point.y);
  const { minVertexRadius, maxVertexRadius } = GENOME_LIMITS;
  if (distance >= minVertexRadius && distance <= maxVertexRadius) {
    return { x: point.x, y: point.y };
  }
  // A vertex at the origin has no direction to push out along; nudge it right.
  const angle = distance === 0 ? 0 : Math.atan2(point.y, point.x);
  const target = clamp(distance, minVertexRadius, maxVertexRadius);
  return { x: Math.cos(angle) * target, y: Math.sin(angle) * target };
}

function assertRng(rng, caller) {
  if (typeof rng !== 'function') {
    throw new TypeError(`${caller}: rng must be a function`);
  }
}
