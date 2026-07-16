// Drives the evolution loop and keeps every generation, not just the current
// one — the generation slider replays history, so history is the product here.
// Evaluating a generation is heavy (24 physics runs), so the async runner
// yields between generations to keep the main thread responsive.

import { createRng } from './rng.js';
import { createPopulation, evolvePopulation, rankedIndices, EVOLUTION_DEFAULTS } from './evolution.js';
import { simulateGenome } from './simulate.js';
import { isValidTrack, validateTrack } from './track.js';
import { cloneGenome } from './genome.js';

export const RUN_DEFAULTS = Object.freeze({
  seed: 1,
  populationSize: EVOLUTION_DEFAULTS.populationSize,
  generations: 40,
});

/**
 * Create an evolution run. Nothing is computed yet; call runGeneration or
 * runAll to advance it.
 * @param {object} track
 * @param {object} [options]
 */
export function createRun(track, options = {}) {
  const problems = validateTrack(track);
  if (problems.length > 0) {
    throw new TypeError(`createRun: ${problems[0]}`);
  }
  const config = { ...RUN_DEFAULTS, ...EVOLUTION_DEFAULTS, ...options };
  if (!Number.isInteger(config.generations) || config.generations < 1) {
    throw new RangeError(`createRun: generations must be a positive integer, got ${config.generations}`);
  }
  return {
    track,
    config,
    // One rng for the whole run: generation N's breeding consumes the stream
    // left by generation N-1, so the run reproduces end-to-end from the seed.
    rng: createRng(config.seed),
    history: [],
    pending: null,
  };
}

/**
 * Evaluate the next generation and append it to history.
 * @returns {object} the generation record just computed
 */
export function runGeneration(run) {
  const index = run.history.length;
  const population = index === 0 ? createPopulation(run.rng, run.config.populationSize) : run.pending;

  const results = population.map((genome) => simulateGenome(genome, run.track));
  const fitnesses = results.map((r) => r.fitness);
  const ranked = rankedIndices(fitnesses);
  const best = ranked[0];

  const generation = {
    index,
    population: population.map(cloneGenome),
    fitnesses,
    results: results.map(({ fitness, finished, failed, failReason, ticks }) => ({
      fitness,
      finished,
      failed,
      failReason,
      ticks,
    })),
    ranked,
    bestIndex: best,
    bestFitness: fitnesses[best],
    bestGenome: cloneGenome(population[best]),
    averageFitness: fitnesses.reduce((sum, f) => sum + f, 0) / fitnesses.length,
    finishers: results.filter((r) => r.finished).length,
  };
  run.history.push(generation);
  run.pending = evolvePopulation(population, fitnesses, run.rng, run.config);
  return generation;
}

/** Run every generation synchronously. Blocking — for tests and scripts. */
export function runAll(run, count = run.config.generations) {
  while (run.history.length < count) runGeneration(run);
  return run.history;
}

/**
 * Run generations in chunks, handing control back to the browser between them
 * so the page never freezes. One generation is the unit of work — it is well
 * under a frame budget at the default population size.
 * @param {object} run
 * @param {object} [options]
 * @param {(generation: object, run: object) => void} [options.onGeneration]
 * @param {() => Promise<void>} [options.yieldControl] - injectable for tests.
 * @param {{aborted: boolean}} [options.signal] - set aborted to stop early.
 */
export async function runAllAsync(run, options = {}) {
  const count = options.count ?? run.config.generations;
  const onGeneration = options.onGeneration ?? (() => {});
  const yieldControl = options.yieldControl ?? defaultYield;
  const signal = options.signal;

  while (run.history.length < count) {
    if (signal?.aborted) break;
    const generation = runGeneration(run);
    onGeneration(generation, run);
    await yieldControl();
  }
  return run.history;
}

/** The generation record at an index, or null when out of range. */
export function generationAt(run, index) {
  if (!Number.isInteger(index) || index < 0 || index >= run.history.length) return null;
  return run.history[index];
}

/** The best fitness seen in any generation so far, and where it came from. */
export function bestEver(run) {
  let best = null;
  for (const generation of run.history) {
    if (!best || generation.bestFitness > best.fitness) {
      best = {
        fitness: generation.bestFitness,
        generation: generation.index,
        genome: generation.bestGenome,
        individual: generation.bestIndex,
      };
    }
  }
  return best;
}

/** Best fitness per generation — the fitness curve the HUD graphs. */
export function fitnessCurve(run) {
  return run.history.map((generation) => ({
    generation: generation.index,
    best: generation.bestFitness,
    average: generation.averageFitness,
  }));
}

function defaultYield() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export { isValidTrack };
