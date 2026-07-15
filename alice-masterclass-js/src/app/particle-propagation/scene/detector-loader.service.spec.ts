import { TestBed } from '@angular/core/testing';
import * as THREE from 'three';

import { DetectorLoaderService } from './detector-loader.service';

describe('DetectorLoaderService', () => {
  let service: DetectorLoaderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DetectorLoaderService);
  });

  it('delegates to loadDetectorModel(), loading the real default detector parts', async () => {
    const model = await service.load(1e-2);
    expect(model.group).toBeInstanceOf(THREE.Group);
    expect(model.group.children.length).toBe(8);
    expect(model.parts.length).toBe(8);
  }, 20000);
});
