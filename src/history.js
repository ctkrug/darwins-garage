// Drives the evolution loop and keeps every generation, not just the current
// one — the generation slider replays history, so history is the product here.
// Evaluating a generation is heavy (24 physics runs), so the async runner
// slices the work across physics ticks and yields on a time budget to keep the
// main thread responsive.

import { createRng } from './rng.js';
import { createPopulation, evolvePopulation, rankedIndices, EVOLUTION_DEFAULTS } from './evolution.js';
import { simulateGenome, createSimulation } from './simulate.js';
import { isValidTrack, validateTrack } from './track.js';
import { cloneGenome } from './genome.js';

export const RUN_DEFAULTS = Object.freeze({
  // Seed 1 is the shipped demo: on the default track its best fitness runs
  // 674 -> 4992 -> 7216 across generations 0, 10 and 20, and five cars finish
  // by generation 40 — a steady climb rather than a puzzle solved instantly.
  seed: 1,
  populationSize: EVOLUTION_DEFAULTS.populationSize,
  generations: 40,
  // Budget plus worst-case slice overshoot has to stay under the ~50ms the
  // page can stall without feeling stuck, so the two are tuned together.
  chunkBudgetMs: 20,
  // How often the budget can be re-checked. A contact-heavy car peaks near 5ms
  // per tick, so five ticks caps a slice's overshoot at roughly 25ms.
  ticksPerSlice: 2,
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

/** The population generation `index` will be scored on. */
function populationFor(run) {
  return run.history.length === 0
    ? createPopulation(run.rng, run.config.populationSize)
    : run.pending;
}

/**
 * Evaluate the next generation and append it to history.
 * @returns {object} the generation record just computed
 */
export function runGeneration(run) {
  const population = populationFor(run);
  const results = population.map((genome) => simulateGenome(genome, run.track));
  return recordGeneration(run, population, results);
}

/**
 * Evaluate the next generation in time-boxed slices, handing control back to
 * the browser whenever the budget is spent. Chunking per individual is not
 * enough: a single contact-heavy car can cost 250ms on its own, so the slices
 * cut across the physics ticks themselves.
 */
export async function runGenerationAsync(run, options = {}) {
  const budgetMs = options.budgetMs ?? RUN_DEFAULTS.chunkBudgetMs;
  const ticksPerSlice = options.ticksPerSlice ?? RUN_DEFAULTS.ticksPerSlice;
  const yieldControl = options.yieldControl ?? defaultYield;
  const now = options.now ?? (() => Date.now());

  const population = populationFor(run);
  const results = [];
  let sliceStart = now();

  const spendBudget = async () => {
    if (now() - sliceStart >= budgetMs) {
      await yieldControl();
      sliceStart = now();
    }
  };

  for (const genome of population) {
    // Building a car and its terrain is itself ~9ms of work, so the budget is
    // checked before setup too — otherwise setup and the first ticks stack into
    // one oversized block.
    await spendBudget();
    const sim = createSimulation(genome, run.track);
    while (!sim.done) {
      sim.step(ticksPerSlice);
      await spendBudget();
    }
    results.push(sim.result);
  }
  return recordGeneration(run, population, results);
}

/** Score, rank, and store one evaluated generation, then breed the next. */
function recordGeneration(run, population, results) {
  const index = run.history.length;
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
    const generation = await runGenerationAsync(run, { ...options, yieldControl });
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

// setTimeout(0) is clamped to ~1-4ms per call by browsers, which at hundreds of
// yields per run would add seconds of pure waiting. A MessageChannel round-trip
// is a real macrotask — so rendering and input still get in — but unclamped.
function defaultYield() {
  if (typeof MessageChannel === 'undefined') {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

export { isValidTrack };
