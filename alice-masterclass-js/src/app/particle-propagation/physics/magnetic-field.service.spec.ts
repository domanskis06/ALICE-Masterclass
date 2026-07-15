import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { MagneticFieldService } from './magnetic-field.service';

describe('MagneticFieldService', () => {
  let service: MagneticFieldService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient()],
    });
    service = TestBed.inject(MagneticFieldService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('throws if field() is called before load() resolves', () => {
    expect(() => service.field({ x: 0, y: 0, z: 0 })).toThrowError(/load\(\)/);
  });

  it('loads the real field map and reports ~0.5T along z at the detector center (nominal ALICE solenoid field)', async () => {
    await service.load();
    expect(service.isLoaded).toBe(true);

    const b = service.field({ x: 0, y: 0, z: 0 });
    const magnitude = Math.hypot(b.x, b.y, b.z);

    expect(magnitude).toBeGreaterThan(0.45);
    expect(magnitude).toBeLessThan(0.55);
    // The barrel field is overwhelmingly axial (Bz); transverse leakage should be tiny.
    expect(Math.abs(b.z)).toBeCloseTo(magnitude, 2);
  });

  it('scales the spatially varying map when the selected field strength changes', async () => {
    await service.load();
    const atOrigin = (s: MagneticFieldService) => {
      const b = s.field({ x: 0, y: 0, z: 0 });
      return Math.hypot(b.x, b.y, b.z);
    };
    const atFarZ = (s: MagneticFieldService) => {
      const b = s.field({ x: 0, y: 0, z: 400 });
      return Math.hypot(b.x, b.y, b.z);
    };

    const nominal = atOrigin(service);
    service.setFieldStrengthT(2);
    expect(service.fieldStrengthScale).toBeCloseTo(4, 6);
    expect(atOrigin(service) / nominal).toBeCloseTo(4, 2);

    // Far along z the map is weaker, but the scale factor still applies.
    service.setFieldStrengthT(0.5);
    const farNominal = atFarZ(service);
    service.setFieldStrengthT(2);
    expect(atFarZ(service) / farNominal).toBeCloseTo(4, 2);
  });

  it('exposes the raw parsed buffers once loaded, for handing off to the Web Worker', async () => {
    expect(service.getRawBuffers()).toBeNull();
    await service.load();
    const buffers = service.getRawBuffers();
    expect(buffers).not.toBeNull();
    expect(buffers!.solSegments.byteLength).toBeGreaterThan(0);
    expect(buffers!.dipParams.byteLength).toBeGreaterThan(0);
  });

  it('load() is idempotent (concurrent callers await the same fetch)', async () => {
    const [a, b] = await Promise.all([service.load(), service.load()]);
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
    expect(service.isLoaded).toBe(true);
  });
});
