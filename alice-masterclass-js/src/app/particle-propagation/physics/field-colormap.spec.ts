/**
 * Unit tests for the Jet-style |B| colour map.
 */

import {
  FIELD_COLOR_HIGH_OFFSET_T,
  FIELD_COLOR_LOW_OFFSET_T,
  FIELD_COLOR_MAX_T,
  FIELD_COLOR_MIN_T,
  fieldColorbarCssGradient,
  fieldColorRangeForDipoleView,
  fieldColorRangeForStrength,
  magnitudeToRgb,
  normalizeMagnitude,
} from './field-colormap';

describe('field-colormap', () => {
  it('scales the barrel |B| window with plateau strength (Chebyshev map span)', () => {
    expect(fieldColorRangeForStrength(0.5)).toEqual({
      minT: 0.5 - FIELD_COLOR_LOW_OFFSET_T,
      maxT: 0.5 + FIELD_COLOR_HIGH_OFFSET_T,
    });
    // Covers on-axis end-cap fall-off (~0.29 T) and mid-r end-cap peaks (~0.56 T).
    expect(FIELD_COLOR_MIN_T).toBeCloseTo(0.3, 6);
    expect(FIELD_COLOR_MAX_T).toBeCloseTo(0.58, 6);

    // 2 T = 4× nominal → offsets ×4 so relative |B| keeps the same colours.
    const at2T = fieldColorRangeForStrength(2);
    expect(at2T.minT).toBeCloseTo(1.2, 6);
    expect(at2T.maxT).toBeCloseTo(2.32, 6);
  });

  it('places the 0.5 T plateau mid-high and end-cap fall-off toward blue', () => {
    const range = fieldColorRangeForStrength(0.5);
    // Plateau should not sit at the red clamp (old ±0.03 T window did that for outer r).
    expect(normalizeMagnitude(0.5, range)).toBeGreaterThan(0.55);
    expect(normalizeMagnitude(0.5, range)).toBeLessThan(0.85);
    expect(normalizeMagnitude(0.32, range)).toBeLessThan(0.15);
    expect(normalizeMagnitude(0.56, range)).toBeGreaterThan(0.85);
  });

  it('dipole view uses a wide window covering fringe and dipole peak', () => {
    const atHalf = fieldColorRangeForDipoleView(0.5);
    expect(atHalf.minT).toBeCloseTo(0.05, 6);
    expect(atHalf.maxT).toBeCloseTo(0.9, 6);
    // Solenoid plateau sits mid-scale; dipole ~0.7 T is not crushed to the top.
    expect(normalizeMagnitude(0.5, atHalf)).toBeGreaterThan(0.4);
    expect(normalizeMagnitude(0.5, atHalf)).toBeLessThan(0.7);
    expect(normalizeMagnitude(0.7, atHalf)).toBeGreaterThan(normalizeMagnitude(0.5, atHalf));
  });

  it('maps a proportional |B| drop to the same normalised colour at every strength', () => {
    const atHalf = fieldColorRangeForStrength(0.5);
    const atTwo = fieldColorRangeForStrength(2);
    // Same relative drop: 0.48/0.5 = 1.92/2.0.
    expect(normalizeMagnitude(0.48, atHalf)).toBeCloseTo(normalizeMagnitude(1.92, atTwo), 6);
  });

  it('normalises |B| into [0, 1] and clamps outside the scale', () => {
    expect(normalizeMagnitude(FIELD_COLOR_MIN_T)).toBeCloseTo(0, 6);
    expect(normalizeMagnitude(FIELD_COLOR_MAX_T)).toBeCloseTo(1, 6);
    expect(normalizeMagnitude(0)).toBe(0);
    expect(normalizeMagnitude(10)).toBe(1);

    const range = fieldColorRangeForStrength(2);
    expect(normalizeMagnitude(1.2, range)).toBeCloseTo(0, 6);
    expect(normalizeMagnitude(2.32, range)).toBeCloseTo(1, 6);
  });

  it('maps weak |B| to deep blue and strong |B| to bright red', () => {
    const weak = magnitudeToRgb(FIELD_COLOR_MIN_T);
    const strong = magnitudeToRgb(FIELD_COLOR_MAX_T);
    // Weak: deep blue — blue channel dominant.
    expect(weak[2]).toBeGreaterThan(weak[0]);
    expect(weak[2]).toBeGreaterThan(weak[1]);
    expect(weak[0]).toBeLessThan(0.2);
    // Strong: bright red — red-dominant, low green/blue.
    expect(strong[0]).toBeGreaterThan(strong[1]);
    expect(strong[0]).toBeGreaterThan(strong[2]);
    expect(strong[0]).toBeGreaterThan(0.7);
    expect(strong[1]).toBeLessThan(0.25);
    expect(strong[2]).toBeLessThan(0.25);
  });

  it('exports a CSS gradient string for the colorbar', () => {
    const css = fieldColorbarCssGradient();
    expect(css.startsWith('linear-gradient(')).toBeTrue();
    expect(css).toContain('rgb(');
  });
});
