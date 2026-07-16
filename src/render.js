// Canvas renderer for the simulation viewport. Draws the workshop floor, the
// terrain, and cars, and owns the camera. Pure drawing: it reads state and
// paints it, and never advances physics or evolution.

import { chassisOutline, wheelAnchors } from './car.js';
import { heightAt, finishX } from './track.js';

export const PALETTE = Object.freeze({
  bg: '#e8e0d0',
  surface1: '#d9cdb4',
  surface2: '#2b2620',
  text: '#241f19',
  textOnDark: '#f2ead8',
  muted: '#6b6152',
  accent: '#d5541a',
  accentSupport: '#e8b400',
  success: '#4f7942',
  danger: '#b3261e',
});

export const CAMERA_DEFAULTS = Object.freeze({
  // The 120ms ease-out pan from DESIGN.md, expressed as a per-frame lerp factor
  // at 60fps: 1 - exp(-dt/tau) with tau chosen so the camera closes ~63% of the
  // gap in 120ms. Recomputed per frame so it stays correct at any frame rate.
  tauMs: 120,
  worldWidth: 1500,
  minWorldWidth: 900,
  groundPadding: 220,
});

/**
 * Create a renderer bound to a canvas.
 * @param {HTMLCanvasElement} canvas
 */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('createRenderer: could not get a 2d context');

  const camera = { x: 0, y: 0, initialized: false };
  let width = 0;
  let height = 0;

  /** Match the backing store to the CSS size and devicePixelRatio. */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** World units visible across the canvas — narrower on a phone. */
  function worldWidth() {
    return width < 700 ? CAMERA_DEFAULTS.minWorldWidth : CAMERA_DEFAULTS.worldWidth;
  }

  function scale() {
    return width / worldWidth();
  }

  /** Snap the camera straight to a target, with no tween (used on scrub). */
  function snapCamera(target) {
    camera.x = target.x;
    camera.y = target.y;
    camera.initialized = true;
  }

  /**
   * Ease the camera toward a target. Frame-rate independent, and skipped
   * entirely under prefers-reduced-motion (D2: keep function, drop motion).
   */
  function moveCamera(target, dtMs, reducedMotion) {
    if (!camera.initialized || reducedMotion) {
      snapCamera(target);
      return;
    }
    const k = 1 - Math.exp(-dtMs / CAMERA_DEFAULTS.tauMs);
    camera.x += (target.x - camera.x) * k;
    camera.y += (target.y - camera.y) * k;
  }

  function toScreen(x, y) {
    const s = scale();
    return {
      x: (x - camera.x) * s + width / 2,
      y: (y - camera.y) * s + height * 0.62,
    };
  }

  function clear() {
    // A vertical wash rather than a flat fill: bleached concrete lit from above
    // (D2 forbids treatment-less backgrounds).
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#f3ecdd');
    sky.addColorStop(0.55, PALETTE.bg);
    sky.addColorStop(1, '#cfc3a9');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
  }

  /** Faint vertical bay markings that parallax with the camera. */
  function drawBayMarks() {
    const s = scale();
    const spacing = 500;
    ctx.save();
    ctx.strokeStyle = 'rgba(107, 97, 82, 0.16)';
    ctx.lineWidth = 2;
    const start = Math.floor((camera.x - worldWidth()) / spacing) * spacing;
    for (let x = start; x < camera.x + worldWidth(); x += spacing) {
      const sx = (x - camera.x) * s + width / 2;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The terrain: a filled mass under the surface line, with a painted lip. */
  function drawTrack(track) {
    const s = scale();
    const left = camera.x - worldWidth();
    const right = camera.x + worldWidth();
    const step = Math.max(4, worldWidth() / 240);

    ctx.beginPath();
    let first = true;
    for (let x = left; x <= right; x += step) {
      const p = toScreen(x, heightAt(track, x));
      if (first) {
        ctx.moveTo(p.x, p.y);
        first = false;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    const end = toScreen(right, heightAt(track, right));
    ctx.lineTo(end.x, height);
    ctx.lineTo(toScreen(left, 0).x, height);
    ctx.closePath();

    const dirt = ctx.createLinearGradient(0, 0, 0, height);
    dirt.addColorStop(0, '#8d7f66');
    dirt.addColorStop(1, '#5c5241');
    ctx.fillStyle = dirt;
    ctx.fill();

    // Safety-yellow surface stripe: reads as painted shop-floor edging.
    ctx.beginPath();
    first = true;
    for (let x = left; x <= right; x += step) {
      const p = toScreen(x, heightAt(track, x));
      if (first) {
        ctx.moveTo(p.x, p.y);
        first = false;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.strokeStyle = PALETTE.accentSupport;
    ctx.lineWidth = Math.max(2, 4 * s);
    ctx.stroke();

    drawFinishFlag(track);
  }

  function drawFinishFlag(track) {
    const x = finishX(track);
    const base = toScreen(x, heightAt(track, x));
    if (base.x < -80 || base.x > width + 80) return;
    const s = scale();
    const poleHeight = 150 * s;
    ctx.save();
    ctx.strokeStyle = PALETTE.surface2;
    ctx.lineWidth = Math.max(2, 5 * s);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(base.x, base.y - poleHeight);
    ctx.stroke();

    const size = Math.max(4, 12 * s);
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        ctx.fillStyle = (row + col) % 2 === 0 ? PALETTE.surface2 : PALETTE.textOnDark;
        ctx.fillRect(base.x + col * size, base.y - poleHeight + row * size, size, size);
      }
    }
    ctx.restore();
  }

  /**
   * Draw one car from its genome plus a pose.
   * @param {object} genome
   * @param {{chassis: {x,y,angle}, wheels: {x,y,angle}[]}} pose
   * @param {object} [style]
   */
  function drawCar(genome, pose, style = {}) {
    const s = scale();
    const outline = style.outline ?? chassisOutline(genome);
    const anchors = style.anchors ?? wheelAnchors(genome);
    const ghost = style.ghost === true;

    // Wheels first so the chassis plate reads as sitting over the axles.
    pose.wheels.forEach((wheel, i) => {
      const radius = (anchors[i]?.radius ?? wheel.radius ?? 12) * s;
      const p = toScreen(wheel.x, wheel.y);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(wheel.angle ?? 0);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = ghost ? 'rgba(43, 38, 32, 0.18)' : '#332d26';
      ctx.fill();
      if (!ghost) {
        ctx.strokeStyle = PALETTE.surface2;
        ctx.lineWidth = Math.max(1, 2 * s);
        ctx.stroke();
        // A spoke, so rotation is legible — a plain disc looks static.
        ctx.beginPath();
        ctx.moveTo(-radius * 0.75, 0);
        ctx.lineTo(radius * 0.75, 0);
        ctx.strokeStyle = anchors[i]?.torque > 0 ? PALETTE.accentSupport : PALETTE.muted;
        ctx.lineWidth = Math.max(1, 2.5 * s);
        ctx.stroke();
      }
      ctx.restore();
    });

    const c = toScreen(pose.chassis.x, pose.chassis.y);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(pose.chassis.angle);
    ctx.beginPath();
    outline.forEach((point, i) => {
      const px = point.x * s;
      const py = point.y * s;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();

    if (ghost) {
      ctx.fillStyle = 'rgba(107, 97, 82, 0.16)';
      ctx.fill();
    } else {
      const plate = ctx.createLinearGradient(0, -40 * s, 0, 40 * s);
      plate.addColorStop(0, style.highlight ?? '#e2673a');
      plate.addColorStop(1, style.fill ?? PALETTE.accent);
      ctx.fillStyle = plate;
      ctx.fill();
      ctx.strokeStyle = style.stroke ?? PALETTE.surface2;
      ctx.lineWidth = Math.max(1, 2.5 * s);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A "no run yet" state, so the viewport is never an empty rectangle. */
  function drawEmptyState(message) {
    ctx.save();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 16px "IBM Plex Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(message, width / 2, height / 2);
    ctx.restore();
  }

  return {
    resize,
    clear,
    drawBayMarks,
    drawTrack,
    drawCar,
    drawEmptyState,
    moveCamera,
    snapCamera,
    toScreen,
    get camera() {
      return camera;
    },
    get size() {
      return { width, height };
    },
  };
}

/** Where the camera should sit to frame a car. */
export function cameraTarget(pose, track) {
  const x = pose.chassis.x + 120;
  const groundY = heightAt(track, pose.chassis.x);
  return { x, y: Math.min(pose.chassis.y, groundY) - 60 };
}
