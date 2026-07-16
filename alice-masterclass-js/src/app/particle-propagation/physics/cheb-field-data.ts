/**
 * Binary parser for the ALICE magnetic field Chebyshev lookup tables.
 *
 * Ported 1:1 from `mag_field::mag_cheb` (`loadSolSegmentLUT`, `loadDipSegmentLUT`,
 * `loadSolParamsLUT`, `loadDipParamsLUT`) in
 * https://github.com/pnwkw/gpu_propagator (`src/mag_field/mag_cheb.cpp`,
 * `src/mag_field/include/mag_cheb.h`), GPL-3.0.
 *
 * The `.bin` files are written by a C++ program using `std::ifstream::read` on
 * whatever the build host's native byte order is. All ALICE offline binaries are
 * built/distributed for little-endian (x86/x86_64/ARM) hosts, so every multi-byte
 * value in these files is little-endian.
 *
 * IMPORTANT: this module MUST read through a `DataView` with the `littleEndian`
 * flag explicitly set to `true` on every call (`getFloat32(offset, true)` /
 * `getInt32(offset, true)`). Constructing a `Float32Array`/`Int32Array` directly
 * over the raw `ArrayBuffer` would instead use the *host's* native endianness,
 * which happens to be little-endian on common desktop/mobile browsers today but
 * is not guaranteed by the spec — doing so would silently corrupt every
 * coefficient on a big-endian host. Never bypass `BinaryReader` for this data.
 *
 * This module has zero dependencies on Angular or the DOM, so it can be imported
 * identically from `magnetic-field.service.ts` (main thread) and from
 * `propagation-physics.worker.ts` (Web Worker).
 */

import {
  DIMENSIONS,
  SOL_Z_SEGS, SOL_P_SEGS, SOL_R_SEGS, SOL_PARAMS, SOL_COLS, SOL_COEFFS_PER_COL, SOL_COEFFS,
  DIP_Z_SEGS, DIP_Y_SEGS, DIP_X_SEGS, DIP_PARAMS, DIP_COLS, DIP_COEFFS_PER_COL, DIP_COEFFS,
} from './constants';

// ---------------------------------------------------------------------------
// Struct layouts (1:1 with mag_cheb.h)
// ---------------------------------------------------------------------------

export interface SolSegments {
  segZSol: Float32Array; // [SOL_Z_SEGS]
  begSegPSol: Int32Array; // [SOL_Z_SEGS]
  nSegPSol: Int32Array; // [SOL_Z_SEGS]
  segPSol: Float32Array; // [SOL_P_SEGS]
  begSegRSol: Int32Array; // [SOL_P_SEGS]
  nSegRSol: Int32Array; // [SOL_P_SEGS]
  segRSol: Float32Array; // [SOL_R_SEGS]
  segIDSol: Int32Array; // [SOL_R_SEGS]
}

export interface DipSegments {
  segZDip: Float32Array; // [DIP_Z_SEGS]
  begSegYDip: Int32Array; // [DIP_Z_SEGS]
  nSegYDip: Int32Array; // [DIP_Z_SEGS]
  segYDip: Float32Array; // [DIP_Y_SEGS]
  begSegXDip: Int32Array; // [DIP_Y_SEGS]
  nSegXDip: Int32Array; // [DIP_Y_SEGS]
  segXDip: Float32Array; // [DIP_X_SEGS]
  segIDDip: Int32Array; // [DIP_X_SEGS]
}

export interface SolParams {
  bOffsets: Float32Array; // [DIMENSIONS * SOL_PARAMS]
  bScales: Float32Array; // [DIMENSIONS * SOL_PARAMS]
  bMin: Float32Array; // [DIMENSIONS * SOL_PARAMS]
  bMax: Float32Array; // [DIMENSIONS * SOL_PARAMS]
  nRows: Int32Array; // [DIMENSIONS * SOL_PARAMS]
  colsForRowOffset: Int32Array; // [DIMENSIONS * SOL_PARAMS]
  cofsForRowOffset: Int32Array; // [DIMENSIONS * SOL_PARAMS]
  nColsPerRow: Int32Array; // [SOL_COLS]
  cofsPerColOffset: Int32Array; // [SOL_COLS]
  nCofsPerCol: Int32Array; // [SOL_COEFFS_PER_COL]
  perColCoefOffset: Int32Array; // [SOL_COEFFS_PER_COL]
  coeffs: Float32Array; // [SOL_COEFFS]
}

export interface DipParams {
  bOffsets: Float32Array; // [DIMENSIONS * DIP_PARAMS]
  bScales: Float32Array; // [DIMENSIONS * DIP_PARAMS]
  bMin: Float32Array; // [DIMENSIONS * DIP_PARAMS]
  bMax: Float32Array; // [DIMENSIONS * DIP_PARAMS]
  nRows: Int32Array; // [DIMENSIONS * DIP_PARAMS]
  colsForRowOffset: Int32Array; // [DIMENSIONS * DIP_PARAMS]
  cofsForRowOffset: Int32Array; // [DIMENSIONS * DIP_PARAMS]
  nColsPerRow: Int32Array; // [DIP_COLS]
  cofsPerColOffset: Int32Array; // [DIP_COLS]
  nCofsPerCol: Int32Array; // [DIP_COEFFS_PER_COL]
  perColCoefOffset: Int32Array; // [DIP_COEFFS_PER_COL]
  coeffs: Float32Array; // [DIP_COEFFS]
}

export interface ChebFieldData {
  solSegments: SolSegments;
  solParams: SolParams;
  dipSegments: DipSegments;
  dipParams: DipParams;
}

/** Raw `.bin` file contents, as fetched (e.g. via `HttpClient` with `responseType: 'arraybuffer'`). */
export interface ChebFieldBuffers {
  solSegments: ArrayBuffer;
  solParams: ArrayBuffer;
  dipSegments: ArrayBuffer;
  dipParams: ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Little-endian binary reader
// ---------------------------------------------------------------------------

class BinaryReader {
  private readonly view: DataView;
  private offset = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  /** Reads a single little-endian 32-bit signed integer, advancing the cursor by 4 bytes. */
  readInt32(): number {
    const value = this.view.getInt32(this.offset, /* littleEndian */ true);
    this.offset += 4;
    return value;
  }

  /** Reads `length` little-endian 32-bit floats into a fresh typed array. */
  readFloat32Array(length: number): Float32Array {
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      out[i] = this.view.getFloat32(this.offset, /* littleEndian */ true);
      this.offset += 4;
    }
    return out;
  }

  /** Reads `length` little-endian 32-bit signed integers into a fresh typed array. */
  readInt32Array(length: number): Int32Array {
    const out = new Int32Array(length);
    for (let i = 0; i < length; i++) {
      out[i] = this.view.getInt32(this.offset, /* littleEndian */ true);
      this.offset += 4;
    }
    return out;
  }

  /** Reads a length-prefixing int32 and asserts it matches the statically-known expected count. */
  readExpectedCount(label: string, expected: number): number {
    const actual = this.readInt32();
    if (actual !== expected) {
      throw new Error(
        `[cheb-field-data] ${label}: expected count ${expected}, got ${actual} ` +
          `(byte offset ${this.offset - 4}). The .bin file layout does not match ` +
          `the constants in physics/constants.ts — is this the right file / version?`
      );
    }
    return actual;
  }

  get bytesConsumed(): number {
    return this.offset;
  }

  get bytesRemaining(): number {
    return this.view.byteLength - this.offset;
  }

  /** Throws unless the reader has consumed the buffer exactly to the end. */
  assertFullyConsumed(fileLabel: string): void {
    if (this.bytesRemaining !== 0) {
      throw new Error(
        `[cheb-field-data] ${fileLabel}: ${this.bytesRemaining} bytes left unread after ` +
          `parsing ${this.bytesConsumed} bytes — layout mismatch, aborting rather than ` +
          `silently returning a corrupt field map.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Segment LUT parsing (mag_cheb.cpp::loadSolSegmentLUT / loadDipSegmentLUT)
// ---------------------------------------------------------------------------

export function parseSolSegments(buffer: ArrayBuffer): SolSegments {
  const r = new BinaryReader(buffer);

  const nZSegSol = r.readExpectedCount('SOL_Z_SEGS', SOL_Z_SEGS);
  const segZSol = r.readFloat32Array(nZSegSol);
  const begSegPSol = r.readInt32Array(nZSegSol);
  const nSegPSol = r.readInt32Array(nZSegSol);

  const nPSegSol = r.readExpectedCount('SOL_P_SEGS', SOL_P_SEGS);
  const segPSol = r.readFloat32Array(nPSegSol);
  const begSegRSol = r.readInt32Array(nPSegSol);
  const nSegRSol = r.readInt32Array(nPSegSol);

  const nRSegSol = r.readExpectedCount('SOL_R_SEGS', SOL_R_SEGS);
  const segRSol = r.readFloat32Array(nRSegSol);
  const segIDSol = r.readInt32Array(nRSegSol);

  r.assertFullyConsumed('sol_segments.bin');

  return { segZSol, begSegPSol, nSegPSol, segPSol, begSegRSol, nSegRSol, segRSol, segIDSol };
}

export function parseDipSegments(buffer: ArrayBuffer): DipSegments {
  const r = new BinaryReader(buffer);

  const nZSegDip = r.readExpectedCount('DIP_Z_SEGS', DIP_Z_SEGS);
  const segZDip = r.readFloat32Array(nZSegDip);
  const begSegYDip = r.readInt32Array(nZSegDip);
  const nSegYDip = r.readInt32Array(nZSegDip);

  const nYSegDip = r.readExpectedCount('DIP_Y_SEGS', DIP_Y_SEGS);
  const segYDip = r.readFloat32Array(nYSegDip);
  const begSegXDip = r.readInt32Array(nYSegDip);
  const nSegXDip = r.readInt32Array(nYSegDip);

  const nXSegDip = r.readExpectedCount('DIP_X_SEGS', DIP_X_SEGS);
  const segXDip = r.readFloat32Array(nXSegDip);
  const segIDDip = r.readInt32Array(nXSegDip);

  r.assertFullyConsumed('dip_segments.bin');

  return { segZDip, begSegYDip, nSegYDip, segYDip, begSegXDip, nSegXDip, segXDip, segIDDip };
}

// ---------------------------------------------------------------------------
// Params LUT parsing (mag_cheb.cpp::loadSolParamsLUT / loadDipParamsLUT)
// ---------------------------------------------------------------------------

export function parseSolParams(buffer: ArrayBuffer): SolParams {
  const r = new BinaryReader(buffer);

  const nParams = r.readExpectedCount('SOL_PARAMS', SOL_PARAMS);
  const dimTimesParams = DIMENSIONS * nParams;

  const bOffsets = r.readFloat32Array(dimTimesParams);
  const bScales = r.readFloat32Array(dimTimesParams);
  const bMin = r.readFloat32Array(dimTimesParams);
  const bMax = r.readFloat32Array(dimTimesParams);

  const nRows = r.readInt32Array(dimTimesParams);
  const colsForRowOffset = r.readInt32Array(dimTimesParams);
  const cofsForRowOffset = r.readInt32Array(dimTimesParams);

  const nCols = r.readExpectedCount('SOL_COLS', SOL_COLS);
  const nColsPerRow = r.readInt32Array(nCols);
  const cofsPerColOffset = r.readInt32Array(nCols);

  const nCoeffsPerCol = r.readExpectedCount('SOL_COEFFS_PER_COL', SOL_COEFFS_PER_COL);
  const nCofsPerCol = r.readInt32Array(nCoeffsPerCol);
  const perColCoefOffset = r.readInt32Array(nCoeffsPerCol);

  const nCoeffs = r.readExpectedCount('SOL_COEFFS', SOL_COEFFS);
  const coeffs = r.readFloat32Array(nCoeffs);

  r.assertFullyConsumed('sol_params.bin');

  return {
    bOffsets, bScales, bMin, bMax,
    nRows, colsForRowOffset, cofsForRowOffset,
    nColsPerRow, cofsPerColOffset,
    nCofsPerCol, perColCoefOffset,
    coeffs,
  };
}

export function parseDipParams(buffer: ArrayBuffer): DipParams {
  const r = new BinaryReader(buffer);

  const nParams = r.readExpectedCount('DIP_PARAMS', DIP_PARAMS);
  const dimTimesParams = DIMENSIONS * nParams;

  const bOffsets = r.readFloat32Array(dimTimesParams);
  const bScales = r.readFloat32Array(dimTimesParams);
  const bMin = r.readFloat32Array(dimTimesParams);
  const bMax = r.readFloat32Array(dimTimesParams);

  const nRows = r.readInt32Array(dimTimesParams);
  const colsForRowOffset = r.readInt32Array(dimTimesParams);
  const cofsForRowOffset = r.readInt32Array(dimTimesParams);

  const nCols = r.readExpectedCount('DIP_COLS', DIP_COLS);
  const nColsPerRow = r.readInt32Array(nCols);
  const cofsPerColOffset = r.readInt32Array(nCols);

  const nCoeffsPerCol = r.readExpectedCount('DIP_COEFFS_PER_COL', DIP_COEFFS_PER_COL);
  const nCofsPerCol = r.readInt32Array(nCoeffsPerCol);
  const perColCoefOffset = r.readInt32Array(nCoeffsPerCol);

  const nCoeffs = r.readExpectedCount('DIP_COEFFS', DIP_COEFFS);
  const coeffs = r.readFloat32Array(nCoeffs);

  r.assertFullyConsumed('dip_params.bin');

  return {
    bOffsets, bScales, bMin, bMax,
    nRows, colsForRowOffset, cofsForRowOffset,
    nColsPerRow, cofsPerColOffset,
    nCofsPerCol, perColCoefOffset,
    coeffs,
  };
}

/** Convenience: parses all four buffers at once into a single `ChebFieldData` bundle. */
export function parseChebFieldData(buffers: ChebFieldBuffers): ChebFieldData {
  return {
    solSegments: parseSolSegments(buffers.solSegments),
    solParams: parseSolParams(buffers.solParams),
    dipSegments: parseDipSegments(buffers.dipSegments),
    dipParams: parseDipParams(buffers.dipParams),
  };
}
