/**
 * Curate Particle Propagation demo events from gpu_propagator `data/events.json`.
 *
 * Source (ground-truth charge, no helix inference):
 *   https://github.com/pnwkw/gpu_propagator/blob/master/data/events.json
 *
 * Writes compact events under `src/assets/exercises/particle-propagation/`:
 *   event_0.json … event_9.json
 *
 *   - events 0–8: ~15–40 charged tracks (balanced +/−)
 *   - event 9: up to 500 charged tracks — densest real subsample (Pb–Pb demo)
 *
 * Filters drop neutrals, beam-like (|pz|/|p| too high), and extreme pT.
 * Output schema (RK4 input only):
 *
 *   { tracks: Array<{ charge, origin, X, Y, Z, px, py, pz, E, mass }> }
 *
 * Run from `alice-masterclass-js`:
 *   node scripts/curate-propagation-events.mjs
 *
 * Optional local cache (skips download if present):
 *   scripts/.cache/gpu_propagator_events.json
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'src/assets/exercises/particle-propagation');
const CACHE_PATH = resolve(ROOT, 'scripts/.cache/gpu_propagator_events.json');
const SOURCE_URL =
  'https://raw.githubusercontent.com/pnwkw/gpu_propagator/master/data/events.json';

const EVENT_COUNT = 10; // event_0 … event_9
/** Output index reserved for the dense Pb–Pb-style demo. */
const DENSE_OUT_INDEX = 9;

/** Standard events: keep this many after filters (prefer balanced +/−). */
const STANDARD_TARGET_MIN = 15;
const STANDARD_TARGET_MAX = 38;
/**
 * Dense Pb–Pb-style demo (event 9).
 * Source events top out around ~270 charged tracks; take as many as available
 * up to this cap (aligned with app {@code MAX_TRACKED_PARTICLES}).
 */
const DENSE_TARGET_MIN = 200;
const DENSE_TARGET_MAX = 500;

const STANDARD_FILTER = {
  ptMin: 0.12,
  ptMax: 3.0,
  maxAbsCosTheta: 0.985,
  maxE: 50,
};

/**
 * Dense demo: keep all charged tracks from the densest source (no pT / angle
 * cuts). Beam-like tracks still get RK4’d; the demo is meant to look dense.
 */
const DENSE_FILTER = {
  ptMin: 0.0,
  ptMax: 1e9,
  maxAbsCosTheta: 1.0,
  maxE: 1e9,
};

const DEFAULT_MASS = 0.13957;

function pMag(t) {
  return Math.hypot(t.px, t.py, t.pz);
}

function pT(t) {
  return Math.hypot(t.px, t.py);
}

function absCosTheta(t) {
  const p = pMag(t);
  return p > 0 ? Math.abs(t.pz) / p : 1;
}

function isUsableTrack(raw, filter) {
  if (raw.charge !== 1 && raw.charge !== -1) return false;
  const pt = pT(raw);
  if (!(pt >= filter.ptMin && pt <= filter.ptMax)) return false;
  if (!(pMag(raw) > 0)) return false;
  if (absCosTheta(raw) > filter.maxAbsCosTheta) return false;
  const E = Number(raw.E);
  if (Number.isFinite(E) && E > filter.maxE) return false;
  return true;
}

function toPropagationTrack(raw) {
  const mass = Number(raw.mass) > 0 ? raw.mass : DEFAULT_MASS;
  const px = raw.px;
  const py = raw.py;
  const pz = raw.pz;
  const E = Number(raw.E) > 0 ? raw.E : Math.hypot(mass, pMag(raw));
  return {
    charge: raw.charge,
    origin: 'primary',
    X: 0,
    Y: 0,
    Z: 0,
    px,
    py,
    pz,
    E,
    mass,
  };
}

/**
 * Pick up to `targetMax` tracks, aiming for charge balance and high pT first.
 * Returns null if fewer than `targetMin` usable tracks.
 */
function selectTracks(rawTracks, targetMin, targetMax, filter) {
  const usable = rawTracks.filter((t) => isUsableTrack(t, filter)).map(toPropagationTrack);
  if (usable.length < targetMin) return null;

  const plus = usable.filter((t) => t.charge > 0).sort((a, b) => pT(b) - pT(a));
  const minus = usable.filter((t) => t.charge < 0).sort((a, b) => pT(b) - pT(a));

  const half = Math.floor(targetMax / 2);
  const nPlus = Math.min(plus.length, half + (targetMax % 2));
  const nMinus = Math.min(minus.length, half);
  let picked = [...plus.slice(0, nPlus), ...minus.slice(0, nMinus)];

  if (picked.length < targetMax) {
    const need = targetMax - picked.length;
    if (nPlus < plus.length) {
      picked = [...picked, ...plus.slice(nPlus, nPlus + need)];
    } else if (nMinus < minus.length) {
      picked = [...picked, ...minus.slice(nMinus, nMinus + need)];
    }
  }

  picked.sort((a, b) => pT(b) - pT(a));
  if (picked.length < targetMin) return null;
  if (picked.length > targetMax) picked = picked.slice(0, targetMax);
  return picked;
}

function countUsable(rawTracks, filter) {
  return (rawTracks ?? []).filter((t) => isUsableTrack(t, filter)).length;
}

async function loadSourceEvents() {
  try {
    await access(CACHE_PATH);
    process.stdout.write(`Using cache ${CACHE_PATH}\n`);
    return JSON.parse(await readFile(CACHE_PATH, 'utf8'));
  } catch {
    // download
  }

  process.stdout.write(`Downloading ${SOURCE_URL} …\n`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Failed to download events.json: HTTP ${res.status}`);
  }
  const text = await res.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error('Expected events.json to be a JSON array of events');
  }

  await mkdir(dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, text);
  process.stdout.write(`Cached ${data.length} events → ${CACHE_PATH}\n`);
  return data;
}

function summarise(tracks) {
  const plus = tracks.filter((t) => t.charge > 0).length;
  const minus = tracks.length - plus;
  return `n=${tracks.length} +${plus}/-${minus}`;
}

async function writeEvent(outIdx, srcIdx, tracks, kind) {
  const path = resolve(OUT_DIR, `event_${outIdx}.json`);
  await writeFile(path, JSON.stringify({ tracks }));
  process.stdout.write(
    `event_${outIdx}.json ← source[${srcIdx}] (${kind}): ${summarise(tracks)}\n`
  );
}

async function main() {
  const source = await loadSourceEvents();
  process.stdout.write(`Scanning ${source.length} gpu_propagator events\n`);
  await mkdir(OUT_DIR, { recursive: true });

  const denseRanked = source
    .map((ev, idx) => ({ idx, n: countUsable(ev.tracks, DENSE_FILTER) }))
    .filter((e) => e.n >= DENSE_TARGET_MIN)
    .sort((a, b) => b.n - a.n);

  if (denseRanked.length === 0) {
    throw new Error(
      `No source event has ≥${DENSE_TARGET_MIN} usable tracks under dense filters.`
    );
  }

  const denseSrcIdx = denseRanked[0].idx;
  const denseTracks = selectTracks(
    source[denseSrcIdx].tracks ?? [],
    DENSE_TARGET_MIN,
    DENSE_TARGET_MAX,
    DENSE_FILTER
  );
  if (!denseTracks) {
    throw new Error(`Dense source[${denseSrcIdx}] failed track selection`);
  }

  const usedSource = new Set([denseSrcIdx]);
  let stdSrcIdx = 0;

  for (let outIdx = 0; outIdx < EVENT_COUNT; outIdx++) {
    if (outIdx === DENSE_OUT_INDEX) {
      await writeEvent(outIdx, denseSrcIdx, denseTracks, 'dense');
      continue;
    }

    let written = false;
    while (stdSrcIdx < source.length) {
      const candidate = stdSrcIdx++;
      if (usedSource.has(candidate)) continue;
      const tracks = selectTracks(
        source[candidate].tracks ?? [],
        STANDARD_TARGET_MIN,
        STANDARD_TARGET_MAX,
        STANDARD_FILTER
      );
      if (!tracks) continue;
      usedSource.add(candidate);
      await writeEvent(outIdx, candidate, tracks, 'standard');
      written = true;
      break;
    }
    if (!written) {
      throw new Error(`Could not find a standard source event for event_${outIdx}`);
    }
  }

  process.stdout.write(`Done: wrote ${EVENT_COUNT} events to ${OUT_DIR}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
});
