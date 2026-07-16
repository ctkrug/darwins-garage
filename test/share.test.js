import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { createRandomGenome } from '../src/genome.js';
import { mutate, crossover } from '../src/evolution.js';
import { createDefaultTrack, DEFAULT_TRACK_ID } from '../src/track.js';
import { simulateGenome } from '../src/simulate.js';
import { encodeShare, decodeShare, shareUrl, readShare, SHARE_PARAM } from '../src/share.js';

const track = createDefaultTrack();
const genomeFor = (seed) => createRandomGenome(createRng(seed));

test('a share round-trips the genome, generation, and track', () => {
  const run = { genome: genomeFor(3), generation: 17, trackId: DEFAULT_TRACK_ID };
  const decoded = decodeShare(encodeShare(run));
  assert.equal(decoded.ok, true);
  assert.equal(decoded.value.generation, 17);
  assert.equal(decoded.value.trackId, DEFAULT_TRACK_ID);
  assert.equal(decoded.value.genome.chassis.length, run.genome.chassis.length);
  assert.equal(decoded.value.genome.wheels.length, run.genome.wheels.length);
});

test('a shared car replays to the same fitness as the original run', () => {
  // The whole promise of a share link: open it anywhere, see the same run.
  for (let seed = 0; seed < 10; seed += 1) {
    const genome = genomeFor(seed);
    const original = simulateGenome(genome, track);
    const decoded = decodeShare(encodeShare({ genome, generation: seed }));
    assert.equal(decoded.ok, true);
    const replayed = simulateGenome(decoded.value.genome, track);
    assert.equal(
      replayed.fitness,
      original.fitness,
      `seed ${seed} replayed to ${replayed.fitness}, expected ${original.fitness}`,
    );
    assert.equal(replayed.failReason, original.failReason);
    assert.equal(replayed.ticks, original.ticks);
  }
});

test('encoding is stable: the same run always yields the same link', () => {
  const run = { genome: genomeFor(5), generation: 2 };
  assert.equal(encodeShare(run), encodeShare(run));
});

test('a share link is URL-safe and short enough to paste', () => {
  const encoded = encodeShare({ genome: genomeFor(1), generation: 40 });
  assert.match(encoded, /^[A-Za-z0-9\-_]+$/);
  assert.ok(encoded.length < 220, `share payload was ${encoded.length} chars`);
});

test('encodeShare defaults to generation 0 on the built-in track', () => {
  const decoded = decodeShare(encodeShare({ genome: genomeFor(2) }));
  assert.equal(decoded.value.generation, 0);
  assert.equal(decoded.value.trackId, DEFAULT_TRACK_ID);
});

test('encodeShare rejects an impossible generation', () => {
  for (const bad of [-1, 1.5, NaN, 'x']) {
    assert.throws(() => encodeShare({ genome: genomeFor(1), generation: bad }), RangeError);
  }
});

test('encodeShare rejects an invalid genome rather than emitting a dead link', () => {
  assert.throws(() => encodeShare({ genome: { chassis: [], wheels: [] } }), Error);
});

test('decodeShare reports a readable error for corrupted input, never throwing', () => {
  const corrupted = [
    '',
    'not-base64!!',
    'YWJj', // valid base64, meaningless payload
    encodeShare({ genome: genomeFor(1) }).slice(0, 12), // truncated in a chat window
    'MnwwfGRlZmF1bHQtaGlsbHw', // wrong field count
  ];
  for (const input of corrupted) {
    const result = decodeShare(input);
    assert.equal(result.ok, false, `expected failure for ${JSON.stringify(input)}`);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0, 'an error state needs copy to show');
  }
});

test('decodeShare rejects non-string input without throwing', () => {
  for (const bad of [null, undefined, 42, {}, []]) {
    const result = decodeShare(bad);
    assert.equal(result.ok, false);
  }
});

test('decodeShare rejects a payload describing a structurally impossible car', () => {
  // A well-formed link whose genome has too few wheels to build.
  const payload = Buffer.from('1|0|default-hill|0,0;10,0;20,0;30,0;40,0|0,20,0.05', 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const result = decodeShare(payload);
  assert.equal(result.ok, false);
  assert.match(result.error, /couldn't be built/);
});

test('decodeShare refuses a future format version', () => {
  const payload = Buffer.from('99|0|default-hill|0,0|0,0', 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const result = decodeShare(payload);
  assert.equal(result.ok, false);
  assert.match(result.error, /format/);
});

test('shareUrl builds an absolute link carrying the run', () => {
  const url = shareUrl({ genome: genomeFor(4), generation: 9 }, 'https://apps.example.com/darwins-garage/');
  assert.ok(url.startsWith('https://apps.example.com/darwins-garage/'));
  const decoded = readShare(url);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.value.generation, 9);
});

test('shareUrl preserves an existing subpath and query', () => {
  const url = shareUrl({ genome: genomeFor(4) }, 'https://example.com/darwins-garage/?foo=bar');
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/darwins-garage/');
  assert.equal(parsed.searchParams.get('foo'), 'bar');
  assert.ok(parsed.searchParams.get(SHARE_PARAM));
});

test('readShare returns null when there is no share to read', () => {
  assert.equal(readShare('https://example.com/darwins-garage/'), null);
  assert.equal(readShare('not a url'), null);
});

test('readShare surfaces a decode failure rather than null', () => {
  const result = readShare(`https://example.com/?${SHARE_PARAM}=garbage!!`);
  assert.equal(result.ok, false);
});

test('encoding is lossless: the decoded genome is identical, not merely similar', () => {
  // Physics is chaotic, so a link that rounded coordinates on the way out would
  // replay a visibly different run than the one it scored. Genomes are kept on
  // the encoder's grid precisely so this is an equality, not an approximation.
  for (let seed = 0; seed < 25; seed += 1) {
    const genome = genomeFor(seed);
    const decoded = decodeShare(encodeShare({ genome, generation: 1 }));
    assert.equal(decoded.ok, true);
    assert.deepEqual(decoded.value.genome, genome, `seed ${seed} did not survive the round trip`);
  }
});

test('a bred genome also survives a round trip unchanged', () => {
  // Mutation and crossover must not knock a genome off the encodable grid.
  const rng = createRng(4);
  let genome = genomeFor(2);
  for (let i = 0; i < 30; i += 1) {
    genome = mutate(crossover(genome, genomeFor(i + 50), rng), rng, { mutationRate: 1 });
    const decoded = decodeShare(encodeShare({ genome }));
    assert.equal(decoded.ok, true);
    assert.deepEqual(decoded.value.genome, genome, `bred genome ${i} did not round-trip`);
  }
});
