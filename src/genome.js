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
  // Zero is a real gene, not a floor to clamp away: an undriven wheel that just
  // rolls is often the better design, and evolution should be free to find that.
  minTorque: 0,
  maxTorque: 0.12,
  chassisRadius: 60,
  minVertexRadius: 15,
  maxVertexRadius: 110,
});

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Genomes live on a fixed grid: whole pixels for geometry, three decimals for
// torque. This is what makes a share link lossless — physics is chaotic, so a
// link that rounded coordinates on the way out would replay a visibly different
// run from the one that was scored. Quantizing at the source instead means the
// encoded car IS the car. The grid is far finer than the mutation jitter, so it
// costs the search nothing.
// Math.round(-0.3) is -0, which survives JSON, compares unequal to 0 under
// Object.is, and would make a decoded genome differ from its original over a
// value that means nothing. Collapse it.
function unsignZero(value) {
  return value === 0 ? 0 : value;
}

export function quantizeLength(value) {
  return unsignZero(Math.round(value));
}

export function quantizeTorque(value) {
  return unsignZero(Math.round(value * 1000) / 1000);
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

  // Normalized on the way out so every genome in the system — random, bred, or
  // decoded from a link — is already on the canonical grid.
  return normalizeGenome({ chassis, wheels });
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
      radius: quantizeLength(
        clamp(w.radius, GENOME_LIMITS.minWheelRadius, GENOME_LIMITS.maxWheelRadius),
      ),
      torque: quantizeTorque(
        clamp(
          Number.isFinite(w.torque) ? w.torque : GENOME_LIMITS.minTorque,
          GENOME_LIMITS.minTorque,
          GENOME_LIMITS.maxTorque,
        ),
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
    return { x: quantizeLength(point.x), y: quantizeLength(point.y) };
  }
  // A vertex at the origin has no direction to push out along; nudge it right.
  const angle = distance === 0 ? 0 : Math.atan2(point.y, point.x);
  const target = clamp(distance, minVertexRadius, maxVertexRadius);
  return {
    x: quantizeLength(Math.cos(angle) * target),
    y: quantizeLength(Math.sin(angle) * target),
  };
}

function assertRng(rng, caller) {
  if (typeof rng !== 'function') {
    throw new TypeError(`${caller}: rng must be a function`);
  }
}
