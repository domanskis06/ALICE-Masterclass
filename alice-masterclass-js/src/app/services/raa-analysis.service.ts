import { Injectable } from '@angular/core';
import { forkJoin, map, Observable } from 'rxjs';

import {
  RaaAnalysisResult,
  RaaPipelineStep,
  RaaPipelineStepKind,
  RaaPlotSeries,
} from '../shared/models/raa/raa';
import { RaaDataService } from './raa-data.service';

/** Preferred pedagogical chain for a complete R_AA measurement. */
export const RAA_CANONICAL_CHAIN: RaaPipelineStepKind[] = [
  'load_pbpb',
  'filter_centrality',
  'histogram_pt',
  'norm_events',
  'norm_ncoll',
  'divide_pp',
  'compute_raa',
  'plot',
];

@Injectable({
  providedIn: 'root',
})
export class RaaAnalysisService {
  constructor(private readonly data: RaaDataService) {}

  validate(pipeline: RaaPipelineStep[]): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const kinds = pipeline.map((s) => s.kind);

    if (kinds.length === 0) {
      return { valid: false, warnings: ['Pipeline is empty. Add blocks and connect them.'] };
    }
    if (!kinds.includes('load_pbpb')) {
      warnings.push('Missing “Load Pb–Pb data”.');
    }
    if (!kinds.includes('filter_centrality')) {
      warnings.push('Missing “Filter centrality”.');
    }
    if (!kinds.includes('histogram_pt')) {
      warnings.push('Missing “Histogram pT”.');
    }
    if (!kinds.includes('norm_events')) {
      warnings.push('Missing “Normalize by N_evt” — yields will be wrong.');
    }
    if (!kinds.includes('norm_ncoll')) {
      warnings.push('Missing “Divide by ⟨N_coll⟩” — R_AA scale will be wrong.');
    }
    if (!kinds.includes('divide_pp')) {
      warnings.push('Missing “Divide by pp reference”.');
    }
    if (!kinds.includes('compute_raa') && !kinds.includes('compute_rcp')) {
      warnings.push('Missing “Compute R_AA” or “Compute R_CP”.');
    }
    if (!kinds.includes('plot')) {
      warnings.push('Missing “Plot” block.');
    }

    // Order checks for the main R_AA path
    const idx = (k: RaaPipelineStepKind) => kinds.indexOf(k);
    const orderPairs: [RaaPipelineStepKind, RaaPipelineStepKind][] = [
      ['load_pbpb', 'filter_centrality'],
      ['filter_centrality', 'histogram_pt'],
      ['histogram_pt', 'norm_events'],
      ['norm_events', 'norm_ncoll'],
      ['norm_ncoll', 'divide_pp'],
      ['divide_pp', 'compute_raa'],
    ];
    for (const [a, b] of orderPairs) {
      if (idx(a) >= 0 && idx(b) >= 0 && idx(a) > idx(b)) {
        warnings.push(`“${b}” should come after “${a}”.`);
      }
    }

    const valid =
      kinds.includes('load_pbpb') &&
      kinds.includes('filter_centrality') &&
      kinds.includes('histogram_pt') &&
      kinds.includes('norm_events') &&
      kinds.includes('norm_ncoll') &&
      kinds.includes('divide_pp') &&
      (kinds.includes('compute_raa') || kinds.includes('compute_rcp')) &&
      kinds.includes('plot') &&
      warnings.every((w) => !w.includes('should come after'));

    return { valid, warnings };
  }

  run(pipeline: RaaPipelineStep[]): Observable<RaaAnalysisResult> {
    const { valid, warnings } = this.validate(pipeline);
    const centrality =
      pipeline.find((s) => s.kind === 'filter_centrality')?.centrality ?? '0-5';
    const wantRaa = pipeline.some((s) => s.kind === 'compute_raa');
    const wantRcp = pipeline.some((s) => s.kind === 'compute_rcp');
    const hasNormEvents = pipeline.some((s) => s.kind === 'norm_events');
    const hasNormNcoll = pipeline.some((s) => s.kind === 'norm_ncoll');
    const hasDividePp = pipeline.some((s) => s.kind === 'divide_pp');

    return forkJoin({
      meta: this.data.getMetadata(),
      spectra: this.data.getPtSpectra(),
      pp: this.data.getPpReference(),
    }).pipe(
      map(({ meta, spectra, pp }) => {
        const bins = spectra.bins;
        const centers = binCenters(bins);
        const peripheralKey = '70-80';

        const buildYield = (key: string): number[] => {
          const entry = spectra.spectra[key];
          if (!entry) {
            return centers.map(() => 0);
          }
          let y = [...entry.counts];
          if (hasNormEvents) {
            y = y.map((v) => v / Math.max(entry.nEvents, 1));
          }
          if (hasNormNcoll) {
            const nc = meta.nColl[key] ?? 1;
            y = y.map((v) => v / nc);
          }
          return y;
        };

        const yCent = buildYield(centrality);
        const yPeriph = buildYield(peripheralKey);
        const ppVals = [...pp.values];

        const ptSpectra: RaaPlotSeries[] = [
          {
            id: `pt_${centrality}`,
            label: `Pb–Pb ${centrality}%`,
            x: centers,
            y: yCent,
            yErr: yCent.map((v) => Math.sqrt(Math.max(v, 0)) * 0.05 + 1e-9),
          },
          {
            id: 'pt_pp',
            label: 'pp reference',
            x: centers,
            y: ppVals,
            yErr: ppVals.map((v) => v * 0.1),
          },
        ];

        let raa: RaaPlotSeries[] = [];
        if (wantRaa) {
          const raaY = yCent.map((v, i) => {
            const denom = hasDividePp ? Math.max(ppVals[i], 1e-12) : 1;
            // Without divide_pp / ncoll the curve stays unphysically large — pedagogical.
            return v / denom;
          });
          raa = [
            {
              id: `raa_${centrality}`,
              label: `R_AA ${centrality}%`,
              x: centers,
              y: raaY,
              yErr: raaY.map((v) => Math.abs(v) * 0.12 + 0.01),
            },
          ];
        }

        let rcp: RaaPlotSeries[] = [];
        if (wantRcp) {
          const rcpY = yCent.map((v, i) => v / Math.max(yPeriph[i], 1e-12));
          rcp = [
            {
              id: `rcp_${centrality}`,
              label: `R_CP ${centrality}% / ${peripheralKey}%`,
              x: centers,
              y: rcpY,
              yErr: rcpY.map((v) => Math.abs(v) * 0.15 + 0.01),
            },
          ];
        }

        const extract: Record<string, { value: number; error: number }> = {};
        const seriesForExtract = raa[0] ?? rcp[0];
        if (seriesForExtract) {
          seriesForExtract.y.forEach((value, i) => {
            extract[`${centrality}|${i}`] = {
              value,
              error: seriesForExtract.yErr?.[i] ?? 0,
            };
          });
        }

        return {
          warnings,
          valid,
          ptSpectra,
          raa,
          rcp,
          extract,
        } satisfies RaaAnalysisResult;
      }),
    );
  }
}

function binCenters(bins: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < bins.length - 1; i++) {
    out.push((bins[i] + bins[i + 1]) / 2);
  }
  return out;
}
