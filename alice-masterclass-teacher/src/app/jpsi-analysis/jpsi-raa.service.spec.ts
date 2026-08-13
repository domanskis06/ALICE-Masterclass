import { JpsiRaaService } from './jpsi-raa.service';
import { JpsiRawSignal } from './jpsi-raa.models';
import {
  BR_JPSI_EE,
  PBPB_ACC_EFF,
  PBPB_NCOLL,
  PP_ACC_EFF,
  PP_YIELD_5_02_TEV_REF,
} from './jpsi-raa.constants';

describe('JpsiRaaService', () => {
  let service: JpsiRaaService;

  beforeEach(() => {
    service = new JpsiRaaService();
  });

  it('uses the published Acc x epsilon constants', () => {
    expect(service.efficiencyFor('pp')).toBe(PP_ACC_EFF);
    expect(service.efficiencyFor('pbPb_0_5')).toBe(PBPB_ACC_EFF.pbPb_0_5);
  });

  it('computes the corrected yield as signal / (efficiency * BR_ee * nEvents)', () => {
    const signal: JpsiRawSignal = { system: 'pp', signal: 100, signalError: 10, nEvents: 1000 };
    expect(service.correctedYield(signal)).toBeCloseTo(100 / (PP_ACC_EFF * BR_JPSI_EE * 1000), 6);
  });

  it('does not compute R_AA (or Ncoll/Npart) for pp and p-Pb rows', () => {
    const rows = service.computeResults([
      { system: 'pp', signal: 100, signalError: 10, nEvents: 1000 },
      { system: 'pPb', signal: 50, signalError: 7, nEvents: 800 },
    ]);

    for (const row of rows) {
      expect(row.raa).toBeNull();
      expect(row.nColl).toBeNull();
      expect(row.nParticipants).toBeNull();
    }
  });

  it('computes R_AA(centrality) = Yield_PbPb / (Ncoll * PP_YIELD_5_02_TEV_REF), a fixed reference', () => {
    const pbPb: JpsiRawSignal = { system: 'pbPb_0_5', signal: 34662, signalError: 186, nEvents: 40090000 };

    const [pbPbRow] = service.computeResults([pbPb]);

    const pbPbYield = service.correctedYield(pbPb);
    const expectedRaa = pbPbYield / (PBPB_NCOLL.pbPb_0_5 * PP_YIELD_5_02_TEV_REF);

    expect(pbPbRow.raa).not.toBeNull();
    expect(pbPbRow.raa as number).toBeCloseTo(expectedRaa, 9);
    expect(pbPbRow.nColl).toBe(PBPB_NCOLL.pbPb_0_5);
  });

  it('computes R_AA even when no pp signal is submitted at all', () => {
    const pbPb: JpsiRawSignal = { system: 'pbPb_0_5', signal: 34662, signalError: 186, nEvents: 40090000 };

    const [pbPbRow] = service.computeResults([pbPb]);
    expect(pbPbRow.raa).not.toBeNull();
  });

  it('gives the same Pb-Pb R_AA regardless of what pp signal is submitted alongside it', () => {
    const pbPb: JpsiRawSignal = { system: 'pbPb_0_5', signal: 34662, signalError: 186, nEvents: 40090000 };
    const ppLow: JpsiRawSignal = { system: 'pp', signal: 20, signalError: 4, nEvents: 1000 };
    const ppHigh: JpsiRawSignal = { system: 'pp', signal: 500, signalError: 22, nEvents: 1000 };

    const [, rowWithLowPp] = service.computeResults([ppLow, pbPb]);
    const [, rowWithHighPp] = service.computeResults([ppHigh, pbPb]);

    expect(rowWithLowPp.raa).toBeCloseTo(rowWithHighPp.raa as number, 9);
  });

  it('propagates only the Pb-Pb signal\'s relative Poisson error into raaError', () => {
    const pbPb: JpsiRawSignal = { system: 'pbPb_0_5', signal: 1000, signalError: 100, nEvents: 40090000 };

    const [pbPbRow] = service.computeResults([pbPb]);

    expect(pbPbRow.raaError).not.toBeNull();
    expect((pbPbRow.raaError as number) / (pbPbRow.raa as number)).toBeCloseTo(0.1, 9);
  });

  it('exposes the efficiency used on each row', () => {
    const [row] = service.computeResults([
      { system: 'pbPb_0_5', signal: 34662, signalError: 186, nEvents: 40090000 },
    ]);

    expect(row.efficiency).toBe(PBPB_ACC_EFF.pbPb_0_5);
  });

  it('produces one plot entry per Pb-Pb row and skips pp/p-Pb', () => {
    const rows = service.computeResults([
      { system: 'pp', signal: 100, signalError: 10, nEvents: 1000 },
      { system: 'pPb', signal: 50, signalError: 7, nEvents: 800 },
      { system: 'pbPb_0_5', signal: 34662, signalError: 186, nEvents: 40090000 },
    ]);

    const plotEntries = service.toPlotEntries(rows);
    expect(plotEntries.length).toBe(1);
    expect(plotEntries[0].centralityId).toBe('pbPb_0_5');
  });
});
