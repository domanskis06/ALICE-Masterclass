import { JpsiRaaService } from './jpsi-raa.service';
import { JpsiRawSignal } from './jpsi-raa.models';
import {
  PBPB_ACC_EFF,
  PBPB_NCOLL,
  PP_ACC_EFF,
  PP_ENERGY_SCALE_7_TO_5_02,
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

  it('computes the Acc x epsilon-corrected yield as signal / (efficiency * nEvents)', () => {
    const signal: JpsiRawSignal = { system: 'pp', signal: 100, signalError: 10, nEvents: 1000 };
    expect(service.correctedYield(signal)).toBeCloseTo(100 / (PP_ACC_EFF * 1000), 6);
  });

  it('rescales the student pp yield from 7 TeV to 5.02 TeV for the R_AA reference', () => {
    const pp: JpsiRawSignal = { system: 'pp', signal: 100, signalError: 10, nEvents: 1000 };
    expect(service.ppReferenceYieldForRaa(pp)).toBeCloseTo(
      service.correctedYield(pp) * PP_ENERGY_SCALE_7_TO_5_02,
      9
    );
    expect(PP_ENERGY_SCALE_7_TO_5_02).toBeCloseTo(0.819, 3);
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

  it('computes R_AA(centrality) = Yield_PbPb / (Ncoll * Yield_pp_ref)', () => {
    const pp: JpsiRawSignal = { system: 'pp', signal: 100, signalError: 10, nEvents: 1000 };
    const pbPb: JpsiRawSignal = { system: 'pbPb_0_5', signal: 34662, signalError: 186, nEvents: 40090000 };

    const [ppRow, pbPbRow] = service.computeResults([pp, pbPb]);

    const ppYieldForRaa = service.ppReferenceYieldForRaa(pp);
    const pbPbYield = service.correctedYield(pbPb);
    const expectedRaa = pbPbYield / (PBPB_NCOLL.pbPb_0_5 * ppYieldForRaa);

    expect(ppRow.raa).toBeNull();
    expect(ppRow.correctedYield).toBeCloseTo(service.correctedYield(pp), 9);
    expect(pbPbRow.raa).not.toBeNull();
    expect(pbPbRow.raa as number).toBeCloseTo(expectedRaa, 9);
    expect(pbPbRow.nColl).toBe(PBPB_NCOLL.pbPb_0_5);
  });

  it('propagates the relative Poisson errors of the Pb-Pb and pp signals in quadrature', () => {
    const pp: JpsiRawSignal = { system: 'pp', signal: 100, signalError: 10, nEvents: 1000 };
    const pbPb: JpsiRawSignal = { system: 'pbPb_0_5', signal: 1000, signalError: 100, nEvents: 40090000 };

    const [, pbPbRow] = service.computeResults([pp, pbPb]);

    const expectedRelError = Math.sqrt(0.1 * 0.1 + 0.1 * 0.1);
    expect(pbPbRow.raaError).not.toBeNull();
    expect((pbPbRow.raaError as number) / (pbPbRow.raa as number)).toBeCloseTo(expectedRelError, 9);
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
