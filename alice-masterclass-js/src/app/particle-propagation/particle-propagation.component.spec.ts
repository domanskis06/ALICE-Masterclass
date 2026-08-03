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
import { PropagationSessionCacheService } from './propagation-session-cache.service';

/** Procedural Pb nuclei are orthogonal to what this component-level spec is testing. */
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
  origin: 'primary',
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
  origin: 'primary',
};

describe('ParticlePropagationComponent', () => {
  let component: ParticlePropagationComponent;
  let fixture: ComponentFixture<ParticlePropagationComponent>;
  let dialogOpenSpy: jasmine.Spy;
  let precomputeSpy: jasmine.Spy;

  beforeEach(async () => {
    const fakeMagneticField = {
      isLoaded: false,
      fieldStrengthT: 0.5,
      fieldStrengthScale: 1,
      fieldSolenoidPolarity: 1 as 1 | -1,
      load: jasmine.createSpy('load').and.callFake(() => {
        fakeMagneticField.isLoaded = true;
        return Promise.resolve();
      }),
      setFieldStrengthT: jasmine.createSpy('setFieldStrengthT').and.callFake((t: number) => {
        fakeMagneticField.fieldStrengthT = t;
        fakeMagneticField.fieldStrengthScale = t / 0.5;
      }),
      setSolenoidPolarity: jasmine.createSpy('setSolenoidPolarity').and.callFake((p: 1 | -1) => {
        fakeMagneticField.fieldSolenoidPolarity = p;
      }),
      toggleSolenoidPolarity: jasmine.createSpy('toggleSolenoidPolarity').and.callFake(() => {
        fakeMagneticField.fieldSolenoidPolarity =
          fakeMagneticField.fieldSolenoidPolarity === 1 ? -1 : 1;
        return fakeMagneticField.fieldSolenoidPolarity;
      }),
      field: jasmine.createSpy('field').and.returnValue({ x: 0, y: 0, z: 0.5 }),
      getRawBuffers: jasmine.createSpy('getRawBuffers').and.returnValue(null),
    };
    const fakeParticleData = {
      listAvailableEvents: () => [{ event: 0 }, { event: 1 }],
      loadEvent: jasmine.createSpy('loadEvent').and.returnValue(of([fakeParticle])),
    };
    const progressEvent: PrecomputeEvent = { type: 'progress', done: 0, total: 1 };
    const resultEvent: PrecomputeEvent = { type: 'result', result: { tracks: [fakeTrack], maxTimeNs: 1 } };
    precomputeSpy = jasmine.createSpy('precompute').and.returnValue(of(progressEvent, resultEvent));
    const fakeRk4 = { precompute: precomputeSpy };
    // Real GLTF fetches for the detector parts are orthogonal to this component-level spec
    // and, across many tests, needlessly heavy on headless Chrome's software (swiftshader) GL.
    const emptyModel = { group: new THREE.Group(), parts: [] as [] };
    const fakeDetectorLoader = {
      load: () => Promise.resolve(emptyModel),
      loadProgressive: async (
        _scale: number,
        _darkMode: boolean,
        options: {
          onWave: (model: typeof emptyModel, wave: 'core' | 'complete') => void;
          waitBeforeSecondary?: () => Promise<void>;
        }
      ) => {
        options.onWave(emptyModel, 'core');
        await options.waitBeforeSecondary?.();
        options.onWave(emptyModel, 'complete');
        return emptyModel;
      },
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
    TestBed.inject(PropagationSessionCacheService).clearAll();
    fixture = TestBed.createComponent(ParticlePropagationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  /** Boot splash must finish before Start is accepted (`isBusy` while loading). */
  async function waitForBoot(): Promise<void> {
    await flushAsyncChain(12);
    expect(component.showDetectorSplash).toBe(false);
  }

  afterEach(() => {
    fixture.destroy();
    TestBed.inject(PropagationSessionCacheService).clearAll();
  });

  it('shows a detector splash then opens the welcome dialog once assets are ready', async () => {
    expect(component).toBeTruthy();
    expect(component.showDetectorSplash).toBe(true);
    expect(dialogOpenSpy).not.toHaveBeenCalled();

    await waitForBoot();

    expect(dialogOpenSpy).toHaveBeenCalledTimes(1);
    expect(component.phase).toBe('idle');
  });

  it('exposes InstructionsComponent for the toolbar "?" button (InstructionsProvider)', () => {
    expect(component.instructionsComponent).toBe(InstructionsComponent);
  });

  it('onStartAnimation() drives the pipeline through loading-event -> precomputing -> ready', async () => {
    await waitForBoot();
    component.onStartAnimation();
    // Field map was loaded during boot, so the pipeline skips loading-field.
    expect(component.phase).toBe('loading-event');

    await flushAsyncChain();

    expect(precomputeSpy).toHaveBeenCalledTimes(1);
    expect(component.phase).toBe('ready');
  }, 15000);

  it('does not re-kick RK4 when Start is pressed again while the pipeline is in-flight', async () => {
    await waitForBoot();
    component.onStartAnimation();
    expect(component.phase).toBe('loading-event');
    const callsBefore = precomputeSpy.calls.count();
    component.onStartAnimation();
    expect(precomputeSpy.calls.count()).toBe(callsBefore);
    await flushAsyncChain();
    expect(component.phase).toBe('ready');
  }, 15000);

  it('onFieldStrengthChange() updates the field but defers RK4 until Replay', async () => {
    await waitForBoot();
    const magneticField = TestBed.inject(MagneticFieldService) as unknown as {
      setFieldStrengthT: jasmine.Spy;
      fieldStrengthT: number;
    };

    component.onFieldStrengthChange(2);
    expect(component.fieldStrengthT).toBe(2);
    expect(magneticField.setFieldStrengthT).toHaveBeenCalledWith(2);
    expect(precomputeSpy).not.toHaveBeenCalled(); // animation not started yet

    component.onStartAnimation();
    await flushAsyncChain();
    expect(precomputeSpy).toHaveBeenCalledTimes(1);

    component.onFieldStrengthChange(1);
    await flushAsyncChain();
    expect(component.fieldStrengthT).toBe(1);
    expect(precomputeSpy).toHaveBeenCalledTimes(1); // slider alone does not recompute
    // Dipole view is on by default → wide |B| window scaled to 1 T plateau.
    expect(component.fieldColorMinT).toBeCloseTo(0.1, 6);
    expect(component.fieldColorMaxT).toBeCloseTo(1.8, 6);

    component.onReplay();
    await flushAsyncChain();
    expect(precomputeSpy).toHaveBeenCalledTimes(2);
  }, 15000);

  it('onSolenoidReversedChange() clears tracks and defers RK4 until Replay', async () => {
    await waitForBoot();
    const magneticField = TestBed.inject(MagneticFieldService) as unknown as {
      setSolenoidPolarity: jasmine.Spy;
      fieldSolenoidPolarity: 1 | -1;
    };

    component.onStartAnimation();
    await flushAsyncChain();
    expect(component.phase).toBe('ready');
    expect(precomputeSpy).toHaveBeenCalledTimes(1);

    component.onSolenoidReversedChange(true);
    expect(magneticField.setSolenoidPolarity).toHaveBeenCalledWith(-1);
    expect(component.solenoidPolarity).toBe(-1);
    expect(component.tracksNeedRecompute).toBe(true);
    expect(component.replayEnabled).toBe(true);
    expect(component.controlsEnabled).toBe(false); // timeline cleared with tracks
    expect(precomputeSpy).toHaveBeenCalledTimes(1);

    component.onReplay();
    await flushAsyncChain();
    expect(precomputeSpy).toHaveBeenCalledTimes(2);
    expect(component.phase).toBe('ready');
    expect(component.tracksNeedRecompute).toBe(false);
  }, 15000);

  it('onEventChange() swaps beam prep without auto-play and restores the Start button', async () => {
    await waitForBoot();
    component.onStartAnimation();
    await flushAsyncChain();
    expect(component.phase).toBe('ready');
    expect(component.hasStarted).toBe(true);
    expect(component.isPlaying).toBe(true);
    expect(precomputeSpy).toHaveBeenCalledTimes(1);

    component.onEventChange(1);
    expect(component.hasStarted).toBe(false);
    expect(component.isPlaying).toBe(false);
    expect(component.phase).toBe('loading-event');

    await flushAsyncChain();
    expect(precomputeSpy).toHaveBeenCalledTimes(2);
    expect(component.phase).toBe('ready');
    expect(component.hasStarted).toBe(false);
    expect(component.isPlaying).toBe(false);
    expect(component.controlsEnabled).toBe(false);

    component.onStartAnimation();
    expect(component.hasStarted).toBe(true);
    expect(component.isPlaying).toBe(true);
    expect(precomputeSpy).toHaveBeenCalledTimes(2); // tracks already warm
  }, 15000);

  it('ngOnDestroy() tears down the render loop and Three.js scene without throwing', async () => {
    await waitForBoot();
    expect(() => fixture.destroy()).not.toThrow();
  });

  it('revisit restores detector/field from cache but reopens the welcome dialog without tracks', async () => {
    await waitForBoot();
    component.onStartAnimation();
    await flushAsyncChain();
    expect(component.phase).toBe('ready');
    expect(precomputeSpy).toHaveBeenCalledTimes(1);

    const cache = TestBed.inject(PropagationSessionCacheService);
    fixture.destroy();

    expect(cache.hasSceneAssets).toBe(true);
    expect(cache.hasStarted).toBe(false);
    expect(cache.tracks.length).toBe(0);

    dialogOpenSpy.calls.reset();
    fixture = TestBed.createComponent(ParticlePropagationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await flushAsyncChain(4);

    expect(component.showDetectorSplash).toBe(false);
    expect(component.phase).toBe('idle');
    expect(component.hasStarted).toBe(false);
    expect(dialogOpenSpy).toHaveBeenCalledTimes(1);
    expect(precomputeSpy).toHaveBeenCalledTimes(1); // no auto-start / no restore of tracks

    component.onStartAnimation();
    await flushAsyncChain();
    expect(precomputeSpy).toHaveBeenCalledTimes(2);
    expect(component.phase).toBe('ready');
  }, 15000);
});
