/**
 * Physical and numerical constants for the Particle Propagation module.
 *
 * Units convention (kept consistent across the whole `physics/` folder):
 * - position:      centimeters (cm)
 * - momentum:       GeV/c
 * - magnetic field: Tesla (T)
 * - time:           nanoseconds (ns)
 *
 * Field-map segment/coefficient counts mirror `mag_field::mag_cheb` from
 * https://github.com/pnwkw/gpu_propagator (`src/mag_field/include/mag_cheb.h`).
 */

/** Speed of light in cm/ns. */
export const SPEED_OF_LIGHT_CM_PER_NS = 29.9792458;

/** B2C constant from AliRoot's helix propagator (p[GeV/c] = B2C * B[T] * R[cm] * |q|). */
export const B2C = 0.299792458e-2;

/**
 * Scale applied to the raw Chebyshev field evaluation to obtain Tesla.
 * Magnitude (`0.1`, kilogauss → Tesla) mirrors `SCALE` in
 * `gpu_propagator/shaders/shaders_config.glsl`; the **sign is flipped**
 * relative to that GLSL source, though. `gpu_propagator`'s own GPU kernel
 * pairs this constant with its own (differently-signed) curvature formula,
 * so its sign is only meaningful together with that kernel. Our RK4
 * (`rk4-integrator.ts`) instead uses the standard textbook Lorentz-force
 * convention `du/ds = (q*B2C/|p|) * (u x B)`, and empirically (Faza 15,
 * `rk4-trajectory-validation.spec.ts`) only `+0.1` reproduces the correct
 * bending direction for both charge signs against the real, pre-computed
 * `trajectory` arrays shipped with the strangeness exercise data.
 */
export const FIELD_SCALE = 0.1;

/**
 * Nominal |B| plateau of the ALICE solenoid in the Chebyshev map (~0.5 T at the IP).
 * The UI field-strength slider is expressed in Tesla relative to this value: selecting
 * `B_ui` multiplies the spatially varying map by `B_ui / NOMINAL_SOLENOID_B_T`, so the
 * axial fall-off at the detector ends is preserved while the plateau tracks the slider.
 */
export const NOMINAL_SOLENOID_B_T = 0.5;

/** Inclusive UI range for the magnetic-field strength slider (Tesla). */
export const FIELD_STRENGTH_MIN_T = 0.5;
export const FIELD_STRENGTH_MAX_T = 2;
export const FIELD_STRENGTH_STEP_T = 0.1;
/** Default slider / initial strength (matches the nominal map). */
export const FIELD_STRENGTH_DEFAULT_T = NOMINAL_SOLENOID_B_T;

/** Detector "wall": particles are stopped once |r| (from origin, in cm) exceeds this radius. */
export const MAX_DETECTOR_R_CM = 500;

/** RK4 arc-length step, in cm. */
export const RK4_STEP_CM = 1.5;

/** Hard cap on the number of RK4 steps per particle (safety bound, avoids runaway loops). */
export const MAX_RK4_STEPS = 500;

/** Hard cap on the number of particles propagated per event (perf/UX guard).
 * Curated events already ship 15-40 charged tracks; this is just a safety net. */
export const MAX_TRACKED_PARTICLES = 40;

/** Chebyshev field-map dimensionality (x/y/z or r/phi/z components). */
export const DIMENSIONS = 3;

// ---------------------------------------------------------------------------
// Solenoid (barrel) lookup-table sizes — must match `sol_segments.bin` / `sol_params.bin`.
// ---------------------------------------------------------------------------
export const SOL_Z_SEGS = 29;
export const SOL_P_SEGS = 278;
export const SOL_R_SEGS = 3492;

export const SOL_PARAMS = 1534;
export const SOL_COLS = 9931;
export const SOL_COEFFS_PER_COL = 48444;
export const SOL_COEFFS = 110683;

// ---------------------------------------------------------------------------
// Dipole (muon-arm) lookup-table sizes — must match `dip_segments.bin` / `dip_params.bin`.
// ---------------------------------------------------------------------------
export const DIP_Z_SEGS = 89;
export const DIP_Y_SEGS = 1295;
export const DIP_X_SEGS = 12019;

export const DIP_PARAMS = 1482;
export const DIP_COLS = 16108;
export const DIP_COEFFS_PER_COL = 56528;
export const DIP_COEFFS = 171958;

/** Maximum Chebyshev polynomial order supported by the coefficient layout. */
export const MAX_CHEB_ORDER = 32;

// ---------------------------------------------------------------------------
// Z-range gating between the solenoid+dipole model and the (unmodelled) machine field.
// ---------------------------------------------------------------------------
export const SOL_MIN_Z = -550;
export const SOL_MAX_Z = 850;
export const DIP_MIN_Z = -1760;
export const DIP_MAX_Z = -532.46997;

export const FIELD_MIN_Z = DIP_MIN_Z;
export const FIELD_MAX_Z = SOL_MAX_Z;

// ---------------------------------------------------------------------------
// Asset paths
// ---------------------------------------------------------------------------
export const FIELD_DATA_BASE_PATH = 'assets/field';
export const DETECTOR_MODEL_BASE_PATH = 'assets/models/alice components';
export const PROTON_MODEL_PATH = 'assets/models/proton.glb';
/** Curated Particle Propagation events from part1 (see scripts/curate-propagation-events.mjs). */
export const PARTICLE_EVENT_DATA_BASE_PATH = 'assets/exercises/particle-propagation';
/** Number of curated `event_<n>.json` files shipped under the base path above. */
export const PARTICLE_EVENT_COUNT = 10;
