/**
 * Pedagogical time-of-flight exaggeration for track reveal animation.
 *
 * Geometry and physical `BufferedTrack.times` stay untouched. Presentation
 * times (`timesVis`) stretch soft (low-|p|) tracks so they draw slower and
 * finish later under a shared lab clock — option B from the MasterClass design:
 *
 *   u(|p|) = clamp( (ln|p| − ln p_lo) / (ln p_hi − ln p_lo), 0, 1 )
 *   β_eff  = lerp(β_min, 1, u(|p|))
 *   t_vis  = t_phys · (β_phys / β_eff)     (with optional strength blend)
 *
 * Anchors `p_lo` / `p_hi` match ~p10 / ~p90 of curated event |p| (~0.3 / ~4 GeV/c).
 */

import { BufferedTrack, PropagationParticle } from './propagation-types';

/** Soft-momentum anchor for u(|p|), GeV/c (~10th percentile of curated events). */
export const REVEAL_P_LO_GEV = 0.3;

/** Hard-momentum anchor for u(|p|), GeV/c (~90th percentile of curated events). */
export const REVEAL_P_HI_GEV = 4.0;

/**
 * Effective β assigned to the softest tracks (u=0). Hard tracks (u=1) keep β_eff=1.
 * Ratio ~2.5× vs light-like gives a clear but not cartoonish pace difference.
 */
export const REVEAL_BETA_EFF_MIN = 0.4;

/** Default exaggeration mix: 0 = pure physical TOF, 1 = full β_eff map. */
export const REVEAL_STRENGTH_DEFAULT = 1;

export interface MomentumRevealOptions {
  pLoGev?: number;
  pHiGev?: number;
  betaEffMin?: number;
  /** Blend in [0, 1] between physical β and the |p|-mapped β_eff. */
  strength?: number;
}

const LN_P_LO = Math.log(REVEAL_P_LO_GEV);
const LN_P_HI = Math.log(REVEAL_P_HI_GEV);

function clamp01(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** |p| in GeV/c from a momentum vector. */
export function momentumMagnitude(px: number, py: number, pz: number): number {
  return Math.hypot(px, py, pz);
}

/**
 * Log-momentum weight in [0, 1]: soft → 0, hard → 1.
 * Flat outside [p_lo, p_hi] so extreme outliers do not dominate pacing.
 */
export function momentumWeightU(
  pMagGev: number,
  pLoGev = REVEAL_P_LO_GEV,
  pHiGev = REVEAL_P_HI_GEV
): number {
  if (!(pMagGev > 0) || !(pLoGev > 0) || !(pHiGev > pLoGev)) {
    return 0;
  }
  const lo = pLoGev === REVEAL_P_LO_GEV && pHiGev === REVEAL_P_HI_GEV ? LN_P_LO : Math.log(pLoGev);
  const hi = pLoGev === REVEAL_P_LO_GEV && pHiGev === REVEAL_P_HI_GEV ? LN_P_HI : Math.log(pHiGev);
  return clamp01((Math.log(pMagGev) - lo) / (hi - lo));
}

/** Mapped β_eff before strength blend: soft → betaEffMin, hard → 1. */
export function betaEffFromMomentum(
  pMagGev: number,
  options: MomentumRevealOptions = {}
): number {
  const betaMin = options.betaEffMin ?? REVEAL_BETA_EFF_MIN;
  const u = momentumWeightU(pMagGev, options.pLoGev, options.pHiGev);
  return lerp(betaMin, 1, u);
}

/** Physical β = |p|/E, clamped to (0, 1]. */
export function physicalBeta(pMagGev: number, energyGev: number): number {
  if (!(pMagGev > 0) || !(energyGev > 0)) return 0;
  return Math.min(pMagGev / energyGev, 1);
}

/**
 * β used for presentation timing after blending physical β with the |p| map.
 * strength=0 → physical; strength=1 → full pedagogical map.
 */
export function effectiveRevealBeta(
  pMagGev: number,
  energyGev: number,
  options: MomentumRevealOptions = {}
): number {
  const betaPhys = physicalBeta(pMagGev, energyGev);
  if (!(betaPhys > 0)) return 0;
  const strength = clamp01(options.strength ?? REVEAL_STRENGTH_DEFAULT);
  const betaMapped = betaEffFromMomentum(pMagGev, options);
  const beta = lerp(betaPhys, betaMapped, strength);
  // Never faster than light; never zero (would make times infinite).
  return Math.min(Math.max(beta, 1e-6), 1);
}

/**
 * Builds `timesVis` on each track: t_vis = t_phys · (β_phys / β_eff).
 * Soft tracks get β_eff < β_phys → longer visual TOF → slower draw / later finish.
 * Returns the scrubber upper bound (max of timesVis, falling back to physical times).
 */
export function attachMomentumRevealTimes(
  tracks: BufferedTrack[],
  particles: PropagationParticle[],
  options: MomentumRevealOptions = {}
): number {
  const byId = new Map(particles.map((p) => [p.id, p]));
  let maxTimeNs = 0;

  for (const track of tracks) {
    const particle = byId.get(track.particleId);
    const n = track.pointCount;

    if (!particle || n === 0) {
      track.timesVis = undefined;
      if (n > 0) {
        maxTimeNs = Math.max(maxTimeNs, track.times[n - 1]);
      }
      continue;
    }

    const pMag = momentumMagnitude(particle.momentum.x, particle.momentum.y, particle.momentum.z);
    const betaPhys = physicalBeta(pMag, particle.energy);
    const betaEff = effectiveRevealBeta(pMag, particle.energy, options);

    if (!(betaPhys > 0) || !(betaEff > 0)) {
      track.timesVis = undefined;
      maxTimeNs = Math.max(maxTimeNs, track.times[n - 1]);
      continue;
    }

    const scale = betaPhys / betaEff;
    if (Math.abs(scale - 1) < 1e-12) {
      track.timesVis = undefined;
      maxTimeNs = Math.max(maxTimeNs, track.times[n - 1]);
      continue;
    }

    const timesVis = new Float32Array(track.times.length);
    for (let i = 0; i < n; i++) {
      timesVis[i] = track.times[i] * scale;
    }
    track.timesVis = timesVis;
    maxTimeNs = Math.max(maxTimeNs, timesVis[n - 1]);
  }

  return maxTimeNs;
}

/** Time buffer used for draw-range reveal (presentation if present, else physics). */
export function revealTimes(track: BufferedTrack): Float32Array {
  return track.timesVis ?? track.times;
}
