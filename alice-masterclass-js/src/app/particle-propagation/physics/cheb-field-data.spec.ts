import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';

import { parseSolSegments, parseSolParams, parseDipSegments, parseDipParams } from './cheb-field-data';
import {
  FIELD_DATA_BASE_PATH,
  SOL_PARAMS, SOL_MIN_Z,
  DIP_PARAMS, DIP_MIN_Z,
} from './constants';

/**
 * These tests fetch the *real* `.bin` lookup tables shipped under
 * `src/assets/field/` and run them through the actual parser. This is the
 * cheapest way to catch a little-endian/offset regression before it ever
 * reaches `MagneticFieldService` (a byte-layout bug would otherwise silently
 * produce a wrong-but-plausible-looking field map).
 */
describe('cheb-field-data (real binary fixtures)', () => {
  let http: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient()],
    });
    http = TestBed.inject(HttpClient);
  });

  function loadArrayBuffer(fileName: string): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      http
        .get(`${FIELD_DATA_BASE_PATH}/${fileName}`, { responseType: 'arraybuffer' })
        .subscribe({ next: resolve, error: reject });
    });
  }

  it('parses sol_segments.bin without throwing and matches the known SOL_MIN_Z boundary', async () => {
    const buffer = await loadArrayBuffer('sol_segments.bin');
    const segments = parseSolSegments(buffer);
    expect(segments.segZSol[0]).toBeCloseTo(SOL_MIN_Z, 3);
  });

  it('parses dip_segments.bin without throwing and matches the known DIP_MIN_Z boundary', async () => {
    const buffer = await loadArrayBuffer('dip_segments.bin');
    const segments = parseDipSegments(buffer);
    expect(segments.segZDip[0]).toBeCloseTo(DIP_MIN_Z, 3);
  });

  it('parses sol_params.bin with the expected parameter count and finite coefficients', async () => {
    const buffer = await loadArrayBuffer('sol_params.bin');
    const params = parseSolParams(buffer);
    expect(params.bMin.length).toBe(3 * SOL_PARAMS);
    expect(params.coeffs.length).toBeGreaterThan(0);
    expect(params.coeffs.every((v) => Number.isFinite(v))).toBe(true);
    for (let i = 0; i < params.bMin.length; i++) {
      expect(params.bMin[i]).toBeLessThanOrEqual(params.bMax[i]);
    }
  });

  it('parses dip_params.bin with the expected parameter count and finite coefficients', async () => {
    const buffer = await loadArrayBuffer('dip_params.bin');
    const params = parseDipParams(buffer);
    expect(params.bMin.length).toBe(3 * DIP_PARAMS);
    expect(params.coeffs.length).toBeGreaterThan(0);
    expect(params.coeffs.every((v) => Number.isFinite(v))).toBe(true);
    for (let i = 0; i < params.bMin.length; i++) {
      expect(params.bMin[i]).toBeLessThanOrEqual(params.bMax[i]);
    }
  });

  it('throws a descriptive error when fed a buffer with the wrong layout', () => {
    const bogus = new ArrayBuffer(16);
    expect(() => parseSolSegments(bogus)).toThrowError(/SOL_Z_SEGS/);
  });
});
