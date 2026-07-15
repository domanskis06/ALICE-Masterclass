/**
 * Unit tests for the Jet-style |B| colour map.
 */

import {
  FIELD_COLOR_HIGH_OFFSET_T,
  FIELD_COLOR_LOW_OFFSET_T,
  FIELD_COLOR_MAX_T,
  FIELD_COLOR_MIN_T,
  fieldColorbarCssGradient,
  fieldColorRangeForStrength,
  magnitudeToRgb,
  normalizeMagnitude,
} from './field-colormap';

describe('field-colormap', () => {
  it('scales the B−0.03 T … B+0.01 T window with plateau strength', () => {
    expect(fieldColorRangeForStrength(0.5)).toEqual({
      minT: 0.5 - FIELD_COLOR_LOW_OFFSET_T,
      maxT: 0.5 + FIELD_COLOR_HIGH_OFFSET_T,
    });
    expect(FIELD_COLOR_MIN_T).toBeCloseTo(0.47, 6);
    expect(FIELD_COLOR_MAX_T).toBeCloseTo(0.51, 6);

    // 2 T = 4× nominal → offsets ×4 so axial fall-off keeps the same colours.
    const at2T = fieldColorRangeForStrength(2);
    expect(at2T.minT).toBeCloseTo(1.88, 6);
    expect(at2T.maxT).toBeCloseTo(2.04, 6);
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
    expect(normalizeMagnitude(1.88, range)).toBeCloseTo(0, 6);
    expect(normalizeMagnitude(2.04, range)).toBeCloseTo(1, 6);
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
