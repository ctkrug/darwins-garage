// App wiring: owns the DOM, the render loop, and the run. All of the domain
// logic lives in the modules this imports — this file is the seam between them
// and the page.

import './style.css';
import { createDefaultTrack, DEFAULT_TRACK_ID } from './track.js';
import { createRun, runAllAsync, bestEver, fitnessCurve } from './history.js';
import { replayGenome } from './simulate.js';
import { createRenderer, cameraTarget, PALETTE } from './render.js';
import { chassisOutline, wheelAnchors } from './car.js';
import { createAudio } from './audio.js';
import { readShare, shareUrl, SHARE_PARAM } from './share.js';
import { spawnConfetti, stepConfetti } from './confetti.js';

const el = (id) => document.getElementById(id);

const dom = {
  scene: el('scene'),
  curve: el('curve'),
  boot: el('boot'),
  bootText: document.querySelector('.boot__text'),
  verdict: el('verdict'),
  slider: el('generation'),
  sliderValue: el('generation-value'),
  progressNote: el('progress-note'),
  play: el('play'),
  playGlyph: el('play-glyph'),
  playLabel: el('play-label'),
  stepBack: el('step-back'),
  stepForward: el('step-forward'),
  share: el('share'),
  hofCard: el('hof-card'),
  hofCanvas: el('hof-canvas'),
  hofFitness: el('hof-fitness'),
  hofGen: el('hof-gen'),
  hofShare: el('hof-share'),
  hofEmpty: el('hof-empty'),
  mute: el('mute'),
  shareLabel: el('share-label'),
  population: el('population'),
  floorHint: el('floor-hint'),
  shareError: el('share-error'),
  statGeneration: el('stat-generation'),
  statFitness: el('stat-fitness'),
  statPopulation: el('stat-population'),
  statFinishers: el('stat-finishers'),
  statBestEver: el('stat-best-ever'),
};

const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const track = createDefaultTrack();
const renderer = createRenderer(dom.scene);
const audio = createAudio();

const state = {
  run: createRun(track, { trackId: DEFAULT_TRACK_ID }),
  generation: 0,
  individual: null, // null = "the best of this generation"
  playback: null,
  playing: true,
  speed: 1,
  frameTime: 0,
  bestEverFitness: -1,
  confetti: [],
  guest: null, // a car opened from a share link
  announcedFinish: false,
  announcedFail: false,
};

// Replays are deterministic, so a scrubbed generation only ever needs computing
// once. Without this, dragging the slider recomputes ~100ms of physics per step.
const replayCache = new Map();

/* ---------- selection & replay ---------- */

function currentGenome() {
  if (state.guest) return state.guest.genome;
  const generation = state.run.history[state.generation];
  if (!generation) return null;
  const index = state.individual ?? generation.bestIndex;
  return generation.population[index] ?? null;
}

function replayKey() {
  if (state.guest) return 'guest';
  return `${state.generation}:${state.individual ?? 'best'}`;
}

function loadReplay() {
  const genome = currentGenome();
  if (!genome) return;
  const key = replayKey();
  if (!replayCache.has(key)) {
    const result = replayGenome(genome, track);
    replayCache.set(key, {
      frames: result.frames,
      result,
      outline: chassisOutline(genome),
      anchors: wheelAnchors(genome),
    });
  }
  state.playback = { ...replayCache.get(key), tick: 0 };
  state.announcedFinish = false;
  state.announcedFail = false;
  state.playing = true;
  syncPlayButton();
  hideVerdict();
  // Scrubbing should cut straight to the new car, not sweep the camera across
  // the whole track to find it.
  const first = state.playback.frames[0];
  if (first) renderer.snapCamera(cameraTarget(first, track));
}

function selectGeneration(index, { fromUser = false } = {}) {
  const clamped = Math.max(0, Math.min(index, state.run.history.length - 1));
  if (clamped < 0) return;
  const changed = clamped !== state.generation || state.individual !== null;
  state.generation = clamped;
  state.individual = null;
  state.guest = null;
  if (fromUser && changed) audio.tick();
  loadReplay();
  renderHud();
  renderFloor();
  syncSlider();
}

function selectIndividual(index) {
  state.individual = index;
  state.guest = null;
  loadReplay();
  renderHud();
  renderFloor();
}

/* ---------- HUD ---------- */

const metres = (px) => Math.round(px / 10);

function renderHud() {
  const generation = state.run.history[state.generation];
  dom.statPopulation.textContent = state.run.config.populationSize;

  if (!generation) return;
  dom.statGeneration.textContent = generation.index;
  dom.statFinishers.textContent = generation.finishers;

  const shown = state.playback?.result;
  const fitness = state.guest ? (shown?.fitness ?? 0) : generation.bestFitness;
  dom.statFitness.innerHTML = `${metres(fitness)}<span class="stat__unit">m</span>`;

  const best = bestEver(state.run);
  if (best) {
    dom.statBestEver.textContent = `${metres(best.fitness)}m · gen ${best.generation}`;
  }
  drawCurve();
}

/** Pin the best-ever car to the hall-of-fame card, or show the empty state. */
function renderHallOfFame(best) {
  if (!best) {
    dom.hofEmpty.hidden = false;
    dom.hofCard.hidden = true;
    dom.hofShare.hidden = true;
    return;
  }
  dom.hofEmpty.hidden = true;
  dom.hofCard.hidden = false;
  dom.hofShare.hidden = false;
  dom.hofFitness.textContent = `${metres(best.fitness)}m`;
  dom.hofGen.textContent = `gen ${best.generation}`;
  // Deferred a frame so the canvas has been unhidden and laid out.
  requestAnimationFrame(() => drawSilhouette(dom.hofCanvas, best.genome, true));
}

function popStat(node) {
  if (reducedMotion) return;
  node.classList.remove('is-popped');
  // Reading offsetWidth restarts the animation; without it a repeat pop on the
  // same element is silently dropped.
  void node.offsetWidth;
  node.classList.add('is-popped');
}

function shakeHud() {
  if (reducedMotion) return;
  const hud = document.querySelector('.hud');
  hud.classList.remove('is-shaking');
  void hud.offsetWidth;
  hud.classList.add('is-shaking');
}

/** The win celebration for a new best-ever fitness: gold flash + confetti. */
function celebrateBestEver() {
  if (reducedMotion) return;
  const hud = document.querySelector('.hud');
  hud.classList.remove('is-celebrating');
  void hud.offsetWidth;
  hud.classList.add('is-celebrating');
  // Thrown from the top-right of the viewport, which sits beside the HUD.
  const { width } = renderer.size;
  state.confetti.push(...spawnConfetti(width - 40, 40, { count: 32 }));
}

function showVerdict(text, tone) {
  dom.verdict.textContent = text;
  dom.verdict.dataset.tone = tone;
  dom.verdict.classList.add('is-shown');
}

function hideVerdict() {
  dom.verdict.classList.remove('is-shown');
}

/** The fitness curve, stencilled onto the HUD plate. */
function drawCurve() {
  const canvas = dom.curve;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(72 * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, 72);

  const curve = fitnessCurve(state.run);
  if (curve.length < 2) return;
  const total = state.run.config.generations;
  const max = Math.max(...curve.map((c) => c.best), 1);
  const x = (i) => (i / Math.max(1, total - 1)) * rect.width;
  const y = (value) => 68 - (value / max) * 60;

  ctx.strokeStyle = 'rgba(242, 234, 216, 0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 68.5);
  ctx.lineTo(rect.width, 68.5);
  ctx.stroke();

  const drawLine = (pick, color, width) => {
    ctx.beginPath();
    curve.forEach((point, i) => {
      const px = x(i);
      const py = y(pick(point));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  drawLine((p) => p.average, 'rgba(169, 158, 136, 0.7)', 1.5);
  drawLine((p) => p.best, PALETTE.accentSupport, 2);

  // The scrub marker.
  const markerX = x(state.generation);
  ctx.strokeStyle = PALETTE.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(markerX, 2);
  ctx.lineTo(markerX, 68);
  ctx.stroke();
}

/* ---------- the floor ---------- */

function renderFloor() {
  const generation = state.run.history[state.generation];
  if (!generation) return;
  const selected = state.individual ?? generation.bestIndex;

  // Rebuild only when the generation changed; otherwise just move the classes,
  // so scrubbing does not thrash 24 canvases per frame.
  if (dom.population.dataset.generation !== String(generation.index)) {
    dom.population.dataset.generation = String(generation.index);
    dom.population.replaceChildren(
      ...generation.population.map((genome, i) => buildChip(genome, generation, i)),
    );
  }
  [...dom.population.children].forEach((chip, i) => {
    chip.classList.toggle('is-selected', i === selected && !state.guest);
    chip.classList.toggle('is-best', i === generation.bestIndex);
    chip.setAttribute('aria-pressed', String(i === selected && !state.guest));
  });
}

function buildChip(genome, generation, index) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  const fitness = generation.fitnesses[index];
  chip.setAttribute(
    'aria-label',
    `Car ${index + 1} of generation ${generation.index}, ${metres(fitness)} metres`,
  );

  const canvas = document.createElement('canvas');
  chip.append(canvas);

  const score = document.createElement('span');
  score.className = 'chip__score';
  score.textContent = `${metres(fitness)}m`;
  chip.append(score);

  chip.addEventListener('click', () => {
    audio.unlock();
    audio.tick();
    selectIndividual(index);
  });

  // Deferred a frame so the canvas has been laid out and has a real size.
  requestAnimationFrame(() => drawSilhouette(canvas, genome, index === generation.bestIndex));
  return chip;
}

function drawSilhouette(canvas, genome, isBest) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(58 * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const outline = chassisOutline(genome);
  const anchors = wheelAnchors(genome);
  const extent = Math.max(
    ...outline.map((p) => Math.hypot(p.x, p.y)),
    ...anchors.map((a) => Math.hypot(a.x, a.y) + a.radius),
    1,
  );
  const scale = Math.min(rect.width, 58) / (extent * 2.35);
  ctx.translate(rect.width / 2, 29);
  ctx.scale(scale, scale);

  for (const anchor of anchors) {
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, anchor.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#332d26';
    ctx.fill();
  }
  ctx.beginPath();
  outline.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = isBest ? PALETTE.accentSupport : PALETTE.accent;
  ctx.fill();
  ctx.strokeStyle = PALETTE.surface2;
  ctx.lineWidth = 2 / scale;
  ctx.stroke();
}

/* ---------- render loop ---------- */

function frame(now) {
  const dt = Math.min(64, now - (state.frameTime || now));
  state.frameTime = now;

  renderer.clear();
  renderer.drawBayMarks();
  renderer.drawTrack(track);

  if (state.confetti.length > 0) {
    state.confetti = stepConfetti(state.confetti, dt);
    renderer.drawConfetti(state.confetti);
  }

  const playback = state.playback;
  if (!playback) {
    renderer.drawEmptyState('Warming up the first generation…');
    requestAnimationFrame(frame);
    return;
  }

  if (state.playing && playback.frames.length > 0) {
    // Advance in physics ticks scaled by speed: the outcome is already decided,
    // so speed changes only how fast it is shown, never what happens.
    playback.tick += (dt / (1000 / 60)) * state.speed;
    if (playback.tick >= playback.frames.length - 1) {
      playback.tick = playback.frames.length - 1;
      state.playing = false;
      syncPlayButton();
      announceOutcome(playback.result);
    }
  }

  const pose = playback.frames[Math.floor(playback.tick)];
  if (pose) {
    renderer.moveCamera(cameraTarget(pose, track), dt, reducedMotion);
    renderer.drawCar(null, pose, { outline: playback.outline, anchors: playback.anchors });
  }
  requestAnimationFrame(frame);
}

function announceOutcome(result) {
  if (result.finished) {
    if (!state.announcedFinish) {
      state.announcedFinish = true;
      showVerdict('Finished the course', 'win');
      audio.chime();
      popStat(dom.statFinishers);
    }
    return;
  }
  if (state.announcedFail) return;
  state.announcedFail = true;
  if (result.failReason === 'flipped') {
    showVerdict('Rolled it', 'fail');
    audio.thud();
    shakeHud();
  } else if (result.failReason === 'stalled') {
    showVerdict('Stalled out', 'fail');
    audio.clatter();
  } else if (result.failReason === 'exploded') {
    showVerdict('Came apart', 'fail');
    audio.thud();
  } else {
    showVerdict('Out of time', 'fail');
  }
}

/* ---------- controls ---------- */

function syncSlider() {
  const max = Math.max(0, state.run.history.length - 1);
  dom.slider.max = String(max);
  dom.slider.value = String(state.generation);
  dom.sliderValue.textContent = state.generation;
  const fill = max === 0 ? 0 : (state.generation / max) * 100;
  dom.slider.style.setProperty('--fill', `${fill}%`);
}

function syncPlayButton() {
  const atEnd = state.playback && state.playback.tick >= state.playback.frames.length - 1;
  dom.playGlyph.textContent = state.playing ? '❚❚' : '▶';
  dom.playLabel.textContent = state.playing ? 'Pause' : atEnd ? 'Replay' : 'Play';
}

/** Point the mute button's icon, pressed state, and label at one muted flag. */
function syncMuteButton(muted) {
  dom.mute.classList.toggle('is-muted', muted);
  dom.mute.setAttribute('aria-pressed', String(muted));
  dom.mute.querySelector('.sr-only').textContent = muted
    ? 'Unmute sound effects'
    : 'Mute sound effects';
}

/** Pause playback and move exactly one recorded frame, clamped to the run. */
function stepFrame(delta) {
  if (!state.playback || state.playback.frames.length === 0) return;
  state.playing = false;
  const max = state.playback.frames.length - 1;
  state.playback.tick = Math.max(0, Math.min(max, Math.floor(state.playback.tick) + delta));
  syncPlayButton();
}

function buildShareUrl(genome, generation) {
  return shareUrl(
    { genome, generation, trackId: DEFAULT_TRACK_ID },
    window.location.href.split('?')[0],
  );
}

/** Copy a share URL to the clipboard, falling back to a prompt; reports success. */
async function writeShareLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // Clipboard access is denied in plenty of ordinary contexts (insecure
    // origin, permission prompt dismissed); fall back to showing the link.
    window.prompt('Copy this link to share the car:', url);
    return false;
  }
}

function wireControls() {
  dom.slider.addEventListener('input', () => {
    audio.unlock();
    selectGeneration(Number(dom.slider.value), { fromUser: true });
  });

  dom.play.addEventListener('click', () => {
    audio.unlock();
    if (!state.playback) return;
    const atEnd = state.playback.tick >= state.playback.frames.length - 1;
    if (atEnd) {
      state.playback.tick = 0;
      state.announcedFinish = false;
      state.announcedFail = false;
      hideVerdict();
    }
    state.playing = !state.playing;
    syncPlayButton();
  });

  for (const button of document.querySelectorAll('.btn--speed')) {
    button.addEventListener('click', () => {
      audio.unlock();
      state.speed = Number(button.dataset.speed);
      for (const other of document.querySelectorAll('.btn--speed')) {
        const active = other === button;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-pressed', String(active));
      }
    });
  }

  dom.mute.addEventListener('click', () => {
    audio.unlock();
    syncMuteButton(audio.toggleMute());
  });

  dom.share.addEventListener('click', async () => {
    audio.unlock();
    const genome = currentGenome();
    if (!genome) return;
    const copied = await writeShareLink(buildShareUrl(genome, state.generation));
    dom.share.classList.add('is-copied');
    dom.shareLabel.textContent = copied ? 'Link copied' : 'Link ready';
    setTimeout(() => {
      dom.share.classList.remove('is-copied');
      dom.shareLabel.textContent = 'Share this car';
    }, 2000);
  });

  dom.stepBack.addEventListener('click', () => {
    audio.unlock();
    stepFrame(-1);
  });

  dom.stepForward.addEventListener('click', () => {
    audio.unlock();
    stepFrame(1);
  });

  dom.hofCard.addEventListener('click', () => {
    audio.unlock();
    audio.tick();
    const best = bestEver(state.run);
    if (!best) return;
    selectGeneration(best.generation);
    selectIndividual(best.individual);
  });

  dom.hofShare.addEventListener('click', async () => {
    audio.unlock();
    const best = bestEver(state.run);
    if (!best) return;
    const copied = await writeShareLink(buildShareUrl(best.genome, best.generation));
    dom.hofShare.classList.add('is-copied');
    dom.hofShare.setAttribute('aria-label', copied ? 'Link copied' : 'Link ready');
    setTimeout(() => {
      dom.hofShare.classList.remove('is-copied');
      dom.hofShare.setAttribute('aria-label', 'Share the hall-of-fame car');
    }, 2000);
  });

  // Keyboard: the slider handles arrows natively; space toggles playback.
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.target.closest('button, input')) return;
    event.preventDefault();
    dom.play.click();
  });

  const onResize = () => {
    renderer.resize();
    drawCurve();
  };
  window.addEventListener('resize', onResize);
  renderer.resize();
}

/* ---------- share links ---------- */

function loadSharedCar() {
  const share = readShare(window.location.href);
  if (share === null) return false;
  if (!share.ok) {
    dom.shareError.textContent = `${share.error} Showing a fresh run instead.`;
    dom.shareError.hidden = false;
    // Drop the bad param so a reload doesn't hit the same error.
    const url = new URL(window.location.href);
    url.searchParams.delete(SHARE_PARAM);
    window.history.replaceState({}, '', url);
    return false;
  }
  state.guest = share.value;
  dom.floorHint.textContent =
    'You opened a shared car. Scrub the slider to leave it and explore this run.';
  loadReplay();
  return true;
}

/* ---------- boot ---------- */

async function boot() {
  wireControls();
  // The mute preference is restored from localStorage, so the button has to
  // start from whatever audio.js loaded rather than from the markup's default.
  syncMuteButton(audio.muted);
  document.body.classList.add('is-booting');
  requestAnimationFrame(frame);

  const hadGuest = loadSharedCar();

  let firstGeneration = true;
  await runAllAsync(state.run, {
    onGeneration: () => {
      if (firstGeneration) {
        firstGeneration = false;
        dom.boot.hidden = true;
        document.body.classList.remove('is-booting');
        if (!hadGuest) selectGeneration(0);
      }
      // Let the slider reach whatever has been computed so far, so the page is
      // scrubbable long before all 40 generations are in.
      syncSlider();
      renderHud();

      const best = bestEver(state.run);
      if (best && best.fitness > state.bestEverFitness) {
        const improved = state.bestEverFitness >= 0;
        state.bestEverFitness = best.fitness;
        if (improved) {
          popStat(dom.statBestEver);
          audio.fanfare();
          celebrateBestEver();
        }
      }
      renderHallOfFame(best);
      dom.progressNote.textContent = `Evolved ${state.run.history.length} of ${state.run.config.generations} generations…`;
    },
  });

  dom.progressNote.textContent = `${state.run.config.generations} generations evolved. Scrub anywhere.`;
  syncSlider();
  renderHud();
}

boot().catch((error) => {
  // A failure here means no simulation at all, so say so in the page rather
  // than leaving an empty canvas and a console stack trace.
  dom.boot.hidden = false;
  dom.bootText.textContent = "Something broke while evolving. Reload to try again.";
  dom.shareError.textContent = `Evolution failed: ${error.message}`;
  dom.shareError.hidden = false;
});
