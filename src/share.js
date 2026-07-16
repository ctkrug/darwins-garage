// Share links. A genome plus its generation and track fully determines a run —
// physics is deterministic given a fixed timestep — so that triple is the whole
// shareable unit and needs no server or database row.
//
// Encoding is compact by design: a URL that wraps across three lines in a chat
// window does not get clicked. Coordinates are rounded to whole pixels (well
// under what is visible) and packed positionally rather than as JSON keys.

import { normalizeGenome, isValidGenome } from './genome.js';
import { DEFAULT_TRACK_ID } from './track.js';

export const SHARE_PARAM = 'car';
const FORMAT_VERSION = 1;

/**
 * Encode a run into a compact URL-safe string.
 * @param {{genome: object, generation?: number, trackId?: string}} run
 * @returns {string}
 */
export function encodeShare({ genome, generation = 0, trackId = DEFAULT_TRACK_ID }) {
  const safe = normalizeGenome(genome);
  if (!Number.isInteger(generation) || generation < 0) {
    throw new RangeError(`encodeShare: generation must be a non-negative integer, got ${generation}`);
  }
  const payload = [
    FORMAT_VERSION,
    generation,
    trackId,
    safe.chassis.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(';'),
    // Torque keeps three decimals: its whole gene range is 0-0.12, so rounding
    // any harder would quantize the drive away.
    safe.wheels.map((w) => `${w.vertexIndex},${Math.round(w.radius)},${w.torque.toFixed(3)}`).join(';'),
  ].join('|');
  return toBase64Url(payload);
}

/**
 * Decode a share string.
 * @param {string} encoded
 * @returns {{ok: true, value: object} | {ok: false, error: string}}
 *   Never throws: a bad link is a designed error state in the UI, not a crash.
 */
export function decodeShare(encoded) {
  if (typeof encoded !== 'string' || encoded.length === 0) {
    return fail('This share link is empty.');
  }
  let payload;
  try {
    payload = fromBase64Url(encoded);
  } catch {
    return fail("This share link isn't readable — it may have been cut short when copied.");
  }

  const parts = payload.split('|');
  if (parts.length !== 5) {
    return fail("This share link isn't readable — it may have been cut short when copied.");
  }
  const [rawVersion, rawGeneration, trackId, rawChassis, rawWheels] = parts;

  if (Number(rawVersion) !== FORMAT_VERSION) {
    return fail(`This link uses share format ${rawVersion}, which this version can't open.`);
  }
  const generation = Number(rawGeneration);
  if (!Number.isInteger(generation) || generation < 0) {
    return fail('This share link points at an impossible generation.');
  }
  if (!trackId) return fail('This share link is missing its track.');

  const chassis = rawChassis.split(';').map((pair) => {
    const [x, y] = pair.split(',').map(Number);
    return { x, y };
  });
  const wheels = rawWheels.split(';').map((triple) => {
    const [vertexIndex, radius, torque] = triple.split(',').map(Number);
    return { vertexIndex, radius, torque };
  });

  if (!isValidGenome({ chassis, wheels })) {
    return fail("This share link describes a car that couldn't be built.");
  }
  return { ok: true, value: { genome: normalizeGenome({ chassis, wheels }), generation, trackId } };
}

/** Build a full shareable URL against the page's own location. */
export function shareUrl(run, base) {
  const url = new URL(base);
  url.searchParams.set(SHARE_PARAM, encodeShare(run));
  return url.toString();
}

/**
 * Read a share out of a URL. Returns null when there is no share param at all,
 * which is the ordinary case and not an error.
 */
export function readShare(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const encoded = url.searchParams.get(SHARE_PARAM);
  if (encoded === null) return null;
  return decodeShare(encoded);
}

function fail(error) {
  return { ok: false, error };
}

// btoa/atob only exist in the browser and only speak latin1; Buffer only exists
// in Node. Supporting both keeps the encoder unit-testable outside a browser.
function toBase64Url(text) {
  const base64 =
    typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(text)))
      : Buffer.from(text, 'utf8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded) {
  if (!/^[A-Za-z0-9\-_]+$/.test(encoded)) throw new Error('not base64url');
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const text =
    typeof atob === 'function'
      ? decodeURIComponent(escape(atob(base64)))
      : Buffer.from(base64, 'base64').toString('utf8');
  if (!text) throw new Error('empty payload');
  return text;
}
