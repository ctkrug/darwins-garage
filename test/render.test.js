// The renderer's pure camera maths. createRenderer itself needs a canvas, but
// how the camera frames a car is plain arithmetic and is what actually decides
// whether the car reads on screen, so it is worth pinning here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { viewScale, cameraTarget, CAMERA_DEFAULTS, HORIZON_ANCHOR, PALETTE } from '../src/render.js';
import { createDefaultTrack, heightAt } from '../src/track.js';

const visible = (w, h) => {
  const s = viewScale(w, h);
  return { width: w / s, height: h / s };
};

test('viewScale never opens the view past either world ceiling', () => {
  for (const [w, h] of [
    [1550, 800], // desktop bay
    [720, 620], // tablet
    [358, 464], // phone
    [1920, 300], // a wide, short letterbox
    [320, 900], // a narrow, tall column
  ]) {
    const view = visible(w, h);
    assert.ok(
      view.width <= CAMERA_DEFAULTS.maxWorldWidth + 1e-6,
      `${w}x${h} showed ${view.width} world units across`,
    );
    assert.ok(
      view.height <= CAMERA_DEFAULTS.maxWorldHeight + 1e-6,
      `${w}x${h} showed ${view.height} world units tall`,
    );
  }
});

test('viewScale keeps a car the same fraction of the frame across aspect ratios', () => {
  // The regression this guards: scaling on width alone let a tall canvas show an
  // unbounded slice of world height, shrinking the car to a speck on a phone.
  const CAR = 100; // world units, roughly a chassis plus wheels
  const fractions = [
    [1550, 800],
    [768, 620],
    [358, 464],
  ].map(([w, h]) => (CAR * viewScale(w, h)) / h);

  for (const fraction of fractions) {
    assert.ok(fraction > 0.12, `a car filled only ${(fraction * 100).toFixed(1)}% of the frame`);
  }
  const spread = Math.max(...fractions) - Math.min(...fractions);
  assert.ok(spread < 0.02, `car size swung ${(spread * 100).toFixed(1)}% between viewports`);
});

test('viewScale is monotonic: a bigger canvas never shows less world', () => {
  assert.ok(visible(800, 500).width <= visible(1600, 500).width);
  assert.ok(visible(800, 500).height <= visible(800, 1000).height);
});

test('viewScale survives a zero-sized canvas', () => {
  // resize() clamps to 1px, but a caller measuring a display:none canvas can
  // still reach here; it must not divide by zero or go negative.
  for (const [w, h] of [[0, 0], [-10, -10], [0, 600]]) {
    const s = viewScale(w, h);
    assert.ok(Number.isFinite(s) && s > 0, `viewScale(${w}, ${h}) returned ${s}`);
  }
});

test('the horizon anchor leaves the car below centre but off the floor', () => {
  assert.ok(HORIZON_ANCHOR > 0.5 && HORIZON_ANCHOR < 0.75);
});

test('cameraTarget leads the car and clears the ground', () => {
  const track = createDefaultTrack();
  const pose = { chassis: { x: 900, y: heightAt(track, 900) - 20, angle: 0 }, wheels: [] };
  const target = cameraTarget(pose, track);

  assert.ok(target.x > pose.chassis.x, 'the camera should look ahead of the car');
  assert.ok(target.y < pose.chassis.y, 'the camera should sit above the car');
  assert.ok(Number.isFinite(target.x) && Number.isFinite(target.y));
});

test('cameraTarget follows the terrain when a car sinks below the surface', () => {
  // A chassis that has come apart can report a y well under the ground; the
  // camera should still frame the surface rather than dive into the dirt.
  const track = createDefaultTrack();
  const x = 4800; // the crest
  const ground = heightAt(track, x);
  const buried = { chassis: { x, y: ground + 500, angle: 0 }, wheels: [] };
  const flying = { chassis: { x, y: ground - 500, angle: 0 }, wheels: [] };

  assert.equal(cameraTarget(buried, track).y, ground - 60);
  assert.equal(cameraTarget(flying, track).y, ground - 500 - 60);
});

test('the palette is frozen and matches the DESIGN.md tokens', () => {
  assert.ok(Object.isFrozen(PALETTE));
  assert.equal(PALETTE.accent, '#d5541a');
  assert.equal(PALETTE.accentSupport, '#e8b400');
});
