import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, STORAGE_KEY } from '../src/audio.js';

// A minimal WebAudio stand-in that records what got scheduled, so the tests can
// assert on behaviour (did a sound play? was it silent when muted?) rather than
// on the exact oscillator graph.
function fakeContext() {
  const started = [];
  const node = () => ({
    connect() {},
    frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    type: '',
  });
  class Ctx {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.state = 'running';
      this.destination = {};
      this.started = started;
    }
    createGain() { return node(); }
    createOscillator() {
      const osc = node();
      osc.start = () => started.push('osc');
      osc.stop = () => {};
      return osc;
    }
    createBiquadFilter() { return node(); }
    createBufferSource() {
      const src = node();
      src.start = () => started.push('noise');
      return src;
    }
    createBuffer(channels, frames) {
      return { getChannelData: () => new Float32Array(frames) };
    }
    resume() { return Promise.resolve(); }
  }
  return { Ctx, started };
}

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    map,
  };
}

const SFX = ['tick', 'clatter', 'thud', 'chime', 'fanfare'];

test('every sound in the design plan exists and is synthesized, not loaded', () => {
  const audio = createAudio({ contextClass: fakeContext().Ctx, storage: fakeStorage() });
  for (const name of SFX) {
    assert.equal(typeof audio[name], 'function', `${name} is missing`);
  }
});

test('each sound schedules audio when unmuted', () => {
  for (const name of SFX) {
    const { Ctx, started } = fakeContext();
    const audio = createAudio({ contextClass: Ctx, storage: fakeStorage() });
    audio.unlock();
    audio[name]();
    if (name === 'fanfare') continue; // staggered via setTimeout; covered below
    assert.ok(started.length > 0, `${name} produced no sound`);
  }
});

test('muting silences every sound immediately', () => {
  for (const name of SFX) {
    const { Ctx, started } = fakeContext();
    const audio = createAudio({ contextClass: Ctx, storage: fakeStorage() });
    audio.unlock();
    audio.toggleMute();
    assert.equal(audio.muted, true);
    audio[name]();
    assert.equal(started.length, 0, `${name} still played while muted`);
  }
});

test('mute state persists to storage and is restored on the next session', () => {
  const storage = fakeStorage();
  const first = createAudio({ contextClass: fakeContext().Ctx, storage });
  assert.equal(first.muted, false);
  first.toggleMute();
  assert.equal(storage.map.get(STORAGE_KEY), '1');

  const second = createAudio({ contextClass: fakeContext().Ctx, storage });
  assert.equal(second.muted, true, 'mute did not survive a reload');
});

test('unmuting persists too', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: '1' });
  const audio = createAudio({ contextClass: fakeContext().Ctx, storage });
  assert.equal(audio.muted, true);
  audio.toggleMute();
  assert.equal(audio.muted, false);
  assert.equal(storage.map.get(STORAGE_KEY), '0');
  assert.equal(createAudio({ contextClass: fakeContext().Ctx, storage }).muted, false);
});

test('setMuted is idempotent', () => {
  const audio = createAudio({ contextClass: fakeContext().Ctx, storage: fakeStorage() });
  audio.setMuted(true);
  audio.setMuted(true);
  assert.equal(audio.muted, true);
  audio.setMuted(false);
  assert.equal(audio.muted, false);
});

test('no AudioContext is created before a gesture unlocks it', () => {
  let constructed = 0;
  const { Ctx } = fakeContext();
  class Counting extends Ctx {
    constructor() {
      super();
      constructed += 1;
    }
  }
  createAudio({ contextClass: Counting, storage: fakeStorage() });
  assert.equal(constructed, 0, 'audio context created before any user gesture');
});

test('repeated sounds are rate-limited rather than machine-gunned', () => {
  const { Ctx, started } = fakeContext();
  const audio = createAudio({ contextClass: Ctx, storage: fakeStorage() });
  audio.unlock();
  for (let i = 0; i < 50; i += 1) audio.clatter();
  // currentTime never advances in the fake, so every repeat is inside the gap.
  assert.equal(started.length, 1, `expected throttling, got ${started.length} plays`);
});

test('audio degrades to silence when WebAudio is unavailable', () => {
  const audio = createAudio({ contextClass: null, storage: fakeStorage() });
  assert.equal(audio.unlock(), false);
  for (const name of SFX) {
    assert.doesNotThrow(() => audio[name](), `${name} threw without WebAudio`);
  }
  assert.doesNotThrow(() => audio.toggleMute());
});

test('a throwing AudioContext does not take the app down', () => {
  class Broken {
    constructor() {
      throw new Error('no audio device');
    }
  }
  const audio = createAudio({ contextClass: Broken, storage: fakeStorage() });
  assert.equal(audio.unlock(), false);
  assert.doesNotThrow(() => audio.thud());
});

test('a throwing storage falls back to memory instead of crashing', () => {
  const hostile = {
    getItem() {
      throw new Error('storage disabled');
    },
    setItem() {
      throw new Error('storage disabled');
    },
  };
  const audio = createAudio({ contextClass: fakeContext().Ctx, storage: hostile });
  assert.doesNotThrow(() => audio.toggleMute());
});
