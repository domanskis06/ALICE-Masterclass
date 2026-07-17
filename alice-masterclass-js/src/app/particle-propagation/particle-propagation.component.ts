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
import { MomentumRevealTimingService } from './physics/momentum-reveal-timing.service';
import { Rk4PropagatorService } from './physics/rk4-propagator.service';
import { ParticleDataService, EventRef } from './data/particle-data.service';
import { BufferedTrack, PropagationParticle } from './physics/propagation-types';
import {
  FIELD_STRENGTH_DEFAULT_T,
  FIELD_STRENGTH_EXPERIMENT_MARKERS,
  FIELD_STRENGTH_MAX_T,
  FIELD_STRENGTH_MIN_T,
  FIELD_STRENGTH_STEP_T,
  PROTON_MODEL_PATH,
} from './physics/constants';
import { PropagationScene, PropagationCameraMode } from './scene/propagation-scene';
import { DetectorLoaderService } from './scene/detector-loader.service';
import { CollisionIntro } from './scene/collision-intro';
import { createTrackLines, setTrackLinesResolution } from './scene/track-renderer';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { PropagationTimeline } from './scene/propagation-timeline';
import {
  defaultDetectorPartVisible,
  detectorPartAccentColor,
  setDetectorPartOpacity,
  setDetectorPartVisibility,
} from './scene/detector-appearance';
import {
  buildFieldLines,
  DEFAULT_FIELD_LINEWIDTH,
  setFieldLinesColorRange,
  setFieldLinesOpacity,
  setFieldLinesResolution,
} from './scene/field-line-visualizer';
import { FieldLineDensity } from './physics/field-line-tracer';
import {
  fieldColorbarCssGradient,
  fieldColorRangeForDipoleView,
  fieldColorRangeForStrength,
} from './physics/field-colormap';
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
  /** CSS hex matching the part's GLB signature colour (opacity slider accent). */
  accentColor: string;
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
  /** Same semantics as EventDisplay `sidebarOpened` — false hides the panel fully. */
  sidebarOpened = true;
  /** Left overlay drawer for detector parts + dark mode. */
  leftSidebarOpened = true;
  cameraMode: PropagationCameraMode = 'centered';
  detectorPartsForUi: DetectorPartUiModel[] = [];

  /** CDK overlay panel lives outside the host; class must be applied via panelClass. */
  get eventSelectPanelClass(): string | string[] {
    return this.isDarkMode
      ? ['pp-event-select-panel', 'pp-event-select-panel--dark']
      : 'pp-event-select-panel';
  }

  // --- Native UI state (replaces lil-gui) ---
  eventOptions: EventOption[] = [];
  selectedEventIndex = 0;
  hasStarted = false;
  /**
   * True after field strength or L3 polarity changes while tracks already exist.
   * Replay (not the control itself) re-runs RK4 so the student decides when to restart.
   */
  tracksNeedRecompute = false;
  isPlaying = false;
  currentTimeMs = 0;
  minTimeMs = -1;
  maxTimeMs = 1;
  playbackSpeed = 1;
  /** Field overlay on by default so students see |B|-coloured streamlines. */
  fieldVisible = true;
  /** Dipole-transition bend at the forward (negative-z) detector end. */
  fieldDipoleTransitionVisible = true;
  fieldOpacity = 0.65;
  /** Seed density: sparse ↔ dense (former medium). */
  fieldDensity: FieldLineDensity = 'sparse';
  /** Stored line-width preference (native WebGL lines ignore linewidth). */
  fieldLinewidth = DEFAULT_FIELD_LINEWIDTH;
  /** Selected solenoid plateau |B| (Tesla); scales the Chebyshev map spatially. */
  fieldStrengthT = FIELD_STRENGTH_DEFAULT_T;
  /** L3 solenoid direction: `+1` along +z (nominal), `-1` reversed. */
  solenoidPolarity: 1 | -1 = 1;
  readonly fieldStrengthMinT = FIELD_STRENGTH_MIN_T;
  readonly fieldStrengthMaxT = FIELD_STRENGTH_MAX_T;
  readonly fieldStrengthStepT = FIELD_STRENGTH_STEP_T;
  /** LHC experiment |B| ticks drawn above the field-strength slider. */
  readonly fieldStrengthMarkers = FIELD_STRENGTH_EXPERIMENT_MARKERS.map((m) => ({
    ...m,
    positionPct:
      ((m.tesla - FIELD_STRENGTH_MIN_T) / (FIELD_STRENGTH_MAX_T - FIELD_STRENGTH_MIN_T)) * 100,
  }));
  readonly fieldColorbarGradient = fieldColorbarCssGradient();

  /** Colorbar scale ends (Tesla) — track the selected field strength / dipole view. */
  get fieldColorMinT(): number {
    return this.activeFieldColorRange().minT;
  }

  get fieldColorMaxT(): number {
    return this.activeFieldColorRange().maxT;
  }

  private activeFieldColorRange(): { minT: number; maxT: number } {
    return this.fieldDipoleTransitionVisible
      ? fieldColorRangeForDipoleView(this.fieldStrengthT)
      : fieldColorRangeForStrength(this.fieldStrengthT);
  }

  private scene: PropagationScene | null = null;
  private readonly detectorPartRootByPath = new Map<string, THREE.Object3D>();
  private fieldLines: THREE.Object3D | null = null;
  /** Plateau |B| (T) baked into {@link fieldLines} magnitudes at last full rebuild. */
  private fieldLinesBuiltAtStrengthT = FIELD_STRENGTH_DEFAULT_T;
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
    private readonly momentumRevealTiming: MomentumRevealTimingService,
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
    // Keep the shared field service in sync with this instance's default slider.
    this.magneticField.setFieldStrengthT(this.fieldStrengthT);
  }

  get controlsEnabled(): boolean {
    return this.phase === 'ready' && this.timeline !== null;
  }

  /** Replay stays available after a field change that clears or stale-marks tracks. */
  get replayEnabled(): boolean {
    if (this.isBusy) return false;
    return this.controlsEnabled || (this.hasStarted && this.tracksNeedRecompute);
  }

  get isBusy(): boolean {
    return this.phase === 'loading-field' || this.phase === 'loading-event' || this.phase === 'precomputing';
  }

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
    if (!this.replayEnabled) return;
    if (this.tracksNeedRecompute) {
      this.tracksNeedRecompute = false;
      this.runPrecomputePipeline();
      return;
    }
    if (!this.timeline) return;
    this.currentTimeMs = this.timeline.minTimeMs;
    this.timeline.applyTime(this.currentTimeMs);
    this.isPlaying = true;
    this.lastFrameWallMs = 0;
    this.requestRender();
  }

  onTimeChange(valueMs: number): void {
    this.currentTimeMs = valueMs;
    this.isPlaying = false;
    this.timeline?.applyTime(valueMs);
    this.requestRender();
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
    this.requestRender();
  }

  onDetectorPartOpacity(part: DetectorPartUiModel, value: number | string): void {
    const root = this.detectorPartRootByPath.get(part.assetPath);
    if (!root) return;
    part.opacity = setDetectorPartOpacity(root, Number(value));
    this.requestRender();
  }

  onFieldShowChange(visible: boolean): void {
    this.fieldVisible = visible;
    if (this.fieldLines) this.fieldLines.visible = visible;
    this.requestRender();
  }

  onFieldDipoleTransitionChange(enabled: boolean): void {
    this.fieldDipoleTransitionVisible = enabled;
    this.rebuildFieldVisualization();
  }

  onFieldOpacityChange(opacity: number): void {
    this.fieldOpacity = opacity;
    if (this.fieldLines) setFieldLinesOpacity(this.fieldLines, opacity);
    this.requestRender();
  }

  onFieldDensityChange(dense: boolean): void {
    const next: FieldLineDensity = dense ? 'dense' : 'sparse';
    if (next === this.fieldDensity) return;
    this.fieldDensity = next;
    this.rebuildFieldVisualization();
  }

  onFieldStrengthChange(tesla: number): void {
    const next = Number(tesla);
    if (!Number.isFinite(next) || next === this.magneticField.fieldStrengthT) return;
    this.fieldStrengthT = next;
    this.magneticField.setFieldStrengthT(next);
    // Streamlines follow B̂ — only |B| colours change with the slider. Full Chebyshev
    // re-trace on every tick was freezing the UI (0.5→4 T × dense seeds).
    this.recolorFieldVisualization();
    // Defer RK4 until Replay so adjusting the slider does not interrupt playback.
    if (this.hasStarted) {
      this.tracksNeedRecompute = true;
    }
    this.cdr.markForCheck();
  }

  onSolenoidReversedChange(reversed: boolean): void {
    if (this.isBusy) return;
    const next: 1 | -1 = reversed ? -1 : 1;
    if (next === this.solenoidPolarity) return;
    this.magneticField.setSolenoidPolarity(next);
    this.solenoidPolarity = next;
    this.rebuildFieldVisualization();
    // Opposite B ⇒ opposite curvature; clear stale tracks until the student hits Replay.
    if (this.hasStarted) {
      this.invalidateTracksForFieldChange();
    }
    this.cdr.markForCheck();
  }

  /** Drops visible tracks and pauses playback until Replay re-runs RK4. */
  private invalidateTracksForFieldChange(): void {
    this.isPlaying = false;
    this.lastFrameWallMs = 0;
    this.clearTracks();
    this.timeline = null;
    this.tracksNeedRecompute = true;
    this.requestRender();
  }

  onDarkModeChange(darkMode: boolean): void {
    this.isDarkMode = darkMode;
    this.scene?.setDarkMode(darkMode);
    this.requestRender();
    this.cdr.markForCheck();
  }

  onCameraModeChange(): void {
    this.scene?.setCameraMode(this.cameraMode);
    this.requestRender();
  }

  onFreeCameraChange(enabled: boolean): void {
    this.cameraMode = enabled ? 'free' : 'centered';
    this.onCameraModeChange();
  }

  toggleSidebar(): void {
    this.sidebarOpened = !this.sidebarOpened;
    // Sidebar is an overlay (transform only) — canvas size stays fixed, no resize flash.
  }

  toggleLeftSidebar(): void {
    this.leftSidebarOpened = !this.leftSidebarOpened;
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
        this.detectorPartsForUi = model.parts.map((part) => {
          const visible = defaultDetectorPartVisible(part.assetPath);
          setDetectorPartVisibility(part.root, visible);
          return {
            assetPath: part.assetPath,
            label: part.label,
            visible,
            opacity: this.getPartOpacity(part.root),
            accentColor: detectorPartAccentColor(part.assetPath),
          };
        });
        this.requestRender();
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
      includeDipoleTransition: this.fieldDipoleTransitionVisible,
      colorRange: this.activeFieldColorRange(),
      resolution: {
        width: host?.clientWidth || 1,
        height: host?.clientHeight || 1,
      },
    });
    this.fieldLines.visible = this.fieldVisible;
    this.fieldLinesBuiltAtStrengthT = this.fieldStrengthT;
    this.scene.fieldGroup.add(this.fieldLines);
    this.requestRender();
  }

  /** Cheap |B|-only update for the field-strength slider (no Chebyshev re-trace). */
  private recolorFieldVisualization(): void {
    if (!this.fieldLines) return;
    const builtAt = this.fieldLinesBuiltAtStrengthT;
    const magnitudeScale = builtAt > 0 ? this.fieldStrengthT / builtAt : 1;
    setFieldLinesColorRange(this.fieldLines, this.activeFieldColorRange(), magnitudeScale);
    this.requestRender();
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
    this.tracksNeedRecompute = false;
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
          this.onPrecomputeResult(event.result.tracks, event.result.maxTimeNs, particles);
        }
      },
      error: (err: Error) => {
        if (this.destroyed) return;
        this.onPipelineError(err);
      },
    });
  }

  private async onPrecomputeResult(
    tracks: BufferedTrack[],
    maxTimeNs: number,
    particles: PropagationParticle[]
  ): Promise<void> {
    try {
      const collisionIntro = await this.ensureCollisionIntro();
      if (this.destroyed) return;
      this.clearTracks();

      // Pedagogical |p|-based β_eff stretch for reveal pacing; physical `times` stay intact.
      const revealMaxTimeNs = this.momentumRevealTiming.attachRevealTimes(tracks, particles);
      const timelineMaxNs = revealMaxTimeNs > 0 ? revealMaxTimeNs : maxTimeNs;

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
        timelineMaxNs,
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
    // Idle frames are skipped (demand-based): EventDisplay always RAFs, but
    // with a smaller viewport and no field overlay; here we only redraw when
    // playing, damping, flashing, or `needsRender` (orbit/resize/UI).
    this.ngZone.runOutsideAngular(() => {
      let lastUiSyncMs = 0;
      const step = (nowMs: number) => {
        this.rafId = requestAnimationFrame(step);
        const scene = this.scene;
        if (!scene) return;

        const deltaMs = this.lastFrameWallMs ? nowMs - this.lastFrameWallMs : 0;
        this.lastFrameWallMs = nowMs;

        let dirty = scene.needsRender;
        if (scene.isNavigating()) dirty = true;
        if (this.isPlaying && this.timeline) {
          dirty = true;
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

        if (this.flashRemainingMs > 0) dirty = true;
        if (!dirty) return;

        this.updateCollisionFlash(deltaMs);
        scene.render();
      };
      this.rafId = requestAnimationFrame(step);
    });
  }

  /** Marks the Three.js scene dirty so the next RAF draws a frame. */
  private requestRender(): void {
    if (this.scene) this.scene.needsRender = true;
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
