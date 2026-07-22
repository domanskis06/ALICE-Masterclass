/**
 * Jet-style colour map for magnetic-field magnitude `|B|` (Tesla).
 * Used by field-line vertex colours and the UI colorbar legend.
 *
 * Palette matches typical ALICE / ParaView |B| heatmaps:
 * deep blue → cyan → green → yellow → orange → bright red (weak → strong).
 *
 * The barrel window is sized to the Chebyshev solenoid map's real dynamic
 * range (~0.29 T on axis at the L3 end-caps … ~0.56 T local peaks near mid-r
 * end-caps at the nominal 0.5 T plateau). The old ±0.03 T band crushed that
 * into clamp artefacts: outer midplane lines looked fully red, and genuine
 * end-cap fall-off was invisible.
 *
 * Offsets scale with `B / NOMINAL_SOLENOID_B_T` so the same relative |B|
 * distribution keeps its palette position at every slider setting (0.5…4 T).
 */

import { FIELD_STRENGTH_DEFAULT_T, NOMINAL_SOLENOID_B_T } from './constants';

/**
 * Colorbar lower offset at the nominal 0.5 T strength (Tesla).
 * 0.5 − 0.20 = 0.30 T — covers on-axis end-cap fall-off in the LUT.
 */
export const FIELD_COLOR_LOW_OFFSET_T = 0.2;

/**
 * Colorbar upper offset at the nominal 0.5 T strength (Tesla).
 * 0.5 + 0.20 = 0.70 T — matches the lower offset so the 0.5 T solenoid
 * plateau sits at mid-scale (light green), same hue students see with the
 * wider dipole view window. Still covers mid-radius end-cap peaks (~0.56 T).
 */
export const FIELD_COLOR_HIGH_OFFSET_T = 0.2;

/** Inclusive Tesla window used when mapping `|B|` → RGB. */
export interface FieldColorRange {
  minT: number;
  maxT: number;
}

/**
 * Colour-scale ends for a selected plateau strength `targetStrengthT`.
 * Offsets scale with `B / NOMINAL_SOLENOID_B_T`.
 * At 0.5 T: `[0.30, 0.70]`; at 2 T: `[1.20, 2.80]`.
 */
export function fieldColorRangeForStrength(targetStrengthT: number): FieldColorRange {
  const strengthScale = targetStrengthT / NOMINAL_SOLENOID_B_T;
  return {
    minT: targetStrengthT - FIELD_COLOR_LOW_OFFSET_T * strengthScale,
    maxT: targetStrengthT + FIELD_COLOR_HIGH_OFFSET_T * strengthScale,
  };
}

/**
 * Wider |B| window when dipole arcs are shown. The solenoid plateau sits mid-scale
 * while the stronger dipole aperture (~0.7 T at nominal map) and weak fringe are
 * not crushed into a single colour.
 */
export function fieldColorRangeForDipoleView(targetStrengthT: number): FieldColorRange {
  const strengthScale = targetStrengthT / NOMINAL_SOLENOID_B_T;
  return {
    minT: 0.05 * strengthScale,
    maxT: 0.9 * strengthScale,
  };
}

/** Default lower end of the colour scale (Tesla) at the nominal 0.5 T strength. */
export const FIELD_COLOR_MIN_T = fieldColorRangeForStrength(FIELD_STRENGTH_DEFAULT_T).minT;

/** Default upper end of the colour scale (Tesla) at the nominal 0.5 T strength. */
export const FIELD_COLOR_MAX_T = fieldColorRangeForStrength(FIELD_STRENGTH_DEFAULT_T).maxT;

/** RGB stops: Jet / rainbow (weak → strong), matching typical |B| slice heatmaps. */
const COLOR_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [0.0, 0.0, 0.55], // deep blue (weak)
  [0.0, 0.35, 1.0], // blue
  [0.0, 0.85, 0.95], // cyan
  [0.1, 0.95, 0.2], // green
  [0.95, 0.95, 0.1], // yellow
  [1.0, 0.45, 0.0], // orange
  [0.9, 0.05, 0.05], // bright red (strong)
];

export type Rgb = [number, number, number];

function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function resolveRange(range?: FieldColorRange): FieldColorRange {
  return range ?? { minT: FIELD_COLOR_MIN_T, maxT: FIELD_COLOR_MAX_T };
}

/** Normalised scalar in [0, 1] for a given `|B|` in Tesla. */
export function normalizeMagnitude(bTesla: number, range?: FieldColorRange): number {
  const { minT, maxT } = resolveRange(range);
  const span = maxT - minT;
  if (span <= 0) return 0;
  return clamp01((bTesla - minT) / span);
}

/**
 * Maps `|B|` (Tesla) to RGB in [0, 1]. Values outside the supplied
 * (or default) range are clamped.
 */
export function magnitudeToRgb(bTesla: number, range?: FieldColorRange): Rgb {
  const t = normalizeMagnitude(bTesla, range);
  const last = COLOR_STOPS.length - 1;
  const scaled = t * last;
  const i0 = Math.min(Math.floor(scaled), last - 1);
  const i1 = i0 + 1;
  const local = scaled - i0;
  const c0 = COLOR_STOPS[i0];
  const c1 = COLOR_STOPS[i1];
  return [lerp(c0[0], c1[0], local), lerp(c0[1], c1[1], local), lerp(c0[2], c1[2], local)];
}

/** CSS `linear-gradient` string matching {@link COLOR_STOPS} (left=weak → right=strong). */
export function fieldColorbarCssGradient(): string {
  const stops = COLOR_STOPS.map((c, i) => {
    const pct = (i / (COLOR_STOPS.length - 1)) * 100;
    const r = Math.round(c[0] * 255);
    const g = Math.round(c[1] * 255);
    const b = Math.round(c[2] * 255);
    return `rgb(${r}, ${g}, ${b}) ${pct.toFixed(1)}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
