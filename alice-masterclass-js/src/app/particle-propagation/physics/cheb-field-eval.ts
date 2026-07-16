/**
 * Pure (no Angular, no DOM) evaluation of the ALICE Chebyshev magnetic field map.
 *
 * Ported 1:1 from `mag_field::mag_cheb` in
 * https://github.com/pnwkw/gpu_propagator (`src/mag_field/mag_cheb.cpp`), GPL-3.0.
 *
 * Kept dependency-free on purpose so the exact same class can be imported from:
 * - `magnetic-field.service.ts` (Angular, main thread — used for quick lookups/tests), and
 * - `propagation-physics.worker.ts` (Web Worker — used in the RK4 hot loop, Faza 4).
 *
 * Returns the field in the map's *raw* units, matching `mag_cheb::Field` exactly
 * (it does **not** apply `FIELD_SCALE`). Callers that need physical Tesla must
 * multiply by `FIELD_SCALE` themselves (this mirrors the reference: the raw
 * `Field()` C++ call is scaled by the caller, e.g. `Field(pos) * SCALE` in
 * `gpu_propagator/shaders/helix_geom_code.glsl`).
 */

import { ChebFieldData } from './cheb-field-data';
import {
  DIMENSIONS,
  SOL_Z_SEGS,
  DIP_Z_SEGS,
  SOL_MIN_Z,
  FIELD_MIN_Z,
  FIELD_MAX_Z,
  MAX_CHEB_ORDER,
} from './constants';
import { Vec3 } from './propagation-types';

const ZERO_FIELD: Vec3 = { x: 0, y: 0, z: 0 };

export class ChebFieldEvaluator {
  /** Last successfully-matched solenoid/dipole segment — safe hint, always re-validated via isInside*. */
  private solSegCache = -1;
  private dipSegCache = -1;

  /** Scratch buffers reused across evalSol/evalDip calls to avoid per-call allocation in the RK4 hot loop. */
  private readonly tmpCfs1 = new Float32Array(MAX_CHEB_ORDER);
  private readonly tmpCfs0 = new Float32Array(MAX_CHEB_ORDER);

  constructor(private readonly data: ChebFieldData) {}

  /** Drops the cached segment hints (e.g. before propagating a spatially-unrelated particle). */
  resetCache(): void {
    this.solSegCache = -1;
    this.dipSegCache = -1;
  }

  /** Raw field map lookup at `pos` (cm), in the map's native (unscaled) units. */
  field(pos: Vec3): Vec3 {
    if (pos.z > FIELD_MIN_Z && pos.z < FIELD_MAX_Z) {
      return this.solDipField(pos);
    }
    return this.machineField();
  }

  // ---------------------------------------------------------------------
  // mag_cheb.cpp::MachineField — unmodelled beyond the solenoid/dipole z-range.
  // ---------------------------------------------------------------------
  private machineField(): Vec3 {
    return ZERO_FIELD;
  }

  // ---------------------------------------------------------------------
  // mag_cheb.cpp::SolDipField
  // ---------------------------------------------------------------------
  private solDipField(pos: Vec3): Vec3 {
    if (pos.z > SOL_MIN_Z) {
      const rphiz = this.cartToCyl(pos);

      if (this.solSegCache >= 0 && this.isInsideSol(this.solSegCache, rphiz)) {
        const brphiz = this.evalSol(this.solSegCache, rphiz);
        return this.cylToCartCylB(rphiz, brphiz);
      }

      const segId = this.findSolSegment(rphiz);
      if (segId >= 0 && this.isInsideSol(segId, rphiz)) {
        this.solSegCache = segId;
        const brphiz = this.evalSol(segId, rphiz);
        return this.cylToCartCylB(rphiz, brphiz);
      }
    }

    if (this.dipSegCache >= 0 && this.isInsideDip(this.dipSegCache, pos)) {
      return this.evalDip(this.dipSegCache, pos);
    }

    const segId = this.findDipSegment(pos);
    if (segId >= 0 && this.isInsideDip(segId, pos)) {
      this.dipSegCache = segId;
      return this.evalDip(segId, pos);
    }

    return ZERO_FIELD;
  }

  // ---------------------------------------------------------------------
  // Coordinate transforms
  // ---------------------------------------------------------------------
  private cartToCyl(pos: Vec3): Vec3 {
    return { x: Math.hypot(pos.x, pos.y), y: Math.atan2(pos.y, pos.x), z: pos.z };
  }

  private cylToCartCylB(rphiz: Vec3, brphiz: Vec3): Vec3 {
    const btr = Math.hypot(brphiz.x, brphiz.y);
    const psiPlusPhi = Math.atan2(brphiz.y, brphiz.x) + rphiz.y;
    return { x: btr * Math.cos(psiPlusPhi), y: btr * Math.sin(psiPlusPhi), z: brphiz.z };
  }

  // ---------------------------------------------------------------------
  // Segment lookup (comb search: Z -> P/Y -> R/X), mirrors findSolSegment / findDipSegment.
  // ---------------------------------------------------------------------
  private findSolSegment(rphiz: Vec3): number {
    const seg = this.data.solSegments;

    let zid = 0;
    for (; zid < SOL_Z_SEGS; zid++) {
      if (rphiz.z < seg.segZSol[zid]) break;
    }
    zid = Math.max(0, zid - 1);

    const pSegBeg = seg.begSegPSol[zid];
    let pid = 0;
    for (; pid < seg.nSegPSol[zid]; pid++) {
      if (rphiz.y < seg.segPSol[pSegBeg + pid]) break;
    }
    pid = Math.max(0, pid - 1) + pSegBeg;

    const rSegBeg = seg.begSegRSol[pid];
    let rid = 0;
    for (; rid < seg.nSegRSol[pid]; rid++) {
      if (rphiz.x < seg.segRSol[rSegBeg + rid]) break;
    }
    rid = Math.max(0, rid - 1) + rSegBeg;

    return seg.segIDSol[rid];
  }

  private findDipSegment(pos: Vec3): number {
    const seg = this.data.dipSegments;

    let zid = 0;
    for (; zid < DIP_Z_SEGS; zid++) {
      if (pos.z < seg.segZDip[zid]) break;
    }
    zid = Math.max(0, zid - 1);

    const ySegBeg = seg.begSegYDip[zid];
    let yid = 0;
    for (; yid < seg.nSegYDip[zid]; yid++) {
      if (pos.y < seg.segYDip[ySegBeg + yid]) break;
    }
    yid = Math.max(0, yid - 1) + ySegBeg;

    const xSegBeg = seg.begSegXDip[yid];
    let xid = 0;
    for (; xid < seg.nSegXDip[yid]; xid++) {
      if (pos.x < seg.segXDip[xSegBeg + xid]) break;
    }
    xid = Math.max(0, xid - 1) + xSegBeg;

    return seg.segIDDip[xid];
  }

  // ---------------------------------------------------------------------
  // Bounding-box membership test (mirrors IsInsideSol / IsInsideDip / IsBetween).
  // ---------------------------------------------------------------------
  private isInsideSol(segId: number, rphiz: Vec3): boolean {
    const p = this.data.solParams;
    const index = DIMENSIONS * segId;
    return (
      rphiz.x >= p.bMin[index] && rphiz.x <= p.bMax[index] &&
      rphiz.y >= p.bMin[index + 1] && rphiz.y <= p.bMax[index + 1] &&
      rphiz.z >= p.bMin[index + 2] && rphiz.z <= p.bMax[index + 2]
    );
  }

  private isInsideDip(segId: number, pos: Vec3): boolean {
    const p = this.data.dipParams;
    const index = DIMENSIONS * segId;
    return (
      pos.x >= p.bMin[index] && pos.x <= p.bMax[index] &&
      pos.y >= p.bMin[index + 1] && pos.y <= p.bMax[index + 1] &&
      pos.z >= p.bMin[index + 2] && pos.z <= p.bMax[index + 2]
    );
  }

  // ---------------------------------------------------------------------
  // Internal (normalized) coordinate mapping, mirrors mapToInternalSol / mapToInternalDip.
  // ---------------------------------------------------------------------
  private mapToInternalSol(segId: number, rphiz: Vec3): Vec3 {
    const p = this.data.solParams;
    const index = DIMENSIONS * segId;
    return {
      x: (rphiz.x - p.bOffsets[index]) * p.bScales[index],
      y: (rphiz.y - p.bOffsets[index + 1]) * p.bScales[index + 1],
      z: (rphiz.z - p.bOffsets[index + 2]) * p.bScales[index + 2],
    };
  }

  private mapToInternalDip(segId: number, pos: Vec3): Vec3 {
    const p = this.data.dipParams;
    const index = DIMENSIONS * segId;
    return {
      x: (pos.x - p.bOffsets[index]) * p.bScales[index],
      y: (pos.y - p.bOffsets[index + 1]) * p.bScales[index + 1],
      z: (pos.z - p.bOffsets[index + 2]) * p.bScales[index + 2],
    };
  }

  // ---------------------------------------------------------------------
  // Chebyshev (Clenshaw recurrence) evaluation — mirrors cheb1DParams / cheb1DArray exactly.
  // ---------------------------------------------------------------------

  /** Reads coefficients directly out of the flat `coeffs` buffer at `coeffOffset` (innermost, z-dimension). */
  private cheb1DParams(x: number, coeffs: Float32Array, coeffOffset: number, ncfIn: number): number {
    let ncf = ncfIn;
    if (ncf <= 0) return 0;
    const x2 = x + x;
    let b0 = coeffs[coeffOffset + (--ncf)];
    let b1 = 0;
    let b2 = 0;
    ncf--;
    for (let i = ncf; i >= 0; i--) {
      b2 = b1;
      b1 = b0;
      b0 = coeffs[coeffOffset + i] + x2 * b1 - b2;
    }
    return b0 - x * b1;
  }

  /** Same Clenshaw recurrence as `cheb1DParams`, but over a plain (already-materialized) array. */
  private cheb1DArray(x: number, arr: Float32Array, ncfIn: number): number {
    let ncf = ncfIn;
    if (ncf <= 0) return 0;
    const x2 = x + x;
    let b0 = arr[--ncf];
    let b1 = 0;
    let b2 = 0;
    ncf--;
    for (let i = ncf; i >= 0; i--) {
      b2 = b1;
      b1 = b0;
      b0 = arr[i] + x2 * b1 - b2;
    }
    return b0 - x * b1;
  }

  // ---------------------------------------------------------------------
  // 3D tensor-product Chebyshev evaluation (z innermost, then y, then x) — mirrors Eval3DSol / Eval3DDip.
  // ---------------------------------------------------------------------
  private eval3DSol(segId: number, dim: number, internal: Vec3): number {
    const p = this.data.solParams;
    const index = DIMENSIONS * segId;
    const nRows = p.nRows[index + dim];
    const colsForRowOffset = p.colsForRowOffset[index + dim];
    const coeffsForRowOffset = p.cofsForRowOffset[index + dim];

    for (let row = 0; row < nRows; row++) {
      const nCols = p.nColsPerRow[colsForRowOffset + row];
      const coeffPerColOffset = p.cofsPerColOffset[colsForRowOffset + row];

      for (let col = 0; col < nCols; col++) {
        const nCoeffs = p.nCofsPerCol[coeffPerColOffset + col];
        const perColCoeffOffset = p.perColCoefOffset[coeffPerColOffset + col];
        const coeffsOffset = coeffsForRowOffset + perColCoeffOffset;
        this.tmpCfs1[col] = this.cheb1DParams(internal.z, p.coeffs, coeffsOffset, nCoeffs);
      }
      this.tmpCfs0[row] = this.cheb1DArray(internal.y, this.tmpCfs1, nCols);
    }

    return this.cheb1DArray(internal.x, this.tmpCfs0, nRows);
  }

  private eval3DDip(segId: number, dim: number, internal: Vec3): number {
    const p = this.data.dipParams;
    const index = DIMENSIONS * segId;
    const nRows = p.nRows[index + dim];
    const colsForRowOffset = p.colsForRowOffset[index + dim];
    const coeffsForRowOffset = p.cofsForRowOffset[index + dim];

    for (let row = 0; row < nRows; row++) {
      const nCols = p.nColsPerRow[colsForRowOffset + row];
      const coeffPerColOffset = p.cofsPerColOffset[colsForRowOffset + row];

      for (let col = 0; col < nCols; col++) {
        const nCoeffs = p.nCofsPerCol[coeffPerColOffset + col];
        const perColCoeffOffset = p.perColCoefOffset[coeffPerColOffset + col];
        const coeffsOffset = coeffsForRowOffset + perColCoeffOffset;
        this.tmpCfs1[col] = this.cheb1DParams(internal.z, p.coeffs, coeffsOffset, nCoeffs);
      }
      this.tmpCfs0[row] = this.cheb1DArray(internal.y, this.tmpCfs1, nCols);
    }

    return this.cheb1DArray(internal.x, this.tmpCfs0, nRows);
  }

  private evalSol(segId: number, rphiz: Vec3): Vec3 {
    const internal = this.mapToInternalSol(segId, rphiz);
    return {
      x: this.eval3DSol(segId, 0, internal),
      y: this.eval3DSol(segId, 1, internal),
      z: this.eval3DSol(segId, 2, internal),
    };
  }

  private evalDip(segId: number, pos: Vec3): Vec3 {
    const internal = this.mapToInternalDip(segId, pos);
    return {
      x: this.eval3DDip(segId, 0, internal),
      y: this.eval3DDip(segId, 1, internal),
      z: this.eval3DDip(segId, 2, internal),
    };
  }
}
