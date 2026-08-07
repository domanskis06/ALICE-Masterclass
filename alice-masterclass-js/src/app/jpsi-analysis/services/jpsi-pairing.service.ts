import { Injectable } from '@angular/core';

import {
  CompactEvent,
  MASS_BINS,
  MASS_BIN_WIDTH,
  MASS_XMAX,
  MASS_XMIN,
  MassHistograms,
  MAX_PAIRS,
  M_ELECTRON,
  PidCut,
} from '../models/jpsi.models';

/** Momentum and energy of one selected track, under the electron mass hypothesis. */
interface SelectedTrack {
  px: number;
  py: number;
  pz: number;
  e: number;
}

/**
 * Builds the three invariant mass histograms from selected tracks.
 *
 * Pairs are formed inside a single event only. Opposite-charge pairs hold the J/psi
 * signal plus random combinations; same-charge pairs cannot come from a J/psi decay, so
 * they measure the combinatorial background under the very same selection.
 */
@Injectable()
export class JpsiPairingService {
  /**
   * Total number of candidate pairs across all three combinations. Linear in the number
   * of tracks, so it is safe to call before committing to the quadratic filling pass.
   */
  countPairs(events: CompactEvent[], cut: PidCut): number {
    let total = 0;

    for (const event of events) {
      let nPos = 0;
      let nNeg = 0;

      for (let i = 0; i < event.p.length; i++) {
        if (!this.passesCut(event, i, cut)) {
          continue;
        }
        if (event.sign[i] > 0) {
          nPos++;
        } else if (event.sign[i] < 0) {
          nNeg++;
        }
      }

      total += nPos * nNeg + (nPos * (nPos - 1)) / 2 + (nNeg * (nNeg - 1)) / 2;
    }

    return total;
  }

  /** True when the selection is so wide that building the histograms would hang the tab. */
  isSelectionTooWide(events: CompactEvent[], cut: PidCut): boolean {
    return this.countPairs(events, cut) > MAX_PAIRS;
  }

  /**
   * Adds the pairs of `events` to `target`. Additive on purpose: Quick Analysis appends
   * events, and only the new ones are paired.
   */
  fillMassHistograms(events: CompactEvent[], cut: PidCut, target: MassHistograms): void {
    for (const event of events) {
      const pos: SelectedTrack[] = [];
      const neg: SelectedTrack[] = [];

      for (let i = 0; i < event.p.length; i++) {
        if (!this.passesCut(event, i, cut)) {
          continue;
        }

        const track: SelectedTrack = {
          px: event.px[i],
          py: event.py[i],
          pz: event.pz[i],
          // Same hypothesis for signal and background: the background must be measured
          // exactly the way the signal is, or the subtraction is not comparable.
          e: Math.sqrt(event.p[i] * event.p[i] + M_ELECTRON * M_ELECTRON),
        };

        if (event.sign[i] > 0) {
          pos.push(track);
        } else if (event.sign[i] < 0) {
          neg.push(track);
        }
      }

      for (const a of pos) {
        for (const b of neg) {
          this.addPair(a, b, target.unlike);
        }
      }

      for (let i = 0; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          this.addPair(pos[i], pos[j], target.posPos);
        }
      }

      for (let i = 0; i < neg.length; i++) {
        for (let j = i + 1; j < neg.length; j++) {
          this.addPair(neg[i], neg[j], target.negNeg);
        }
      }
    }
  }

  private passesCut(event: CompactEvent, index: number, cut: PidCut): boolean {
    const p = event.p[index];
    const dedx = event.dedx[index];
    return p >= cut.pMin && p <= cut.pMax && dedx >= cut.dedxMin && dedx <= cut.dedxMax;
  }

  private addPair(a: SelectedTrack, b: SelectedTrack, histogram: Float64Array): void {
    const sumE = a.e + b.e;
    const sumPx = a.px + b.px;
    const sumPy = a.py + b.py;
    const sumPz = a.pz + b.pz;

    const massSquared = sumE * sumE - (sumPx * sumPx + sumPy * sumPy + sumPz * sumPz);
    if (!(massSquared > 0)) {
      return;
    }

    const mass = Math.sqrt(massSquared);
    if (mass < MASS_XMIN || mass >= MASS_XMAX) {
      return;
    }

    const bin = Math.floor((mass - MASS_XMIN) / MASS_BIN_WIDTH);
    if (bin >= 0 && bin < MASS_BINS) {
      histogram[bin]++;
    }
  }
}
