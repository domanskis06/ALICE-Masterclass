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
import { attachDeferredLowLods, DetectorModel } from './scene/detector-loader';
import { CollisionIntro } from './scene/collision-intro';
import { createTrackLines, setTrackLinesResolution } from './scene/track-renderer';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { PropagationTimeline } from './scene/propagation-timeline';
import {
  defaultDetectorPartVisible,
  defaultOpacityForAsset,
  detectorPartAccentColor,
  isOuterMagnet,
  setDetectorPartOpacity,
  setDetectorPartVisibility,
} from './scene/detector-appearance';
import {
  buildFieldLines,
  DEFAULT_FIELD_LINEWIDTH,
  DEFAULT_FIELD_OPACITY,
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
import { PropagationSessionCacheService } from './propagation-session-cache.service';

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
  /** Splash until ITS/TPC/L3 paint and the welcome dialog can open. */
  showDetectorSplash = true;
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
  fieldOpacity = DEFAULT_FIELD_OPACITY;
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
  private detectorLoadAbort: AbortController | null = null;
  private welcomeDialogOpened = false;
  /** Owned detector assembly (also stored in {@link PropagationSessionCacheService}). */
  private detectorModel: DetectorModel | null = null;

  constructor(
    private readonly magneticField: MagneticFieldService,
    private readonly rk4Propagator: Rk4PropagatorService,
    private readonly momentumRevealTiming: MomentumRevealTimingService,
    private readonly particleData: ParticleDataService,
    private readonly detectorLoader: DetectorLoaderService,
    private readonly sessionCache: PropagationSessionCacheService,
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
    this.magneticField.setFieldStrengthT(this.fieldStrengthT);
    // Warm cache → no boot splash; set before the first CD to avoid NG0100.
    if (this.sessionCache.hasSceneAssets) {
      this.showDetectorSplash = false;
    }
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
    return (
      this.showDetectorSplash ||
      this.phase === 'loading-field' ||
      this.phase === 'loading-event' ||
      this.phase === 'precomputing'
    );
  }

  ngAfterViewInit(): void {
    this.scene = new PropagationScene(this.canvasRef.nativeElement);
    this.isDarkMode = this.scene.darkMode;

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(this.sceneHostRef.nativeElement);
    }
    this.onResize();
    this.startRenderLoop();

    if (this.sessionCache.hasSceneAssets) {
      this.restoreSessionFromCache();
    } else {
      void this.bootLoadSceneAssets();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.detectorLoadAbort?.abort();
    this.detectorLoadAbort = null;
    this.stopRenderLoop();
    this.precomputeSub?.unsubscribe();
    this.resizeObserver?.disconnect();
    this.persistSessionToCache();
    // Renderer only — detector / field / intro geometries stay alive in the session cache.
    this.scene?.dispose();
    this.scene = null;
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
    if (isOuterMagnet(part.assetPath)) {
      // L3 visibility is owned by the scene (auto-hide on orbit / near-TRD zoom).
      this.scene?.setOuterMagnetUserVisible(visible);
    } else if (root) {
      setDetectorPartVisibility(root, visible);
    }
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

  /**
   * Cold boot: splash until the full detector, Melax far-LODs, field map, and
   * streamlines are ready — then open the welcome dialog (Start runs instantly).
   */
  private async bootLoadSceneAssets(): Promise<void> {
    this.showDetectorSplash = true;
    this.cdr.markForCheck();

    try {
      await Promise.all([this.loadDetectorFully(), this.loadFieldVisualizationFully(), this.ensureCollisionIntro()]);
      if (this.destroyed) return;
      this.showDetectorSplash = false;
      this.cdr.markForCheck();
      this.requestRender();
      this.openWelcomeDialogOnce();
    } catch (err) {
      if (this.destroyed) return;
      console.error('[ParticlePropagation] boot load failed', err);
      this.showDetectorSplash = false;
      this.phase = 'error';
      this.errorMessage = err instanceof Error ? err.message : String(err);
      this.cdr.markForCheck();
    }
  }

  private loadDetectorFully(): Promise<void> {
    this.detectorLoadAbort?.abort();
    this.detectorLoadAbort = new AbortController();
    const signal = this.detectorLoadAbort.signal;

    return new Promise((resolve, reject) => {
      let settled = false;
      const settleOk = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };

      this.detectorLoader
        .loadProgressive(PropagationScene.objectScale, this.isDarkMode, {
          signal,
          deferLowLod: true,
          animateReveal: true,
          onRevealFrame: () => this.requestRender(),
          onPart: (model) => {
            if (this.destroyed || !this.scene || signal.aborted) return;
            this.applyDetectorModel(model);
            if (model.group.parent !== this.scene.detectorGroup) {
              this.scene.detectorGroup.add(model.group);
            }
          },
          onWave: (model, wave) => {
            if (this.destroyed || !this.scene || signal.aborted) return;
            this.applyDetectorModel(model);
            if (model.group.parent !== this.scene.detectorGroup) {
              this.scene.detectorGroup.add(model.group);
            }
            if (wave === 'complete') {
              attachDeferredLowLods(model.group);
              this.requestRender();
              settleOk();
            }
          },
        })
        .then((model) => {
          if (signal.aborted) return;
          if (!settled) {
            if (model.group.parent !== this.scene?.detectorGroup && this.scene) {
              this.scene.detectorGroup.add(model.group);
            }
            attachDeferredLowLods(model.group);
            settleOk();
          }
        })
        .catch((err) => {
          if (signal.aborted) return;
          if (!settled) {
            settled = true;
            reject(err);
          }
        });
    });
  }

  private applyDetectorModel(model: DetectorModel): void {
    this.detectorModel = model;
    this.detectorPartRootByPath.clear();
    for (const part of model.parts) {
      this.detectorPartRootByPath.set(part.assetPath, part.root);
    }
    this.detectorPartsForUi = model.parts.map((part) => {
      const visible = defaultDetectorPartVisible(part.assetPath);
      if (isOuterMagnet(part.assetPath)) {
        // Preference only — root may not be under detectorGroup yet; visibility
        // is applied on the next render() / after the group is attached.
        this.scene?.setOuterMagnetUserVisible(visible);
      } else {
        setDetectorPartVisibility(part.root, visible);
      }
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
  }

  private async loadFieldVisualizationFully(): Promise<void> {
    await this.magneticField.load();
    if (this.destroyed) return;
    this.rebuildFieldVisualization();
  }

  private rebuildFieldVisualization(): void {
    if (!this.scene || !this.magneticField.isLoaded) return;
    if (this.fieldLines) {
      this.scene.fieldGroup.remove(this.fieldLines);
      if (this.sessionCache.fieldLines === this.fieldLines) {
        this.sessionCache.fieldLines = null;
      }
      // Drop previous streamlines fully — not shared with the session cache after rebuild.
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

  private openWelcomeDialogOnce(): void {
    if (this.destroyed || this.welcomeDialogOpened) return;
    this.welcomeDialogOpened = true;
    this.openWelcomeDialog();
  }

  // ---------------------------------------------------------------------
  // Session cache (survive route leave / re-enter)
  // ---------------------------------------------------------------------

  private persistSessionToCache(): void {
    const cache = this.sessionCache;

    if (this.detectorModel) {
      this.detectorModel.group.removeFromParent();
      cache.detectorModel = this.detectorModel;
      cache.detectorPartsForUi = this.detectorPartsForUi.map((p) => ({ ...p }));
    }

    if (this.fieldLines) {
      this.fieldLines.removeFromParent();
      cache.fieldLines = this.fieldLines;
      cache.fieldLinesBuiltAtStrengthT = this.fieldLinesBuiltAtStrengthT;
      this.fieldLines = null;
    }

    if (this.collisionIntroPromise || this.sessionCache.collisionIntro) {
      this.sessionCache.collisionIntro?.group.removeFromParent();
    }

    // Keep detector + field + UI prefs warm; drop tracks so the next visit
    // always gets the welcome dialog and a fresh RK4 / animation from t=0.
    cache.clearTracksOnly();
    cache.ui = {
      selectedEventIndex: this.selectedEventIndex,
      isDarkMode: this.isDarkMode,
      cameraMode: this.cameraMode,
      fieldVisible: this.fieldVisible,
      fieldDipoleTransitionVisible: this.fieldDipoleTransitionVisible,
      fieldOpacity: this.fieldOpacity,
      fieldDensity: this.fieldDensity,
      fieldLinewidth: this.fieldLinewidth,
      fieldStrengthT: this.fieldStrengthT,
      solenoidPolarity: this.solenoidPolarity,
      playbackSpeed: this.playbackSpeed,
    };

    // Dispose only fat-line GPU resources; BufferedTrack payloads are not kept.
    this.disposeTrackLinesOnly();
    this.timeline = null;
    this.detectorModel = null;
  }

  private restoreSessionFromCache(): void {
    const cache = this.sessionCache;
    const scene = this.scene!;
    const ui = cache.ui;

    if (ui) {
      this.selectedEventIndex = ui.selectedEventIndex;
      this.cameraMode = ui.cameraMode;
      this.fieldVisible = ui.fieldVisible;
      this.fieldDipoleTransitionVisible = ui.fieldDipoleTransitionVisible;
      // Opacity always restarts at defaults — do not restore last-visit slider values.
      this.fieldOpacity = DEFAULT_FIELD_OPACITY;
      this.fieldDensity = ui.fieldDensity;
      this.fieldLinewidth = ui.fieldLinewidth;
      this.fieldStrengthT = ui.fieldStrengthT;
      this.solenoidPolarity = ui.solenoidPolarity;
      this.playbackSpeed = ui.playbackSpeed;
      this.magneticField.setFieldStrengthT(ui.fieldStrengthT);
      this.magneticField.setSolenoidPolarity(ui.solenoidPolarity);
      if (ui.isDarkMode !== this.isDarkMode) {
        this.isDarkMode = ui.isDarkMode;
        scene.setDarkMode(ui.isDarkMode);
      }
      scene.setCameraMode(ui.cameraMode);
    }

    if (cache.detectorModel) {
      this.applyDetectorModel(cache.detectorModel);
      if (cache.detectorPartsForUi) {
        this.detectorPartsForUi = cache.detectorPartsForUi.map((p) => {
          const opacity = defaultOpacityForAsset(p.assetPath);
          return { ...p, opacity };
        });
        for (const part of this.detectorPartsForUi) {
          const root = this.detectorPartRootByPath.get(part.assetPath);
          if (!root) continue;
          if (isOuterMagnet(part.assetPath)) {
            scene.setOuterMagnetUserVisible(part.visible);
          } else {
            setDetectorPartVisibility(root, part.visible);
          }
          setDetectorPartOpacity(root, part.opacity);
        }
      }
      scene.detectorGroup.add(cache.detectorModel.group);
      this.detectorModel = cache.detectorModel;
    }

    if (cache.fieldLines) {
      this.fieldLines = cache.fieldLines;
      this.fieldLinesBuiltAtStrengthT = cache.fieldLinesBuiltAtStrengthT;
      this.fieldLines.visible = this.fieldVisible;
      setFieldLinesOpacity(this.fieldLines, this.fieldOpacity);
      const builtAt = this.fieldLinesBuiltAtStrengthT;
      const magnitudeScale = builtAt > 0 ? this.fieldStrengthT / builtAt : 1;
      setFieldLinesColorRange(this.fieldLines, this.activeFieldColorRange(), magnitudeScale);
      scene.fieldGroup.add(this.fieldLines);
    }

    if (cache.collisionIntro) {
      this.collisionIntroPromise = Promise.resolve(cache.collisionIntro);
      scene.introGroup.add(cache.collisionIntro.group);
    }

    this.showDetectorSplash = false;

    // Scene assets are warm, but every revisit starts idle with the welcome /
    // Start dialog — tracks are never restored across navigations.
    this.hasStarted = false;
    this.tracks = [];
    this.tracksNeedRecompute = false;
    this.timeline = null;
    this.minTimeMs = 0;
    this.maxTimeMs = 1;
    this.currentTimeMs = 0;
    this.isPlaying = false;
    this.phase = 'idle';
    // Defer dialog past the current CD cycle (opened from ngAfterViewInit).
    queueMicrotask(() => {
      if (!this.destroyed) this.openWelcomeDialogOnce();
    });

    this.requestRender();
    this.cdr.markForCheck();
  }

  // ---------------------------------------------------------------------
  // Precompute pipeline
  // ---------------------------------------------------------------------

  private runPrecomputePipeline(): void {
    this.precomputeSub?.unsubscribe();
    this.errorMessage = null;
    this.tracksNeedRecompute = false;
    this.phase = this.magneticField.isLoaded ? 'loading-event' : 'loading-field';
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
    if (this.sessionCache.collisionIntro) {
      const intro = this.sessionCache.collisionIntro;
      if (this.scene && intro.group.parent !== this.scene.introGroup) {
        this.scene.introGroup.add(intro.group);
      }
      this.collisionIntroPromise = Promise.resolve(intro);
      return this.collisionIntroPromise;
    }
    if (!this.collisionIntroPromise) {
      this.collisionIntroPromise = CollisionIntro.create(PROTON_MODEL_PATH).then((intro) => {
        this.sessionCache.collisionIntro = intro;
        if (!this.destroyed) this.scene?.introGroup.add(intro.group);
        return intro;
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

  /** Disposes Line2 GPU resources only; keeps {@link tracks} payloads. */
  private disposeTrackLinesOnly(): void {
    for (const line of this.lines) {
      line.geometry.dispose();
      const material = line.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
    this.scene?.tracksGroup.clear();
    this.lines = [];
  }

  private clearTracks(): void {
    this.disposeTrackLinesOnly();
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
