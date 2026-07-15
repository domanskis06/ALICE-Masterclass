/**
 * One-shot curation of Particle Propagation demo events.
 *
 * Downloads the raw `events.json` from https://github.com/pnwkw/gpu_propagator
 * (GPL-3.0) and distils it into 10 small, visually pedagogical events for the
 * Particle Propagation module: each event keeps 15-40 *charged* tracks, biased
 * towards low transverse momentum (which bend the most in the solenoid field)
 * plus a handful of very high-|p| tracks (which stay almost straight) so the
 * exercise visibly contrasts "curved vs. straight because of momentum".
 *
 * Unlike the strangeness dataset, gpu_propagator tracks carry a real `charge`
 * (+-1) while `sign` is always 0 — so we map from `charge`. Output schema is
 * intentionally minimal (only what the RK4 pre-computation needs):
 *
 *   { tracks: Array<{ charge, X, Y, Z, px, py, pz, E, mass }> }
 *
 * Run once from the `alice-masterclass-js` folder:
 *   node scripts/curate-propagation-events.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://raw.githubusercontent.com/pnwkw/gpu_propagator/master/data/events.json';

const OUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/assets/exercises/particle-propagation'
);

const EVENT_COUNT = 10;
const MIN_CHARGED = 15;
const TARGET_TOTAL = 28; // aim: ~24 low-pT + 4 high-|p|
const HIGH_P_COUNT = 4;

function pt(t) {
  return Math.hypot(t.px, t.py);
}

function pMag(t) {
  return Math.hypot(t.px, t.py, t.pz);
}

/**
 * Curates a single raw event's tracks: mostly the lowest-pT charged tracks
 * (strongest curvature) plus a few of the highest-|p| ones (near-straight),
 * capped at TARGET_TOTAL. Returns null if the event has too few charged tracks.
 */
function curateEvent(rawTracks) {
  const charged = rawTracks.filter((t) => t.charge === 1 || t.charge === -1);
  if (charged.length < MIN_CHARGED) return null;

  const byPtAsc = [...charged].sort((a, b) => pt(a) - pt(b));
  const byPDesc = [...charged].sort((a, b) => pMag(b) - pMag(a));

  const chosen = new Map(); // dedupe by identity
  const keyOf = (t) => `${t.px},${t.py},${t.pz},${t.E}`;

  // A few near-straight, very high-|p| tracks first.
  for (const t of byPDesc.slice(0, HIGH_P_COUNT)) chosen.set(keyOf(t), t);

  // Fill the rest with the most-curved (lowest-pT) tracks.
  for (const t of byPtAsc) {
    if (chosen.size >= TARGET_TOTAL) break;
    chosen.set(keyOf(t), t);
  }

  const tracks = [...chosen.values()].map((t) => ({
    charge: t.charge,
    X: t.X,
    Y: t.Y,
    Z: t.Z,
    px: t.px,
    py: t.py,
    pz: t.pz,
    E: t.E,
    mass: t.mass,
  }));

  return tracks.length >= MIN_CHARGED ? { tracks } : null;
}

async function main() {
  process.stdout.write(`Downloading ${SOURCE_URL} ...\n`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching events.json`);
  const rawEvents = await res.json();
  process.stdout.write(`Fetched ${rawEvents.length} raw events.\n`);

  await mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  for (const rawEvent of rawEvents) {
    if (written >= EVENT_COUNT) break;
    const curated = curateEvent(rawEvent.tracks ?? []);
    if (!curated) continue;
    const path = resolve(OUT_DIR, `event_${written}.json`);
    await writeFile(path, JSON.stringify(curated));
    const plus = curated.tracks.filter((t) => t.charge > 0).length;
    const minus = curated.tracks.length - plus;
    process.stdout.write(
      `event_${written}.json: ${curated.tracks.length} tracks (+${plus} / -${minus})\n`
    );
    written += 1;
  }

  if (written < EVENT_COUNT) {
    throw new Error(`Only produced ${written}/${EVENT_COUNT} events with >= ${MIN_CHARGED} charged tracks.`);
  }
  process.stdout.write(`Done: wrote ${written} events to ${OUT_DIR}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
});
