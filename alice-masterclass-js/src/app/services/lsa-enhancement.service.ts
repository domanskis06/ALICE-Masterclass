import { Injectable } from '@angular/core';
import {
  CentralityType,
  CollisionType,
  LargeScaleAnalysisResultsEntry,
  ParticleType,
} from '../shared/services/api.service';

/** One centrality bin of the strangeness-enhancement summary. */
export interface StrangenessEnhancementEntry {
  centrality: CentralityType;
  nParticipants: number;
  nEvents: number;

  nKaons: number;
  effKaons: number;
  yieldKaons: number;
  enhKaons: number;

  nLambdas: number;
  effLambdas: number;
  yieldLambdas: number;
  enhLambdas: number;

  nAntiLambdas: number;
  effAntiLambdas: number;
  yieldAntiLambdas: number;
  enhAntiLambdas: number;
}

/** One point of the enhancement-vs-participants plot. */
export interface StrangenessEnhancementPlotEntry {
  particle: ParticleType;
  nParticipants: number;
  enhancement: number;
  centrality: CentralityType;
}

/** Plot / table legend colours, matching the mass-histogram palette. */
export const ENHANCEMENT_KAON_COLOR = '#3F51B5';
export const ENHANCEMENT_LAMBDA_COLOR = '#7E57C2';
export const ENHANCEMENT_ANTILAMBDA_COLOR = '#EC407A';

/**
 * Reference pp yields (dN/dy) used as the enhancement denominator, per
 * participant pair. Same published values as the teacher application.
 */
const PP_YIELD_KAON = 0.25;
const PP_YIELD_LAMBDA = 0.0617;

/** Per-bin constants of the prepared Pb-Pb data sample (from the teacher app). */
interface CentralityBinSeed {
  centrality: CentralityType;
  nParticipants: number;
  nEvents: number;
  effKaons: number;
  effLambdas: number;
  effAntiLambdas: number;
}

const CENTRALITY_BINS: readonly CentralityBinSeed[] = [
  { centrality: CentralityType.C000_010, nParticipants: 360, nEvents: 213, effKaons: 0.26, effLambdas: 0.2,  effAntiLambdas: 0.2 },
  { centrality: CentralityType.C010_020, nParticipants: 260, nEvents: 290, effKaons: 0.26, effLambdas: 0.21, effAntiLambdas: 0.21 },
  { centrality: CentralityType.C020_030, nParticipants: 186, nEvents: 302, effKaons: 0.29, effLambdas: 0.22, effAntiLambdas: 0.22 },
  { centrality: CentralityType.C030_040, nParticipants: 129, nEvents: 310, effKaons: 0.29, effLambdas: 0.22, effAntiLambdas: 0.22 },
  { centrality: CentralityType.C040_050, nParticipants: 85,  nEvents: 302, effKaons: 0.29, effLambdas: 0.22, effAntiLambdas: 0.22 },
  { centrality: CentralityType.C050_060, nParticipants: 52,  nEvents: 300, effKaons: 0.29, effLambdas: 0.2,  effAntiLambdas: 0.2 },
  { centrality: CentralityType.C060_070, nParticipants: 30,  nEvents: 315, effKaons: 0.35, effLambdas: 0.2,  effAntiLambdas: 0.2 },
  { centrality: CentralityType.C070_080, nParticipants: 16,  nEvents: 350, effKaons: 0.26, effLambdas: 0.2,  effAntiLambdas: 0.2 },
];

/**
 * Turns accepted signal fits into per-centrality yields and strangeness
 * enhancement, the summary a teacher would normally show to the class.
 *
 * Pure computation: only Pb-Pb fits enter the table; the pp fit of the exercise
 * is the reference measurement and is represented by the constants above.
 * Bins without a fit stay at zero so the table never shows NaN.
 */
@Injectable({ providedIn: 'root' })
export class LsaEnhancementService {

  /** Participant numbers of the prepared sample, ordered from central to peripheral. */
  get centralityBins(): readonly CentralityBinSeed[] {
    return CENTRALITY_BINS;
  }

  buildRows(results: Map<string, LargeScaleAnalysisResultsEntry>): StrangenessEnhancementEntry[] {
    const signals = this.signalsByCentrality(results);

    return CENTRALITY_BINS.map((bin) => {
      const perParticle = signals.get(bin.centrality);
      const nKaons = perParticle?.get(ParticleType.KAON) ?? 0;
      const nLambdas = perParticle?.get(ParticleType.LAMBDA) ?? 0;
      const nAntiLambdas = perParticle?.get(ParticleType.ANTI_LAMBDA) ?? 0;

      const yieldKaons = this.particleYield(nKaons, bin.nEvents, bin.effKaons);
      const yieldLambdas = this.particleYield(nLambdas, bin.nEvents, bin.effLambdas);
      const yieldAntiLambdas = this.particleYield(nAntiLambdas, bin.nEvents, bin.effAntiLambdas);

      return {
        centrality: bin.centrality,
        nParticipants: bin.nParticipants,
        nEvents: bin.nEvents,

        nKaons,
        effKaons: bin.effKaons,
        yieldKaons,
        enhKaons: this.enhancement(yieldKaons, bin.nParticipants, PP_YIELD_KAON),

        nLambdas,
        effLambdas: bin.effLambdas,
        yieldLambdas,
        enhLambdas: this.enhancement(yieldLambdas, bin.nParticipants, PP_YIELD_LAMBDA),

        nAntiLambdas,
        effAntiLambdas: bin.effAntiLambdas,
        yieldAntiLambdas,
        enhAntiLambdas: this.enhancement(yieldAntiLambdas, bin.nParticipants, PP_YIELD_LAMBDA),
      };
    });
  }

  buildPlotData(rows: StrangenessEnhancementEntry[]): StrangenessEnhancementPlotEntry[] {
    const points: StrangenessEnhancementPlotEntry[] = [];

    for (const row of rows) {
      points.push({ particle: ParticleType.KAON, nParticipants: row.nParticipants, enhancement: row.enhKaons, centrality: row.centrality });
      points.push({ particle: ParticleType.LAMBDA, nParticipants: row.nParticipants, enhancement: row.enhLambdas, centrality: row.centrality });
      points.push({ particle: ParticleType.ANTI_LAMBDA, nParticipants: row.nParticipants, enhancement: row.enhAntiLambdas, centrality: row.centrality });
    }

    return points;
  }

  /** X range of the plot, with a small margin around the seeded participant numbers. */
  participantsDomain(): [number, number] {
    const values = CENTRALITY_BINS.map((bin) => bin.nParticipants);
    const max = Math.max(...values);
    return [0, max * 1.1];
  }

  private signalsByCentrality(
    results: Map<string, LargeScaleAnalysisResultsEntry>,
  ): Map<CentralityType, Map<ParticleType, number>> {
    const signals = new Map<CentralityType, Map<ParticleType, number>>();

    for (const entry of Array.from(results.values())) {
      if (entry.collision !== CollisionType.PBPB) {
        continue;
      }
      const perParticle = signals.get(entry.centrality) ?? new Map<ParticleType, number>();
      perParticle.set(entry.particle, entry.signal);
      signals.set(entry.centrality, perParticle);
    }

    return signals;
  }

  /** Corrected yield per event: raw signal divided by events and reconstruction efficiency. */
  private particleYield(signal: number, nEvents: number, efficiency: number): number {
    if (!(signal > 0) || nEvents <= 0 || efficiency <= 0) {
      return 0;
    }
    return signal / (nEvents * efficiency);
  }

  /** Yield per participant pair, normalised to the pp reference. */
  private enhancement(particleYield: number, nParticipants: number, ppYield: number): number {
    if (!(particleYield > 0) || nParticipants <= 0) {
      return 0;
    }
    return particleYield / nParticipants / (ppYield / 2);
  }
}
