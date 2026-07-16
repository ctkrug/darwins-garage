// Selection, crossover, and mutation. Pure data transforms over genomes — no
// physics, no Matter, no canvas. Every random choice comes from an injected
// seeded rng so a whole evolution run reproduces from its seed.

import { createRandomGenome, normalizeGenome, cloneGenome, GENOME_LIMITS, clamp } from './genome.js';
import { randomInt, randomFloat } from './rng.js';

export const EVOLUTION_DEFAULTS = Object.freeze({
  populationSize: 24,
  // Fraction of the population copied into the next generation untouched. Without
  // it a lucky champion can be lost to a bad mutation and best-fitness regresses,
  // which reads as broken to someone scrubbing the generation slider.
  eliteCount: 2,
  mutationRate: 0.18,
  // Probability a breeding pair is actually spliced rather than the first
  // parent being cloned. Recombination is a source of novelty in its own right,
  // separate from mutation, so it gets its own dial.
  crossoverRate: 0.9,
  vertexJitter: 14,
  radiusJitter: 5,
  torqueJitter: 0.02,
  // Chance a mutation rewires a wheel to a different chassis vertex rather than
  // nudging a number — the structural move that finds four-wheel layouts.
  rewireChance: 0.25,
  tournamentSize: 3,
});

/** A generation-0 population of pure random genomes. */
export function createPopulation(rng, size = EVOLUTION_DEFAULTS.populationSize) {
  if (!Number.isInteger(size) || size < 2) {
    throw new RangeError(`createPopulation: size must be an integer >= 2, got ${size}`);
  }
  return Array.from({ length: size }, () => createRandomGenome(rng));
}

/**
 * Pick one parent by tournament: sample k individuals, return the fittest.
 * Tournament rather than fitness-proportionate selection because fitness here is
 * a raw distance — proportionate selection would barely distinguish 900 from
 * 1000, and would divide by zero when a whole generation scores 0.
 */
export function selectParent(population, fitnesses, rng, k = EVOLUTION_DEFAULTS.tournamentSize) {
  assertPopulation(population, fitnesses, 'selectParent');
  let bestIndex = randomInt(rng, 0, population.length - 1);
  for (let i = 1; i < k; i += 1) {
    const challenger = randomInt(rng, 0, population.length - 1);
    if (fitnesses[challenger] > fitnesses[bestIndex]) bestIndex = challenger;
  }
  return population[bestIndex];
}

/**
 * Splice two parents. The child takes one parent's chassis wholesale and the
 * other's wheels, then has its wheel indices clamped into the inherited
 * chassis — so a child's vertex count is always exactly one parent's, never an
 * invented in-between count that could be structurally invalid.
 */
export function crossover(parentA, parentB, rng) {
  const a = normalizeGenome(parentA);
  const b = normalizeGenome(parentB);
  const chassisDonor = rng() < 0.5 ? a : b;
  const wheelDonor = rng() < 0.5 ? a : b;

  return normalizeGenome({
    chassis: chassisDonor.chassis.map((p) => ({ x: p.x, y: p.y })),
    wheels: wheelDonor.wheels.map((w) => ({
      ...w,
      vertexIndex: clamp(w.vertexIndex, 0, chassisDonor.chassis.length - 1),
    })),
  });
}

/**
 * Nudge a genome. Each gene mutates independently at `rate`, so at rate 0 the
 * genome comes back untouched and selection alone drives the run.
 */
export function mutate(genome, rng, options = {}) {
  const config = { ...EVOLUTION_DEFAULTS, ...options };
  const rate = config.mutationRate;
  if (!(rate >= 0 && rate <= 1)) {
    throw new RangeError(`mutate: mutationRate must be within [0, 1], got ${rate}`);
  }
  const next = cloneGenome(normalizeGenome(genome));

  for (const point of next.chassis) {
    if (rng() < rate) point.x += randomFloat(rng, -config.vertexJitter, config.vertexJitter);
    if (rng() < rate) point.y += randomFloat(rng, -config.vertexJitter, config.vertexJitter);
  }
  for (const wheel of next.wheels) {
    if (rng() < rate) {
      wheel.radius = clamp(
        wheel.radius + randomFloat(rng, -config.radiusJitter, config.radiusJitter),
        GENOME_LIMITS.minWheelRadius,
        GENOME_LIMITS.maxWheelRadius,
      );
    }
    if (rng() < rate) {
      wheel.torque = clamp(
        wheel.torque + randomFloat(rng, -config.torqueJitter, config.torqueJitter),
        GENOME_LIMITS.minTorque,
        GENOME_LIMITS.maxTorque,
      );
    }
    if (rng() < rate * config.rewireChance) {
      wheel.vertexIndex = randomInt(rng, 0, next.chassis.length - 1);
    }
  }
  return normalizeGenome(next);
}

/**
 * Breed the next generation: elites survive untouched, the rest are tournament
 * -selected, crossed, and mutated.
 * @returns {object[]} a new population of the same size
 */
export function evolvePopulation(population, fitnesses, rng, options = {}) {
  assertPopulation(population, fitnesses, 'evolvePopulation');
  const config = { ...EVOLUTION_DEFAULTS, ...options };
  const eliteCount = clamp(config.eliteCount, 0, population.length);

  const next = rankedIndices(fitnesses)
    .slice(0, eliteCount)
    .map((i) => cloneGenome(population[i]));

  if (!(config.crossoverRate >= 0 && config.crossoverRate <= 1)) {
    throw new RangeError(
      `evolvePopulation: crossoverRate must be within [0, 1], got ${config.crossoverRate}`,
    );
  }

  while (next.length < population.length) {
    const parentA = selectParent(population, fitnesses, rng, config.tournamentSize);
    const parentB = selectParent(population, fitnesses, rng, config.tournamentSize);
    const child =
      rng() < config.crossoverRate
        ? crossover(parentA, parentB, rng)
        : cloneGenome(normalizeGenome(parentA));
    next.push(mutate(child, rng, config));
  }
  return next;
}

/** Population indices ordered best fitness first. */
export function rankedIndices(fitnesses) {
  return fitnesses
    .map((fitness, index) => ({ fitness, index }))
    // Tie-break on index so ranking is stable and a run stays reproducible.
    .sort((a, b) => b.fitness - a.fitness || a.index - b.index)
    .map((entry) => entry.index);
}

/** Index of the fittest individual. */
export function bestIndex(fitnesses) {
  return rankedIndices(fitnesses)[0];
}

function assertPopulation(population, fitnesses, caller) {
  if (!Array.isArray(population) || population.length === 0) {
    throw new TypeError(`${caller}: population must be a non-empty array`);
  }
  if (!Array.isArray(fitnesses) || fitnesses.length !== population.length) {
    throw new TypeError(
      `${caller}: fitnesses must be an array matching the population size (${population.length})`,
    );
  }
  if (fitnesses.some((f) => !Number.isFinite(f))) {
    throw new TypeError(`${caller}: every fitness must be a finite number`);
  }
}
