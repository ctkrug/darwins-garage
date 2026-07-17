// Pure particle model for the best-ever celebration burst. Decorative UI only
// — unlike rng.js, Math.random() here is fine, because confetti never touches
// the evolution/physics/replay path that determinism depends on.

const GRAVITY = 980; // px/s^2 — a visual fall rate, not a physics constant.
const COLORS = Object.freeze(['#d5541a', '#e8b400', '#f2ead8', '#4f7942']);

/**
 * Spawn a burst of confetti particles from a point.
 * @param {number} x
 * @param {number} y
 * @param {object} [options]
 * @param {number} [options.count]
 * @param {() => number} [options.random] - injectable for deterministic tests.
 * @returns {object[]}
 */
export function spawnConfetti(x, y, options = {}) {
  const count = Math.max(0, Math.floor(options.count ?? 28));
  const random = options.random ?? Math.random;
  const particles = [];
  for (let i = 0; i < count; i += 1) {
    // Spread roughly upward in a wide cone, not a full sphere: it should read
    // as a burst thrown from the HUD, not an explosion.
    const angle = -Math.PI / 2 + (random() - 0.5) * Math.PI * 0.9;
    const speed = 220 + random() * 260;
    const maxLife = 900 + random() * 500;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: random() * Math.PI * 2,
      spin: (random() - 0.5) * 12,
      size: 4 + random() * 5,
      color: COLORS[Math.floor(random() * COLORS.length)],
      life: maxLife,
      maxLife,
    });
  }
  return particles;
}

/**
 * Advance particles by dtMs and drop any whose life has expired.
 * @param {object[]} particles
 * @param {number} dtMs
 * @returns {object[]}
 */
export function stepConfetti(particles, dtMs) {
  const dt = dtMs / 1000;
  const next = [];
  for (const p of particles) {
    const life = p.life - dtMs;
    if (life <= 0) continue;
    next.push({
      ...p,
      x: p.x + p.vx * dt,
      y: p.y + p.vy * dt,
      vy: p.vy + GRAVITY * dt,
      rotation: p.rotation + p.spin * dt,
      life,
    });
  }
  return next;
}

export { COLORS };
