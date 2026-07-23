/**
 * Unit tests for the Jet-style |B| colour map.
 */

import {
  FIELD_COLOR_HIGH_OFFSET_T,
  FIELD_COLOR_LOW_OFFSET_T,
  FIELD_COLOR_MAX_T,
  FIELD_COLOR_MIN_T,
  boostRgbForLightBackground,
  fieldColorbarCssGradient,
  fieldColorRangeForDipoleView,
  fieldColorRangeForStrength,
  magnitudeToRgb,
  magnitudeToRgbForTheme,
  normalizeMagnitude,
} from './field-colormap';

describe('field-colormap', () => {
  it('scales the barrel |B| window with plateau strength (Chebyshev map span)', () => {
    expect(fieldColorRangeForStrength(0.5)).toEqual({
      minT: 0.5 - FIELD_COLOR_LOW_OFFSET_T,
      maxT: 0.5 + FIELD_COLOR_HIGH_OFFSET_T,
    });
    // Symmetric ±0.20 T band: end-cap fall-off (~0.29 T) → blue, peaks (~0.56 T) still in-range.
    expect(FIELD_COLOR_MIN_T).toBeCloseTo(0.3, 6);
    expect(FIELD_COLOR_MAX_T).toBeCloseTo(0.7, 6);

    // 2 T = 4× nominal → offsets ×4 so relative |B| keeps the same colours.
    const at2T = fieldColorRangeForStrength(2);
    expect(at2T.minT).toBeCloseTo(1.2, 6);
    expect(at2T.maxT).toBeCloseTo(2.8, 6);
  });

  it('places the 0.5 T plateau at mid-scale green (matches dipole-view hue)', () => {
    const range = fieldColorRangeForStrength(0.5);
    const dipole = fieldColorRangeForDipoleView(0.5);
    // Plateau sits on the green stop; close to the dipole-view mapping for 0.5 T.
    expect(normalizeMagnitude(0.5, range)).toBeCloseTo(0.5, 6);
    expect(normalizeMagnitude(0.5, range)).toBeCloseTo(normalizeMagnitude(0.5, dipole), 1);
    expect(normalizeMagnitude(0.32, range)).toBeLessThan(0.15);
    expect(normalizeMagnitude(0.56, range)).toBeGreaterThan(0.55);
    expect(normalizeMagnitude(0.56, range)).toBeLessThan(0.75);
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
    expect(normalizeMagnitude(2.8, range)).toBeCloseTo(1, 6);
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

  it('darkens and saturates Jet midtones for pale light-mode backgrounds', () => {
    const yellow: [number, number, number] = [0.95, 0.95, 0.1];
    const boosted = boostRgbForLightBackground(yellow);
    const luma = (c: [number, number, number]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    expect(luma(boosted)).toBeLessThan(luma(yellow));
    // Still yellow-ish (R≈G, B low).
    expect(boosted[0]).toBeGreaterThan(boosted[2]);
    expect(boosted[1]).toBeGreaterThan(boosted[2]);
  });

  it('magnitudeToRgbForTheme leaves dark-mode colours unchanged and boosts light mode', () => {
    const dark = magnitudeToRgbForTheme(0.5, undefined, true);
    const light = magnitudeToRgbForTheme(0.5, undefined, false);
    expect(dark).toEqual(magnitudeToRgb(0.5));
    expect(light).not.toEqual(dark);
    const luma = (c: [number, number, number]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    expect(luma(light)).toBeLessThan(luma(dark));
  });
});
