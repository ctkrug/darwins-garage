// Synthesized sound effects. Every sound is built from oscillators and noise at
// runtime — there are no audio files in this project. The context is created
// lazily on the first user gesture (browsers block autoplay before that) and
// every entry point degrades to silence where WebAudio is missing, so tests and
// old browsers never see an exception.

const STORAGE_KEY = 'darwins-garage:muted';

export function createAudio(options = {}) {
  const storage = guardStorage(options.storage ?? defaultStorage());
  const ContextClass =
    options.contextClass ??
    (typeof AudioContext !== 'undefined'
      ? AudioContext
      : typeof webkitAudioContext !== 'undefined'
        ? webkitAudioContext
        : null);

  let muted = storage.getItem(STORAGE_KEY) === '1';
  let ctx = null;
  let master = null;
  let lastPlayed = new Map();

  function ensureContext() {
    if (ctx || !ContextClass) return ctx;
    try {
      ctx = new ContextClass();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      // An unavailable or blocked audio device is not worth breaking the app
      // over; the toy stays fully playable in silence.
      ctx = null;
    }
    return ctx;
  }

  /** Call from a real user gesture to unlock playback. */
  function unlock() {
    const context = ensureContext();
    if (context && context.state === 'suspended') context.resume().catch(() => {});
    return Boolean(context);
  }

  /** Rate-limit a sound so a physics event storm can't machine-gun it. */
  function throttled(name, minGapMs) {
    const now = ctx ? ctx.currentTime * 1000 : 0;
    const last = lastPlayed.get(name) ?? -Infinity;
    if (now - last < minGapMs) return false;
    lastPlayed.set(name, now);
    return true;
  }

  function tone({ freq, duration, type = 'sine', gain = 0.3, sweepTo = null }) {
    const context = ensureContext();
    if (!context || muted) return;
    const t0 = context.currentTime;
    const osc = context.createOscillator();
    const env = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + duration);
    // A short attack then exponential decay: percussive, never a click.
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env);
    env.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function noise({ duration = 0.12, gain = 0.25, bandpass = 1200 }) {
    const context = ensureContext();
    if (!context || muted) return;
    const t0 = context.currentTime;
    const frames = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      // Decaying white noise — the scrap-metal clatter.
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = bandpass;
    const env = context.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(filter);
    filter.connect(env);
    env.connect(master);
    source.start(t0);
  }

  const sfx = {
    /** Slider scrubbing across a generation. */
    tick() {
      if (!throttled('tick', 40)) return;
      tone({ freq: 880, duration: 0.04, type: 'square', gain: 0.06 });
    },
    /** A car's chassis striking terrain. */
    clatter() {
      if (!throttled('clatter', 90)) return;
      noise({ duration: 0.09, gain: 0.12, bandpass: 2400 });
    },
    /** A car rolling over. */
    thud() {
      if (!throttled('thud', 150)) return;
      tone({ freq: 160, sweepTo: 60, duration: 0.22, type: 'triangle', gain: 0.22 });
      noise({ duration: 0.14, gain: 0.1, bandpass: 400 });
    },
    /** A car crossing the finish line. */
    chime() {
      if (!throttled('chime', 200)) return;
      tone({ freq: 660, duration: 0.14, type: 'sine', gain: 0.16 });
      tone({ freq: 990, duration: 0.22, type: 'sine', gain: 0.12 });
    },
    /** A new best-ever car: the celebration. */
    fanfare() {
      if (!throttled('fanfare', 600)) return;
      const context = ensureContext();
      if (!context || muted) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        setTimeout(() => tone({ freq, duration: 0.24, type: 'triangle', gain: 0.15 }), i * 80);
      });
    },
  };

  return {
    ...sfx,
    unlock,
    get muted() {
      return muted;
    },
    /** Toggle mute and persist it, so the choice survives a reload. */
    toggleMute() {
      muted = !muted;
      storage.setItem(STORAGE_KEY, muted ? '1' : '0');
      if (master) master.gain.value = muted ? 0 : 0.35;
      return muted;
    },
    setMuted(value) {
      if (Boolean(value) !== muted) this.toggleMute();
      return muted;
    },
  };
}

function defaultStorage() {
  return typeof localStorage === 'undefined' ? memoryStorage() : localStorage;
}

// Storage can throw on read *or* on write — private modes reject setItem, and
// quota errors surface only on write. Every call is wrapped, not just a probe,
// and a failure silently degrades to a per-session memory store: losing the
// mute preference is not worth taking the page down for.
function guardStorage(storage) {
  const fallback = memoryStorage();
  return {
    getItem(key) {
      try {
        return storage.getItem(key);
      } catch {
        return fallback.getItem(key);
      }
    },
    setItem(key, value) {
      try {
        storage.setItem(key, value);
      } catch {
        fallback.setItem(key, value);
      }
    },
  };
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

export { STORAGE_KEY };
