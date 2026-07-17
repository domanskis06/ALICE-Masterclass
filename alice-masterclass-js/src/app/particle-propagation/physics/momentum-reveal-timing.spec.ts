import {
  REVEAL_BETA_EFF_MIN,
  REVEAL_P_HI_GEV,
  REVEAL_P_LO_GEV,
  attachMomentumRevealTimes,
  betaEffFromMomentum,
  effectiveRevealBeta,
  momentumWeightU,
  physicalBeta,
} from './momentum-reveal-timing';
import { BufferedTrack, PropagationParticle } from './propagation-types';

function makeParticle(id: string, pMag: number, mass = 0.13957): PropagationParticle {
  const energy = Math.hypot(pMag, mass);
  return {
    id,
    origin: 'primary',
    vertex: { x: 0, y: 0, z: 0 },
    momentum: { x: pMag, y: 0, z: 0 },
    charge: 1,
    mass,
    energy,
  };
}

function makeTrack(id: string, times: number[]): BufferedTrack {
  const pointCount = times.length;
  return {
    particleId: id,
    positions: new Float32Array(pointCount * 3),
    times: Float32Array.from(times),
    pointCount,
    charge: 1,
    origin: 'primary',
  };
}

describe('momentumWeightU', () => {
  it('is 0 at/below p_lo and 1 at/above p_hi', () => {
    expect(momentumWeightU(REVEAL_P_LO_GEV)).toBe(0);
    expect(momentumWeightU(REVEAL_P_LO_GEV * 0.5)).toBe(0);
    expect(momentumWeightU(REVEAL_P_HI_GEV)).toBe(1);
    expect(momentumWeightU(REVEAL_P_HI_GEV * 2)).toBe(1);
  });

  it('is 0.5 at the log midpoint between p_lo and p_hi', () => {
    const mid = Math.exp(0.5 * (Math.log(REVEAL_P_LO_GEV) + Math.log(REVEAL_P_HI_GEV)));
    expect(momentumWeightU(mid)).toBeCloseTo(0.5, 10);
  });

  it('rises monotonically with |p| inside the window', () => {
    expect(momentumWeightU(0.5)).toBeLessThan(momentumWeightU(1.0));
    expect(momentumWeightU(1.0)).toBeLessThan(momentumWeightU(2.0));
  });
});

describe('betaEffFromMomentum', () => {
  it('maps soft → betaEffMin and hard → 1', () => {
    expect(betaEffFromMomentum(REVEAL_P_LO_GEV)).toBeCloseTo(REVEAL_BETA_EFF_MIN, 10);
    expect(betaEffFromMomentum(REVEAL_P_HI_GEV)).toBeCloseTo(1, 10);
  });
});

describe('attachMomentumRevealTimes', () => {
  it('stretches soft-track times more than hard-track times and leaves physical times intact', () => {
    const soft = makeParticle('soft', 0.3);
    const hard = makeParticle('hard', 4.0);
    const softTrack = makeTrack('soft', [0, 10, 20]);
    const hardTrack = makeTrack('hard', [0, 10, 20]);
    const physSoft = Array.from(softTrack.times);
    const physHard = Array.from(hardTrack.times);

    const maxNs = attachMomentumRevealTimes([softTrack, hardTrack], [soft, hard], { strength: 1 });

    expect(Array.from(softTrack.times)).toEqual(physSoft);
    expect(Array.from(hardTrack.times)).toEqual(physHard);
    expect(softTrack.timesVis).toBeDefined();
    // Hard mapped β_eff → 1; if β_phys ≈ 1, scale ≈ 1 → timesVis may be omitted.
    const softEnd = softTrack.timesVis![softTrack.pointCount - 1];
    const hardEnd = (hardTrack.timesVis ?? hardTrack.times)[hardTrack.pointCount - 1];
    expect(softEnd).toBeGreaterThan(hardEnd);
    expect(maxNs).toBe(softEnd);
  });

  it('strength=0 leaves timesVis unset (pure physical TOF)', () => {
    const p = makeParticle('p', 0.3);
    const track = makeTrack('p', [0, 5, 10]);
    const maxNs = attachMomentumRevealTimes([track], [p], { strength: 0 });
    expect(track.timesVis).toBeUndefined();
    expect(maxNs).toBe(10);
  });

  it('scale equals β_phys / β_eff for a mid-momentum track', () => {
    const p = makeParticle('mid', 1.0);
    const track = makeTrack('mid', [0, 8]);
    attachMomentumRevealTimes([track], [p], { strength: 1 });
    const betaPhys = physicalBeta(1.0, p.energy);
    const betaEff = effectiveRevealBeta(1.0, p.energy, { strength: 1 });
    expect(track.timesVis![1]).toBeCloseTo(8 * (betaPhys / betaEff), 6);
  });
});
