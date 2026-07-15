/**
 * UI shell for the Particle Propagation module.
 *
 * Owns Angular concerns (dialogs, DOM refs, native Material controls, the
 * `requestAnimationFrame` loop) and delegates scene/physics to plain TypeScript
 * classes/services. No physics/math lives here (`.cursor/rules/architecture.mdc`).
 */

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  Type,
  ViewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import * as THREE from 'three';
import { Subscription } from 'rxjs';

import { InstructionsProvider } from '../shared/interfaces';
import { MagneticFieldService } from './physics/magnetic-field.service';
import { Rk4PropagatorService } from './physics/rk4-propagator.service';
import { ParticleDataService, EventRef } from './data/particle-data.service';
import { BufferedTrack, PropagationParticle } from './physics/propagation-types';
import { PROTON_MODEL_PATH } from './physics/constants';
import { PropagationScene } from './scene/propagation-scene';
import { DetectorLoaderService } from './scene/detector-loader.service';
import { CollisionIntro } from './scene/collision-intro';
import { createTrackLines, setTrackLinesResolution } from './scene/track-renderer';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { PropagationTimeline } from './scene/propagation-timeline';
import { setDetectorPartOpacity, setDetectorPartVisibility } from './scene/detector-appearance';
import {
  buildFieldLines,
  DEFAULT_FIELD_LINEWIDTH,
  setFieldLinesOpacity,
  setFieldLinesResolution,
  setFieldLinesWidth,
} from './scene/field-line-visualizer';
import { FieldLineDensity } from './physics/field-line-tracer';
import {
  COLLISION_FLASH_DURATION_MS,
  COLLISION_FLASH_PEAK_INTENSITY,
  DEFAULT_NS_PER_MS,
} from './scene/timeline-constants';
import { InstructionsComponent } from './instructions/instructions.component';
import { PropagationWelcomeDialogComponent } from './welcome-dialog/propagation-welcome-dialog.component';

export type ParticlePropagationPhase =
  | 'idle'
  | 'loading-field'
  | 'loading-event'
  | 'precomputing'
  | 'ready'
  | 'error';

/** One row in the VA-style Detector parts panel. */
export interface DetectorPartUiModel {
  assetPath: string;
  label: string;
  visible: boolean;
  opacity: number;
}

export interface EventOption {
  id: number;
  label: string;
}

@Component({
  selector: 'app-particle-propagation',
  templateUrl: './particle-propagation.component.html',
  styleUrls: ['./particle-propagation.component.scss'],
  standalone: false,
})
export class ParticlePropagationComponent implements AfterViewInit, OnDestroy, InstructionsProvider {
  @ViewChild('sceneHost', { static: true }) private sceneHostRef!: ElementRef<HTMLElement>;
  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  instructionsComponent: Type<unknown> = InstructionsComponent;

  phase: ParticlePropagationPhase = 'idle';
  progressDone = 0;
  progressTotal = 0;
  errorMessage: string | null = null;
  isDarkMode = true;
  detectorPartsForUi: DetectorPartUiModel[] = [];

  // --- Native UI state (replaces lil-gui) ---
  eventOptions: EventOption[] = [];
  selectedEventIndex = 0;
  hasStarted = false;
  isPlaying = false;
  currentTimeMs = 0;
  minTimeMs = -1;
  maxTimeMs = 1;
  playbackSpeed = 1;
  fieldVisible = true;
  fieldOpacity = 0.9;
  /**
   * 0 = sparse, 1 = medium (default), 2 = dense — drives {@link fieldDensity}.
   * Medium is denser than the original two-step slider's "medium".
   */
  fieldDensityLevel = 1;
  /** Fat-line width in CSS pixels (LineMaterial.linewidth). */
  fieldLinewidth = DEFAULT_FIELD_LINEWIDTH;

  private scene: PropagationScene | null = null;
  private readonly detectorPartRootByPath = new Map<string, THREE.Object3D>();
  private fieldLines: THREE.Object3D | null = null;
  private fieldDensity: FieldLineDensity = 'medium';
  private collisionIntroPromise: Promise<CollisionIntro> | null = null;
  private timeline: PropagationTimeline | null = null;
  private tracks: BufferedTrack[] = [];
  private lines: Line2[] = [];
  private flashLight: THREE.PointLight | null = null;
  private flashRemainingMs = 0;

  private eventRefs: EventRef[] = [];
  private lastFrameWallMs = 0;
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private precomputeSub: Subscription | null = null;
  private destroyed = false;

  constructor(
    private readonly magneticField: MagneticFieldService,
    private readonly rk4Propagator: Rk4PropagatorService,
    private readonly particleData: ParticleDataService,
    private readonly detectorLoader: DetectorLoaderService,
    private readonly dialog: MatDialog,
    private readonly cdr: ChangeDetectorRef,
    private readonly ngZone: NgZone
  ) {
    this.eventRefs = this.particleData.listAvailableEvents();
    this.eventOptions = this.eventRefs.map((ref, index) => ({
      id: index,
      label: `Event ${ref.event + 1}`,
    }));
    this.selectedEventIndex = this.eventOptions[0]?.id ?? 0;
  }

  get controlsEnabled(): boolean {
    return this.phase === 'ready' && this.timeline !== null;
  }

  get isBusy(): boolean {
    return this.phase === 'loading-field' || this.phase === 'loading-event' || this.phase === 'precomputing';
  }

  readonly densityLabel = (value: number): string => {
    if (value >= 2) return 'Dense';
    if (value >= 1) return 'Medium';
    return 'Sparse';
  };

  ngAfterViewInit(): void {
    this.scene = new PropagationScene(this.canvasRef.nativeElement);
    this.isDarkMode = this.scene.darkMode;

    this.loadDetector();
    this.loadFieldVisualization();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(this.sceneHostRef.nativeElement);
    }
    this.onResize();

    this.startRenderLoop();
    this.openWelcomeDialog();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopRenderLoop();
    this.precomputeSub?.unsubscribe();
    this.resizeObserver?.disconnect();
    this.clearTracks();
    void this.collisionIntroPromise?.then((intro) => intro.dispose());
    this.scene?.dispose();
  }

  // ---------------------------------------------------------------------
  // Native UI handlers
  // ---------------------------------------------------------------------

  onStartAnimation(): void {
    if (this.isBusy) return;
    this.hasStarted = true;
    this.runPrecomputePipeline();
  }

  onPlay(): void {
    if (!this.controlsEnabled) return;
    this.isPlaying = true;
    this.lastFrameWallMs = 0;
  }

  onPause(): void {
    this.isPlaying = false;
    this.lastFrameWallMs = 0;
  }

  onReplay(): void {
    if (!this.controlsEnabled || !this.timeline) return;
    this.currentTimeMs = this.timeline.minTimeMs;
    this.timeline.applyTime(this.currentTimeMs);
    this.isPlaying = true;
    this.lastFrameWallMs = 0;
  }

  onTimeChange(valueMs: number): void {
    this.currentTimeMs = valueMs;
    this.isPlaying = false;
    this.timeline?.applyTime(valueMs);
  }

  onEventChange(index: number): void {
    this.selectedEventIndex = index;
    if (this.hasStarted) {
      this.runPrecomputePipeline();
    }
  }

  onDetectorPartVisibility(part: DetectorPartUiModel, visible: boolean): void {
    part.visible = visible;
    const root = this.detectorPartRootByPath.get(part.assetPath);
    if (root) setDetectorPartVisibility(root, visible);
  }

  onDetectorPartOpacity(part: DetectorPartUiModel, value: number | string): void {
    const root = this.detectorPartRootByPath.get(part.assetPath);
    if (!root) return;
    part.opacity = setDetectorPartOpacity(root, Number(value));
  }

  onFieldShowChange(visible: boolean): void {
    this.fieldVisible = visible;
    if (this.fieldLines) this.fieldLines.visible = visible;
  }

  onFieldOpacityChange(opacity: number): void {
    this.fieldOpacity = opacity;
    if (this.fieldLines) setFieldLinesOpacity(this.fieldLines, opacity);
  }

  onFieldDensityLevelChange(level: number): void {
    this.fieldDensityLevel = level;
    this.fieldDensity = level >= 2 ? 'dense' : level >= 1 ? 'medium' : 'sparse';
    this.rebuildFieldVisualization();
  }

  onFieldLinewidthChange(width: number): void {
    this.fieldLinewidth = width;
    if (this.fieldLines) setFieldLinesWidth(this.fieldLines, width);
  }

  onDarkModeChange(darkMode: boolean): void {
    this.isDarkMode = darkMode;
    this.scene?.setDarkMode(darkMode);
    this.cdr.markForCheck();
  }

  // ---------------------------------------------------------------------
  // Detector / field loading
  // ---------------------------------------------------------------------

  private loadDetector(): void {
    this.detectorLoader
      .load(PropagationScene.objectScale, this.isDarkMode)
      .then((model) => {
        if (this.destroyed || !this.scene) return;
        this.scene.detectorGroup.add(model.group);
        this.detectorPartRootByPath.clear();
        for (const part of model.parts) {
          this.detectorPartRootByPath.set(part.assetPath, part.root);
        }
        this.detectorPartsForUi = model.parts.map((part) => ({
          assetPath: part.assetPath,
          label: part.label,
          visible: true,
          opacity: this.getPartOpacity(part.root),
        }));
        this.cdr.markForCheck();
      })
      .catch((err) => console.error('[ParticlePropagation] detector load failed', err));
  }

  private loadFieldVisualization(): void {
    this.magneticField
      .load()
      .then(() => {
        if (this.destroyed) return;
        this.rebuildFieldVisualization();
      })
      .catch((err) => console.error('[ParticlePropagation] field visualization failed', err));
  }

  private rebuildFieldVisualization(): void {
    if (!this.scene || !this.magneticField.isLoaded) return;
    if (this.fieldLines) {
      this.scene.fieldGroup.remove(this.fieldLines);
      this.disposeObject(this.fieldLines);
      this.fieldLines = null;
    }
    const host = this.sceneHostRef?.nativeElement;
    this.fieldLines = buildFieldLines((pos) => this.magneticField.field(pos), {
      scale: PropagationScene.objectScale,
      density: this.fieldDensity,
      opacity: this.fieldOpacity,
      linewidth: this.fieldLinewidth,
      resolution: {
        width: host?.clientWidth || 1,
        height: host?.clientHeight || 1,
      },
    });
    this.fieldLines.visible = this.fieldVisible;
    this.scene.fieldGroup.add(this.fieldLines);
  }

  private getPartOpacity(root: THREE.Object3D): number {
    let found: number | null = null;
    root.traverse((o) => {
      if (found !== null || !(o as THREE.Mesh).isMesh) return;
      const raw = (o as THREE.Mesh).material;
      const mat = Array.isArray(raw) ? raw[0] : raw;
      const base = (mat as THREE.Material | undefined)?.userData?.['baseOpacity'];
      if (typeof base === 'number' && Number.isFinite(base)) found = base;
    });
    return found ?? 0.75;
  }

  private disposeObject(root: THREE.Object3D): void {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
  }

  private openWelcomeDialog(): void {
    this.dialog
      .open(PropagationWelcomeDialogComponent, { width: '560px', autoFocus: true })
      .afterClosed()
      .subscribe((start: boolean | undefined) => {
        if (start === true) this.onStartAnimation();
      });
  }

  // ---------------------------------------------------------------------
  // Precompute pipeline
  // ---------------------------------------------------------------------

  private runPrecomputePipeline(): void {
    this.precomputeSub?.unsubscribe();
    this.errorMessage = null;
    this.phase = 'loading-field';
    this.isPlaying = false;
    this.cdr.markForCheck();

    const fieldReady = this.magneticField.isLoaded ? Promise.resolve() : this.magneticField.load();

    fieldReady
      .then(() => {
        if (this.destroyed) return Promise.reject(new Error('cancelled'));
        this.phase = 'loading-event';
        this.cdr.markForCheck();
        const ref = this.eventRefs[this.selectedEventIndex] ?? { event: 0 };
        return this.loadEventParticles(ref);
      })
      .then((particles) => {
        if (this.destroyed) return;
        this.precomputeTrajectories(particles);
      })
      .catch((err: Error) => {
        if (this.destroyed) return;
        this.onPipelineError(err);
      });
  }

  private loadEventParticles(ref: EventRef): Promise<PropagationParticle[]> {
    return new Promise((resolve, reject) => {
      this.particleData.loadEvent(ref.event).subscribe({
        next: resolve,
        error: reject,
      });
    });
  }

  private precomputeTrajectories(particles: PropagationParticle[]): void {
    this.phase = 'precomputing';
    this.progressDone = 0;
    this.progressTotal = particles.length;
    this.cdr.markForCheck();

    this.precomputeSub = this.rk4Propagator.precompute(particles).subscribe({
      next: (event) => {
        if (this.destroyed) return;
        if (event.type === 'progress') {
          this.progressDone = event.done;
          this.progressTotal = event.total;
          this.cdr.markForCheck();
        } else {
          this.onPrecomputeResult(event.result.tracks, event.result.maxTimeNs);
        }
      },
      error: (err: Error) => {
        if (this.destroyed) return;
        this.onPipelineError(err);
      },
    });
  }

  private async onPrecomputeResult(tracks: BufferedTrack[], maxTimeNs: number): Promise<void> {
    try {
      const collisionIntro = await this.ensureCollisionIntro();
      if (this.destroyed) return;
      this.clearTracks();

      this.tracks = tracks;
      const host = this.sceneHostRef?.nativeElement;
      this.lines = createTrackLines(tracks, PropagationScene.objectScale, {
        resolution: {
          width: host?.clientWidth || 1,
          height: host?.clientHeight || 1,
        },
      });
      this.scene?.tracksGroup.add(...this.lines);

      this.timeline = new PropagationTimeline(
        collisionIntro,
        this.scene!.tracksGroup,
        this.tracks,
        this.lines,
        maxTimeNs,
        { nsPerMs: DEFAULT_NS_PER_MS, onCollisionMoment: () => this.triggerCollisionFlash() }
      );
      this.timeline.reset();
      this.minTimeMs = this.timeline.minTimeMs;
      this.maxTimeMs = this.timeline.maxTimeMs;
      this.currentTimeMs = this.timeline.minTimeMs;

      this.phase = 'ready';
      this.isPlaying = true;
      this.lastFrameWallMs = 0;
      this.cdr.markForCheck();
    } catch (err) {
      if (!this.destroyed) this.onPipelineError(err as Error);
    }
  }

  private ensureCollisionIntro(): Promise<CollisionIntro> {
    if (!this.collisionIntroPromise) {
      this.collisionIntroPromise = CollisionIntro.create(PROTON_MODEL_PATH);
      this.collisionIntroPromise.then((intro) => {
        if (!this.destroyed) this.scene?.introGroup.add(intro.group);
      });
    }
    return this.collisionIntroPromise;
  }

  private onPipelineError(err: Error): void {
    console.error('[ParticlePropagation] precompute pipeline failed', err);
    this.phase = 'error';
    this.errorMessage = err?.message ?? String(err);
    this.hasStarted = false;
    this.cdr.markForCheck();
  }

  private clearTracks(): void {
    for (const line of this.lines) {
      line.geometry.dispose();
      const material = line.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
    this.scene?.tracksGroup.clear();
    this.lines = [];
    this.tracks = [];
  }

  // ---------------------------------------------------------------------
  // Render loop
  // ---------------------------------------------------------------------

  private startRenderLoop(): void {
    // Keep the RAF loop outside Angular's zone so per-frame time scrubbing
    // doesn't re-check the Material tree every frame. UI sync is throttled.
    this.ngZone.runOutsideAngular(() => {
      let lastUiSyncMs = 0;
      const step = (nowMs: number) => {
        this.rafId = requestAnimationFrame(step);
        const deltaMs = this.lastFrameWallMs ? nowMs - this.lastFrameWallMs : 0;
        this.lastFrameWallMs = nowMs;

        if (this.isPlaying && this.timeline) {
          const next = this.currentTimeMs + deltaMs * this.playbackSpeed;
          this.currentTimeMs = Math.min(next, this.timeline.maxTimeMs);
          this.timeline.applyTime(this.currentTimeMs);
          if (this.currentTimeMs >= this.timeline.maxTimeMs) {
            this.isPlaying = false;
            this.ngZone.run(() => this.cdr.markForCheck());
          } else if (nowMs - lastUiSyncMs > 100) {
            lastUiSyncMs = nowMs;
            this.ngZone.run(() => this.cdr.markForCheck());
          }
        }

        this.updateCollisionFlash(deltaMs);
        this.scene?.render();
      };
      this.rafId = requestAnimationFrame(step);
    });
  }

  private stopRenderLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private triggerCollisionFlash(): void {
    this.flashRemainingMs = COLLISION_FLASH_DURATION_MS;
    if (!this.flashLight) {
      this.flashLight = new THREE.PointLight(0xfff2cc, 0, 5);
      this.scene?.scene.add(this.flashLight);
    }
    this.flashLight.intensity = COLLISION_FLASH_PEAK_INTENSITY;
  }

  private updateCollisionFlash(deltaMs: number): void {
    if (!this.flashLight || this.flashRemainingMs <= 0) return;
    this.flashRemainingMs = Math.max(0, this.flashRemainingMs - deltaMs);
    this.flashLight.intensity =
      COLLISION_FLASH_PEAK_INTENSITY * (this.flashRemainingMs / COLLISION_FLASH_DURATION_MS);
  }

  private onResize(): void {
    const host = this.sceneHostRef?.nativeElement;
    if (!host || !this.scene) return;
    this.scene.resize(host.clientWidth, host.clientHeight);
    if (this.fieldLines) {
      setFieldLinesResolution(this.fieldLines, host.clientWidth, host.clientHeight);
    }
    if (this.lines.length > 0) {
      setTrackLinesResolution(this.lines, host.clientWidth, host.clientHeight);
    }
  }
}
