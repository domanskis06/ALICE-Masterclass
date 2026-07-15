import { TestBed } from '@angular/core/testing';
import * as THREE from 'three';

import { DetectorLoaderService } from './detector-loader.service';

describe('DetectorLoaderService', () => {
  let service: DetectorLoaderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DetectorLoaderService);
  });

  it('is injectable and delegates load() to loadDetectorModel for the given paths', async () => {
    // Empty path list — full 8-GLB coverage lives in detector-loader.spec.ts.
    // Re-loading every detector part here used to disconnect ChromeHeadless in CI.
    const model = await service.load(1e-2, true, []);
    expect(model.group).toBeInstanceOf(THREE.Group);
    expect(model.group.children.length).toBe(0);
    expect(model.parts.length).toBe(0);
  });
});
