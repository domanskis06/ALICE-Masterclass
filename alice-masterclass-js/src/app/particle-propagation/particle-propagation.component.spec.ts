import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import * as THREE from 'three';

import { AngularModule } from '../shared/angular.module';
import { SharedModule } from '../shared/shared.module';

import { MagneticFieldService } from './physics/magnetic-field.service';
import { Rk4PropagatorService, PrecomputeEvent } from './physics/rk4-propagator.service';
import { ParticleDataService } from './data/particle-data.service';
import { BufferedTrack, PropagationParticle } from './physics/propagation-types';
import { CollisionIntro } from './scene/collision-intro';
import { DetectorLoaderService } from './scene/detector-loader.service';
import { InstructionsComponent } from './instructions/instructions.component';
import { ParticlePropagationComponent } from './particle-propagation.component';

/** Real fetch of `proton.glb` is orthogonal to what this component-level spec is testing. */
function stubCollisionIntro(): CollisionIntro {
  return {
    group: new THREE.Group(),
    update: () => undefined,
    reset: () => undefined,
    dispose: () => undefined,
  } as unknown as CollisionIntro;
}

/** Yields a handful of micro+macrotask turns without ever waiting on NgZone "stability" (the
 * component's own `requestAnimationFrame` render loop never lets the zone go idle). */
async function flushAsyncChain(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

const fakeParticle: PropagationParticle = {
  id: 'track-0',
  vertex: { x: 0, y: 0, z: 0 },
  momentum: { x: 0, y: 0, z: 1 },
  charge: 1,
  mass: 0.938,
  energy: 1.2,
};

const fakeTrack: BufferedTrack = {
  particleId: 'track-0',
  positions: new Float32Array([0, 0, 0, 0, 0, 1]),
  times: new Float32Array([0, 1]),
  pointCount: 2,
  charge: 1,
};

describe('ParticlePropagationComponent', () => {
  let component: ParticlePropagationComponent;
  let fixture: ComponentFixture<ParticlePropagationComponent>;
  let dialogOpenSpy: jasmine.Spy;
  let precomputeSpy: jasmine.Spy;

  beforeEach(async () => {
    const fakeMagneticField = {
      isLoaded: false,
      load: jasmine.createSpy('load').and.returnValue(Promise.resolve()),
    };
    const fakeParticleData = {
      listAvailableEvents: () => [{ event: 0 }, { event: 1 }],
      loadEvent: jasmine.createSpy('loadEvent').and.returnValue(of([fakeParticle])),
    };
    const progressEvent: PrecomputeEvent = { type: 'progress', done: 0, total: 1 };
    const resultEvent: PrecomputeEvent = { type: 'result', result: { tracks: [fakeTrack], maxTimeNs: 1 } };
    precomputeSpy = jasmine.createSpy('precompute').and.returnValue(of(progressEvent, resultEvent));
    const fakeRk4 = { precompute: precomputeSpy };
    // Real GLTF fetches for the 8 detector parts are orthogonal to this component-level spec
    // and, across many tests, needlessly heavy on headless Chrome's software (swiftshader) GL.
    const fakeDetectorLoader = {
      load: () => Promise.resolve({ group: new THREE.Group(), parts: [] }),
    };

    await TestBed.configureTestingModule({
      declarations: [ParticlePropagationComponent, InstructionsComponent],
      imports: [AngularModule, SharedModule, TranslateModule.forRoot()],
      providers: [
        { provide: MagneticFieldService, useValue: fakeMagneticField },
        { provide: ParticleDataService, useValue: fakeParticleData },
        { provide: Rk4PropagatorService, useValue: fakeRk4 },
        { provide: DetectorLoaderService, useValue: fakeDetectorLoader },
      ],
    }).compileComponents();

    const dialog = TestBed.inject(MatDialog);
    // Welcome dialog never auto-starts the animation in these tests (result === undefined).
    dialogOpenSpy = spyOn(dialog, 'open').and.returnValue({ afterClosed: () => of(undefined) } as any);
    spyOn(CollisionIntro, 'create').and.returnValue(Promise.resolve(stubCollisionIntro()));
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ParticlePropagationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('creates the component, its scene, and opens the welcome dialog once', () => {
    expect(component).toBeTruthy();
    expect(dialogOpenSpy).toHaveBeenCalledTimes(1);
    expect(component.phase).toBe('idle');
  });

  it('exposes InstructionsComponent for the toolbar "?" button (InstructionsProvider)', () => {
    expect(component.instructionsComponent).toBe(InstructionsComponent);
  });

  it('onStartAnimation() drives the pipeline through loading-field -> loading-event -> precomputing -> ready', async () => {
    component.onStartAnimation();
    expect(component.phase).toBe('loading-field');

    await flushAsyncChain();

    expect(precomputeSpy).toHaveBeenCalledTimes(1);
    expect(component.phase).toBe('ready');
  }, 15000);

  it('does not restart an already in-flight precompute pipeline', () => {
    component.onStartAnimation();
    expect(component.phase).toBe('loading-field');
    component.onStartAnimation();
    expect(precomputeSpy).not.toHaveBeenCalled(); // still stuck at loading-field; second call is a no-op.
  });

  it('ngOnDestroy() tears down the render loop and Three.js scene without throwing', () => {
    expect(() => fixture.destroy()).not.toThrow();
  });
});
