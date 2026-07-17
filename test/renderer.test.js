// Drives createRenderer against a fake 2D context. Asserting which paint calls
// happen would only restate the implementation, so the fake instead enforces the
// one invariant that actually breaks the picture: every coordinate handed to the
// canvas must be a finite number. A NaN reaches canvas as a silently skipped
// path, which is how a car goes invisible rather than throwing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createRenderer, cameraTarget } from '../src/render.js';
import { createDefaultTrack, finishX, heightAt } from '../src/track.js';
import { createRandomGenome } from '../src/genome.js';
import { chassisOutline, wheelAnchors } from '../src/car.js';
import { createRng } from '../src/rng.js';
import { replayGenome } from '../src/simulate.js';

const NUMERIC_CALLS = new Set([
  'arc', 'fillRect', 'lineTo', 'moveTo', 'rotate', 'scale', 'setTransform', 'translate', 'fillText',
]);

/** A 2D context that records paint calls and refuses a non-finite argument. */
function createFakeContext() {
  const calls = [];
  const check = (name, args) => {
    for (const arg of args) {
      if (typeof arg === 'number' && !Number.isFinite(arg)) {
        throw new Error(`ctx.${name} received a non-finite argument: ${args.join(', ')}`);
      }
    }
  };
  const ctx = {
    canvas: { width: 0, height: 0 },
    createLinearGradient: (...args) => {
      check('createLinearGradient', args);
      calls.push('createLinearGradient');
      return { addColorStop: () => {} };
    },
    calls,
  };
  const noop = [
    'arc', 'beginPath', 'clearRect', 'closePath', 'fill', 'fillRect', 'fillText', 'lineTo',
    'moveTo', 'restore', 'rotate', 'save', 'scale', 'setTransform', 'stroke', 'translate',
  ];
  for (const name of noop) {
    ctx[name] = (...args) => {
      if (NUMERIC_CALLS.has(name)) check(name, args);
      calls.push(name);
    };
  }
  return ctx;
}

function createFakeCanvas(width = 900, height = 500) {
  const ctx = createFakeContext();
  return {
    ctx,
    width: 0,
    height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width, height }),
  };
}

/** render.js reads window.devicePixelRatio; Node has no window. */
function withWindow(dpr, fn) {
  const had = 'window' in globalThis;
  const previous = globalThis.window;
  globalThis.window = { devicePixelRatio: dpr };
  try {
    return fn();
  } finally {
    if (had) globalThis.window = previous;
    else delete globalThis.window;
  }
}

const track = createDefaultTrack();

test('createRenderer rejects a canvas with no 2d context', () => {
  assert.throws(() => createRenderer({ getContext: () => null }), /could not get a 2d context/);
});

test('resize matches the backing store to the CSS size times devicePixelRatio', () => {
  const canvas = createFakeCanvas(800, 450);
  const renderer = createRenderer(canvas);
  withWindow(2, () => renderer.resize());

  assert.equal(canvas.width, 1600);
  assert.equal(canvas.height, 900);
  assert.deepEqual(renderer.size, { width: 800, height: 450 });
});

test('resize falls back to a ratio of 1 when the browser reports none', () => {
  const canvas = createFakeCanvas(640, 400);
  const renderer = createRenderer(canvas);
  withWindow(undefined, () => renderer.resize());

  assert.equal(canvas.width, 640);
  assert.equal(canvas.height, 400);
});

test('a zero-sized canvas still produces a usable backing store', () => {
  const canvas = createFakeCanvas(0, 0);
  const renderer = createRenderer(canvas);
  withWindow(1, () => renderer.resize());

  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
});

test('painting a real run never hands the canvas a non-finite coordinate', () => {
  const canvas = createFakeCanvas(1200, 700);
  const renderer = createRenderer(canvas);
  withWindow(2, () => renderer.resize());

  // A real evolved car on the real track, painted at every recorded pose.
  const genome = createRandomGenome(createRng(11));
  const result = replayGenome(genome, track);
  const outline = chassisOutline(genome);
  const anchors = wheelAnchors(genome);

  for (const pose of result.frames) {
    renderer.clear();
    renderer.drawBayMarks();
    renderer.drawTrack(track);
    renderer.moveCamera(cameraTarget(pose, track), 16, false);
    renderer.drawCar(null, pose, { outline, anchors });
  }

  assert.ok(result.frames.length > 0, 'the run recorded no frames to paint');
  assert.ok(canvas.ctx.calls.includes('arc'), 'no wheel was ever drawn');
});

test('the camera snaps on the first move and eases afterwards', () => {
  const canvas = createFakeCanvas();
  const renderer = createRenderer(canvas);
  withWindow(1, () => renderer.resize());

  renderer.moveCamera({ x: 500, y: -100 }, 16, false);
  assert.deepEqual(
    { x: renderer.camera.x, y: renderer.camera.y },
    { x: 500, y: -100 },
    'the first move should snap rather than ease in from the origin',
  );

  renderer.moveCamera({ x: 1500, y: -100 }, 16, false);
  assert.ok(
    renderer.camera.x > 500 && renderer.camera.x < 1500,
    `the camera should ease toward the target, sat at ${renderer.camera.x}`,
  );
});

test('reduced motion snaps the camera instead of tweening it', () => {
  const canvas = createFakeCanvas();
  const renderer = createRenderer(canvas);
  withWindow(1, () => renderer.resize());

  renderer.snapCamera({ x: 0, y: 0 });
  renderer.moveCamera({ x: 900, y: -50 }, 16, true);
  assert.deepEqual({ x: renderer.camera.x, y: renderer.camera.y }, { x: 900, y: -50 });
});

test('the camera closes roughly 63% of the gap in one time constant', () => {
  const canvas = createFakeCanvas();
  const renderer = createRenderer(canvas);
  withWindow(1, () => renderer.resize());

  renderer.snapCamera({ x: 0, y: 0 });
  renderer.moveCamera({ x: 1000, y: 0 }, 120, false);
  assert.ok(
    Math.abs(renderer.camera.x - 632) < 5,
    `expected ~632 after one 120ms tau, got ${renderer.camera.x}`,
  );
});

test('the camera tween is frame-rate independent', () => {
  const canvas = createFakeCanvas();
  const slow = createRenderer(canvas);
  const fast = createRenderer(createFakeCanvas());
  withWindow(1, () => {
    slow.resize();
    fast.resize();
  });

  slow.snapCamera({ x: 0, y: 0 });
  fast.snapCamera({ x: 0, y: 0 });
  slow.moveCamera({ x: 1000, y: 0 }, 32, false); // one 32ms frame
  fast.moveCamera({ x: 1000, y: 0 }, 16, false); // two 16ms frames
  fast.moveCamera({ x: 1000, y: 0 }, 16, false);

  assert.ok(
    Math.abs(slow.camera.x - fast.camera.x) < 1,
    `30fps landed at ${slow.camera.x}, 60fps at ${fast.camera.x}`,
  );
});

test('toScreen puts the camera focus on the horizon anchor', () => {
  const canvas = createFakeCanvas(1000, 600);
  const renderer = createRenderer(canvas);
  withWindow(1, () => renderer.resize());
  renderer.snapCamera({ x: 400, y: -80 });

  const point = renderer.toScreen(400, -80);
  assert.equal(point.x, 500, 'the focus should sit on the horizontal centre');
  assert.ok(point.y > 300 && point.y < 450, `the focus sat at y=${point.y}`);
});

test('the finish flag paints only once the camera reaches it', () => {
  const canvas = createFakeCanvas(1000, 600);
  const renderer = createRenderer(canvas);
  withWindow(1, () => renderer.resize());
  const countFills = () => canvas.ctx.calls.filter((c) => c === 'fillRect').length;

  // Back at the start line the flag is far off screen and must not be painted.
  renderer.snapCamera({ x: 0, y: 0 });
  const before = countFills();
  renderer.drawTrack(track);
  const offScreen = countFills() - before;

  // Parked on the finish, the checkerboard shows up.
  renderer.snapCamera({ x: finishX(track), y: heightAt(track, finishX(track)) });
  renderer.drawTrack(track);
  const onScreen = countFills() - before - offScreen;

  assert.equal(offScreen, 0, 'the flag painted while it was off screen');
  assert.equal(onScreen, 12, 'expected a 3x4 checkered flag');
});

test('drawEmptyState writes its message rather than leaving a blank rectangle', () => {
  const canvas = createFakeCanvas();
  const renderer = createRenderer(canvas);
  withWindow(1, () => renderer.resize());
  renderer.drawEmptyState('Warming up');
  assert.ok(canvas.ctx.calls.includes('fillText'));
});

test('drawConfetti paints each particle and survives an empty burst', () => {
  const canvas = createFakeCanvas();
  const renderer = createRenderer(canvas);
  withWindow(1, () => renderer.resize());

  renderer.drawConfetti([]);
  const before = canvas.ctx.calls.filter((c) => c === 'fillRect').length;
  renderer.drawConfetti([
    { x: 10, y: 20, rotation: 0.4, life: 300, maxLife: 600, size: 6, color: '#d5541a' },
    { x: 40, y: 50, rotation: 1.2, life: 10, maxLife: 600, size: 5, color: '#e8b400' },
  ]);
  const after = canvas.ctx.calls.filter((c) => c === 'fillRect').length;
  assert.equal(after - before, 2);
});

test('a car drawn as a ghost still paints without a genome outline cache', () => {
  const canvas = createFakeCanvas();
  const renderer = createRenderer(canvas);
  withWindow(1, () => renderer.resize());

  const genome = createRandomGenome(createRng(4));
  const pose = {
    chassis: { x: 100, y: 0, angle: 0.2 },
    wheels: genome.wheels.map((w) => ({ x: 100, y: 0, angle: 0, radius: w.radius })),
  };
  assert.doesNotThrow(() => renderer.drawCar(genome, pose, { ghost: true }));
});
