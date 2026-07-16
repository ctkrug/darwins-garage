import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultTrack } from '../src/track.js';
import { isValidGenome } from '../src/genome.js';
import {
  createRun,
  runGeneration,
  runGenerationAsync,
  runAll,
  runAllAsync,
  generationAt,
  bestEver,
  fitnessCurve,
  RUN_DEFAULTS,
} from '../src/history.js';

const track = createDefaultTrack();
const smallRun = (options = {}) =>
  createRun(track, { seed: 1, generations: 2, populationSize: 6, ...options });

test('createRun starts with no history and does no work up front', () => {
  const run = smallRun();
  assert.deepEqual(run.history, []);
  assert.equal(run.config.populationSize, 6);
});

test('createRun rejects an invalid track', () => {
  assert.throws(() => createRun({ points: [{ x: 0, y: 0 }] }), TypeError);
  assert.throws(() => createRun(null), TypeError);
});

test('createRun rejects a non-positive generation count', () => {
  for (const bad of [0, -3, 1.5, NaN]) {
    assert.throws(() => createRun(track, { generations: bad }), RangeError);
  }
});

test('runGeneration records a full generation and indexes it', () => {
  const run = smallRun();
  const generation = runGeneration(run);
  assert.equal(generation.index, 0);
  assert.equal(generation.population.length, 6);
  assert.equal(generation.fitnesses.length, 6);
  assert.ok(generation.population.every(isValidGenome));
  assert.ok(generation.fitnesses.every(Number.isFinite));
  assert.equal(run.history.length, 1);
});

test('runGeneration reports the best individual consistently', () => {
  const run = smallRun();
  const generation = runGeneration(run);
  const max = Math.max(...generation.fitnesses);
  assert.equal(generation.bestFitness, max);
  assert.equal(generation.fitnesses[generation.bestIndex], max);
  assert.deepEqual(generation.bestGenome, generation.population[generation.bestIndex]);
  assert.equal(generation.ranked[0], generation.bestIndex);
});

test('runGeneration reports a plausible average and finisher count', () => {
  const run = smallRun();
  const generation = runGeneration(run);
  assert.ok(generation.averageFitness <= generation.bestFitness + 1e-9);
  assert.ok(generation.averageFitness >= 0);
  assert.ok(generation.finishers >= 0 && generation.finishers <= 6);
});

test('generation history is addressable by index and stores distinct generations', () => {
  const run = smallRun();
  runAll(run);
  assert.equal(run.history.length, 2);
  assert.equal(generationAt(run, 0).index, 0);
  assert.equal(generationAt(run, 1).index, 1);
  assert.notDeepEqual(generationAt(run, 0).population, generationAt(run, 1).population);
});

test('generationAt returns null outside the computed range', () => {
  const run = smallRun();
  runAll(run);
  for (const bad of [-1, 2, 99, 1.5, NaN, 'x']) {
    assert.equal(generationAt(run, bad), null);
  }
});

test('a stored generation is not mutated by later generations', () => {
  const run = smallRun({ generations: 3 });
  runGeneration(run);
  const snapshot = JSON.stringify(run.history[0]);
  runAll(run);
  assert.equal(JSON.stringify(run.history[0]), snapshot);
});

test('a run reproduces exactly from its seed', () => {
  const a = smallRun();
  const b = smallRun();
  runAll(a);
  runAll(b);
  assert.deepEqual(fitnessCurve(a), fitnessCurve(b));
  assert.deepEqual(a.history[1].population, b.history[1].population);
});

test('different seeds produce different runs', () => {
  const a = smallRun({ seed: 1 });
  const b = smallRun({ seed: 2 });
  runAll(a);
  runAll(b);
  assert.notDeepEqual(fitnessCurve(a), fitnessCurve(b));
});

test('the async runner produces bit-identical history to the sync runner', async () => {
  // The page computes generations asynchronously; if that diverged from the
  // synchronous path, a share link would replay a different run than it scored.
  const sync = smallRun();
  runAll(sync);
  const async = smallRun();
  await runAllAsync(async);
  assert.deepEqual(
    async.history.map((g) => g.fitnesses),
    sync.history.map((g) => g.fitnesses),
  );
});

test('the async runner reports each generation as it lands', async () => {
  const run = smallRun();
  const seen = [];
  await runAllAsync(run, { onGeneration: (g) => seen.push(g.index) });
  assert.deepEqual(seen, [0, 1]);
});

test('the async runner stops early when its signal aborts', async () => {
  const run = smallRun({ generations: 5 });
  const signal = { aborted: false };
  await runAllAsync(run, { signal, onGeneration: () => { signal.aborted = true; } });
  assert.equal(run.history.length, 1);
});

test('the async runner never yields when the budget is never spent', async () => {
  // A clock that never advances means the budget is never exhausted, so the
  // runner should do its work in one uninterrupted pass.
  const run = smallRun({ generations: 1 });
  let yields = 0;
  await runGenerationAsync(run, {
    budgetMs: 20,
    now: () => 0,
    yieldControl: async () => { yields += 1; },
  });
  assert.equal(yields, 0);
  assert.equal(run.history.length, 1);
});

test('the async runner keeps each uninterrupted slice inside its budget', async () => {
  // A synthetic clock that advances a fixed amount per physics slice lets this
  // assert the invariant exactly: work between yields never runs away.
  const budgetMs = 20;
  const perTick = 7;
  let clock = 0;
  let lastYield = 0;
  let worstGap = 0;
  const run = smallRun({ generations: 1 });

  await runGenerationAsync(run, {
    budgetMs,
    ticksPerSlice: 1,
    now: () => {
      clock += perTick;
      return clock;
    },
    yieldControl: async () => {
      worstGap = Math.max(worstGap, clock - lastYield);
      lastYield = clock;
    },
  });
  // Each budget check costs one perTick of simulated time, so a slice can
  // overshoot by at most one tick's worth beyond the budget.
  assert.ok(worstGap <= budgetMs + perTick * 2, `slice ran ${worstGap}ms, budget ${budgetMs}ms`);
});

test('bestEver tracks the best individual across the whole run', () => {
  const run = smallRun({ generations: 3 });
  runAll(run);
  const best = bestEver(run);
  const expected = Math.max(...run.history.map((g) => g.bestFitness));
  assert.equal(best.fitness, expected);
  assert.equal(run.history[best.generation].bestFitness, expected);
  assert.ok(isValidGenome(best.genome));
});

test('bestEver returns null before anything has run', () => {
  assert.equal(bestEver(smallRun()), null);
});

test('fitnessCurve reports one entry per computed generation', () => {
  const run = smallRun({ generations: 3 });
  runAll(run);
  const curve = fitnessCurve(run);
  assert.equal(curve.length, 3);
  assert.deepEqual(curve.map((c) => c.generation), [0, 1, 2]);
  assert.ok(curve.every((c) => Number.isFinite(c.best) && Number.isFinite(c.average)));
});

test('fitnessCurve is empty before anything has run', () => {
  assert.deepEqual(fitnessCurve(smallRun()), []);
});

test('best fitness never regresses, because elites carry over', () => {
  // What makes the generation slider legible: scrubbing forward should never
  // show the champion getting worse.
  const run = createRun(track, { seed: 1, generations: 8, populationSize: 10 });
  runAll(run);
  const curve = fitnessCurve(run);
  for (let i = 1; i < curve.length; i += 1) {
    assert.ok(
      curve[i].best >= curve[i - 1].best - 1e-6,
      `generation ${i} regressed: ${curve[i - 1].best} -> ${curve[i].best}`,
    );
  }
});

test('the shipped defaults describe the demo the app actually runs', () => {
  assert.equal(RUN_DEFAULTS.generations, 40);
  assert.equal(RUN_DEFAULTS.seed, 1);
  assert.ok(RUN_DEFAULTS.chunkBudgetMs <= 50, 'budget must stay inside the responsiveness bar');
});
