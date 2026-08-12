import { JpsiRaaService } from './jpsi-raa.service';
import { JpsiRawSignal } from './jpsi-raa.models';
import {
  BR_JPSI_EE,
  JPSI_REFERENCE_MASS_WINDOW,
  MAX_WINDOW_EFFICIENCY,
  MIN_WINDOW_EFFICIENCY,
  PBPB_ACC_EFF,
  PBPB_NCOLL,
  PP_ACC_EFF,
  PP_YIELD_5_02_TEV_REF,
} from './jpsi-raa.constants';

const REF_WINDOW: [number, number] = [...JPSI_REFERENCE_MASS_WINDOW];

describe('JpsiRaaService', () => {
  let service: JpsiRaaService;

  beforeEach(() => {
    service = new JpsiRaaService();
  });

  it('uses the published Acc x epsilon constants', () => {
    expect(service.efficiencyFor('pp')).toBe(PP_ACC_EFF);
    expect(service.efficiencyFor('pbPb_0_5')).toBe(PBPB_ACC_EFF.pbPb_0_5);
  });

  describe('windowEfficiencyFactor', () => {
    it('is 1 for the reference mass window', () => {
      expect(service.windowEfficiencyFactor(REF_WINDOW)).toBeCloseTo(1, 9);
    });

    it('is below 1 for a window narrower than the reference', () => {
      const narrow: [number, number] = [3.0, 3.1];
      expect(service.windowEfficiencyFactor(narrow)).toBeLessThan(1);
      expect(service.windowEfficiencyFactor(narrow)).toBeGreaterThan(0);
    });

    it('is above 1 for a window wider than the reference', () => {
      const wide: [number, number] = [2.88, 3.2];
      const factor = service.windowEfficiencyFactor(wide);
      expect(factor).toBeGreaterThan(1);
      expect(factor).toBeLessThan(MAX_WINDOW_EFFICIENCY);
    });

    it('clamps a pathologically narrow window to MIN_WINDOW_EFFICIENCY', () => {
      const pathological: [number, number] = [3.0969, 3.0969001];
      expect(service.windowEfficiencyFactor(pathological)).toBeCloseTo(MIN_WINDOW_EFFICIENCY, 9);
    });

    it('clamps a pathologically wide window to MAX_WINDOW_EFFICIENCY', () => {
      const pathological: [number, number] = [0, 10];
      expect(service.windowEfficiencyFactor(pathological)).toBeCloseTo(MAX_WINDOW_EFFICIENCY, 9);
    });
  });

  it('computes the corrected yield as signal / (efficiency * BR_ee * nEvents) for the reference window', () => {
    const signal: JpsiRawSignal = {
      system: 'pp', signal: 100, signalError: 10, nEvents: 1000, massWindow: REF_WINDOW,
    };
    expect(service.correctedYield(signal)).toBeCloseTo(100 / (PP_ACC_EFF * BR_JPSI_EE * 1000), 6);
  });

  it('scales the corrected yield by the mass-window efficiency factor for a non-reference window', () => {
    const narrowWindow: [number, number] = [3.0, 3.1];
    const signal: JpsiRawSignal = {
      system: 'pp', signal: 100, signalError: 10, nEvents: 1000, massWindow: narrowWindow,
    };
    const factor = service.windowEfficiencyFactor(narrowWindow);
    expect(service.correctedYield(signal)).toBeCloseTo(
      100 / (PP_ACC_EFF * factor * BR_JPSI_EE * 1000),
      9
    );
    // A narrower window means less effective efficiency, hence a larger corrected yield.
    expect(service.correctedYield(signal)).toBeGreaterThan(
      100 / (PP_ACC_EFF * BR_JPSI_EE * 1000)
    );
  });

  it('does not compute R_AA (or Ncoll/Npart) for pp and p-Pb rows', () => {
    const rows = service.computeResults([
      { system: 'pp', signal: 100, signalError: 10, nEvents: 1000, massWindow: REF_WINDOW },
      { system: 'pPb', signal: 50, signalError: 7, nEvents: 800, massWindow: REF_WINDOW },
    ]);

    for (const row of rows) {
      expect(row.raa).toBeNull();
      expect(row.nColl).toBeNull();
      expect(row.nParticipants).toBeNull();
    }
  });

  it('computes R_AA(centrality) = Yield_PbPb / (Ncoll * PP_YIELD_5_02_TEV_REF), a fixed reference', () => {
    const pbPb: JpsiRawSignal = {
      system: 'pbPb_0_5', signal: 34662, signalError: 186, nEvents: 40090000, massWindow: REF_WINDOW,
    };

    const [pbPbRow] = service.computeResults([pbPb]);

    const pbPbYield = service.correctedYield(pbPb);
    const expectedRaa = pbPbYield / (PBPB_NCOLL.pbPb_0_5 * PP_YIELD_5_02_TEV_REF);

    expect(pbPbRow.raa).not.toBeNull();
    expect(pbPbRow.raa as number).toBeCloseTo(expectedRaa, 9);
    expect(pbPbRow.nColl).toBe(PBPB_NCOLL.pbPb_0_5);
  });

  it('computes R_AA even when no pp signal is submitted at all', () => {
    const pbPb: JpsiRawSignal = {
      system: 'pbPb_0_5', signal: 34662, signalError: 186, nEvents: 40090000, massWindow: REF_WINDOW,
    };

    const [pbPbRow] = service.computeResults([pbPb]);
    expect(pbPbRow.raa).not.toBeNull();
  });

  it('gives the same Pb-Pb R_AA regardless of what pp signal is submitted alongside it', () => {
    const pbPb: JpsiRawSignal = {
      system: 'pbPb_0_5', signal: 34662, signalError: 186, nEvents: 40090000, massWindow: REF_WINDOW,
    };
    const ppLow: JpsiRawSignal = { system: 'pp', signal: 20, signalError: 4, nEvents: 1000, massWindow: REF_WINDOW };
    const ppHigh: JpsiRawSignal = { system: 'pp', signal: 500, signalError: 22, nEvents: 1000, massWindow: REF_WINDOW };

    const [, rowWithLowPp] = service.computeResults([ppLow, pbPb]);
    const [, rowWithHighPp] = service.computeResults([ppHigh, pbPb]);

    expect(rowWithLowPp.raa).toBeCloseTo(rowWithHighPp.raa as number, 9);
  });

  it('propagates only the Pb-Pb signal\'s relative Poisson error into raaError', () => {
    const pbPb: JpsiRawSignal = {
      system: 'pbPb_0_5', signal: 1000, signalError: 100, nEvents: 40090000, massWindow: REF_WINDOW,
    };

    const [pbPbRow] = service.computeResults([pbPb]);

    expect(pbPbRow.raaError).not.toBeNull();
    expect((pbPbRow.raaError as number) / (pbPbRow.raa as number)).toBeCloseTo(0.1, 9);
  });

  it('exposes the base efficiency and the applied window factor separately on each row', () => {
    const narrowWindow: [number, number] = [3.0, 3.1];
    const [row] = service.computeResults([
      { system: 'pbPb_0_5', signal: 34662, signalError: 186, nEvents: 40090000, massWindow: narrowWindow },
    ]);

    expect(row.efficiency).toBe(PBPB_ACC_EFF.pbPb_0_5);
    expect(row.windowFactor).toBeCloseTo(service.windowEfficiencyFactor(narrowWindow), 9);
  });

  it('produces one plot entry per Pb-Pb row and skips pp/p-Pb', () => {
    const rows = service.computeResults([
      { system: 'pp', signal: 100, signalError: 10, nEvents: 1000, massWindow: REF_WINDOW },
      { system: 'pPb', signal: 50, signalError: 7, nEvents: 800, massWindow: REF_WINDOW },
      { system: 'pbPb_0_5', signal: 34662, signalError: 186, nEvents: 40090000, massWindow: REF_WINDOW },
    ]);

    const plotEntries = service.toPlotEntries(rows);
    expect(plotEntries.length).toBe(1);
    expect(plotEntries[0].centralityId).toBe('pbPb_0_5');
  });
});
