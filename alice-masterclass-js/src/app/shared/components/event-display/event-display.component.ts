import { Component, ElementRef, Input, Output, AfterViewInit, ViewChild, EventEmitter, HostBinding, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CdkDragEnd } from '@angular/cdk/drag-drop';
import { Observable, Subscription, animationFrameScheduler, scheduled } from 'rxjs';
import { repeat } from 'rxjs/operators';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import {
  Event, Track, TrackType, CalorimeterDetectorId,
  CALO_PANELS, CALO_DCAL_PANELS, caloFlatSizeFor,
  caloFlatIndex, caloPanelsFor, packCalorimeterHits
} from '../../models';
import {
  trackColor, clusterColor, positiveTrackColor, negativeTrackColor, bachelorTrackColor, highlightColor,
  neonTrackColor, caloBarColorLight, caloBarColorDark
} from '../../globals';
import { mergeStaticMeshesByMaterial } from '../../three/merge-static-meshes';

/** Detector layer toggle row (multipart GLB assembly). */
export interface DetectorPartToggleModel {
  assetPath: string;
  labelKey: string;
  labelParams?: Record<string, string>;
  visible: boolean;
  opacity: number;
}

export interface DetectorPaletteItem {
  assetPath: string;
  labelKey: string;
  labelParams?: Record<string, string>;
  placed: boolean;
}

/** Progressive detector assembly unlock flags (which multipart pieces are on the scene). */
export interface AssemblyUnlockState {
  hasIts: boolean;
  hasTpc: boolean;
  hasTrd: boolean;
  hasTof: boolean;
  hasEmcal: boolean;
  hasDcal: boolean;
  hasPhos: boolean;
  hasL3: boolean;
}

@Component({
  selector: 'app-event-display',
  templateUrl: './event-display.component.html',
  styleUrls: ['./event-display.component.scss'],
  standalone: false
})
export class EventDisplayComponent implements AfterViewInit, OnDestroy {
  private readonly SIDE_VIEW_PIXEL_RATIO_FACTOR: number = 0.65;
  private readonly CLUSTERS_USE_POINTS: boolean = true;
  private readonly CLICK_HIGHLIGHT_DURATION = 200;
  private readonly TRACK_DRAW_ANIMATION_MS = 4000;

  /** Proton GLB for the first-event collision intro. */
  @Input() protonModelUrl = 'assets/models/proton.glb';

  @HostBinding("style.--primary-axis-ratio")
  readonly PRIMARY_AXIS_RATIO: number = 1 / 1.61803398875; // Golden ratio
  @HostBinding("style.--secondary-axis-ratio")
  readonly SECONDARY_AXIS_RATIO: number = 1 / 2;

  static readonly fieldOfView: number = 70;
  static readonly nearClippingPlane: number = 0.05;
  static readonly farClippingPlane: number = 1500;
  static readonly objectScale: number = 1.0e-2;
  static readonly detectorModelScale: number = 1.0e-2;
  /**
   * ITS/TPC/TRD GLBs place the beam axis at local y=+30 (cm). After
   * `detectorModelScale` that is +0.3 in scene units. L3 / TOF / calorimeters
   * are already around the origin — only cancel the barrel offset so tracks
   * at (0,0,0) sit on the detector axis.
   */
  static readonly DETECTOR_BEAM_AXIS_Y_OFFSET = -30 * EventDisplayComponent.detectorModelScale;

  /**
   * Max transverse radius (trajectory data units, ~cm) for ITS-only track stubs.
   * Sparse event trajectories typically have ~1 point inside ITS; we interpolate
   * the boundary so stubs remain readable (~10 cm).
   */
  static readonly ITS_STUB_RADIUS = 10;

  /** Keeps trajectory points with R = sqrt(x²+y²) < rMax; interpolates the exit point. */
  static clipTrajectoryToRadius(trajectory: number[][], rMax: number): number[][] {
    if (!trajectory?.length || !(rMax > 0)) {
      return [];
    }
    const rOf = (p: number[]) => Math.hypot(p[0], p[1]);
    const out: number[][] = [];
    for (let i = 0; i < trajectory.length; i++) {
      const p = trajectory[i];
      const r = rOf(p);
      if (r < rMax) {
        out.push([p[0], p[1], p[2]]);
        continue;
      }
      if (i === 0) {
        return [];
      }
      const prev = trajectory[i - 1];
      const rPrev = rOf(prev);
      if (rPrev >= rMax) {
        break;
      }
      const t = r === rPrev ? 0 : (rMax - rPrev) / (r - rPrev);
      out.push([
        prev[0] + t * (p[0] - prev[0]),
        prev[1] + t * (p[1] - prev[1]),
        prev[2] + t * (p[2] - prev[2]),
      ]);
      break;
    }
    return out;
  }

  static isItsAssetPath(assetPath: string): boolean {
    return /(^|[/\\])its\.glb($|\?)/i.test(assetPath);
  }

  static isTpcAssetPath(assetPath: string): boolean {
    return /(^|[/\\])tpc\.glb($|\?)/i.test(assetPath);
  }

  static detectorPartPresentation(assetPath: string): Pick<DetectorPartToggleModel, 'labelKey' | 'labelParams'> {
    const baseName = assetPath.replace(/^.*[/\\]/, '');
    const file = baseName.toLowerCase();
    const keys: Record<string, string> = {
      'its.glb': 'EVENT_DISPLAY.DETECTOR_ITS',
      'tpc.glb': 'EVENT_DISPLAY.DETECTOR_TPC',
      'trd.glb': 'EVENT_DISPLAY.DETECTOR_TRD',
      'tof.glb': 'EVENT_DISPLAY.DETECTOR_TOF',
      'l3.glb': 'EVENT_DISPLAY.DETECTOR_L3',
      'emcal.glb': 'EVENT_DISPLAY.DETECTOR_EMCAL',
      'dcal.glb': 'EVENT_DISPLAY.DETECTOR_DCAL',
      'phos.glb': 'EVENT_DISPLAY.DETECTOR_PHOS',
    };
    if (keys[file]) {
      return { labelKey: keys[file] };
    }
    return {
      labelKey: 'EVENT_DISPLAY.DETECTOR_LAYER_FALLBACK',
      labelParams: { name: baseName.replace(/\.(glb|gltf)$/i, '').replace(/_/g, ' ') }
    };
  }

  static isCalorimeterAssetPath(assetPath: string): boolean {
    return /(^|[/\\])(emcal|dcal)\.glb($|\?)/i.test(assetPath);
  }

  static calorimeterDetectorId(assetPath: string): CalorimeterDetectorId | null {
    const file = assetPath.replace(/^.*[/\\]/, '').toLowerCase();
    if (file.startsWith('emcal')) return 'emcal';
    if (file.startsWith('dcal')) return 'dcal';
    return null;
  }

  /** Barrel trackers (ITS/TPC/TRD) were exported with beam axis at y=+30. */
  static needsBeamAxisYCorrection(assetPath: string): boolean {
    return /(^|[/\\])(its|tpc|trd)\.glb($|\?)/i.test(assetPath);
  }

  /**
   * Shift barrel parts onto the world origin and hide leftover CAD helper cubes.
   * Calorimeter GLBs stay put — they are already coaxial with L3; readout bars
   * are rebuilt from those meshes in world space.
   */
  static alignDetectorPartToBeamAxis(scene: THREE.Object3D, assetPath: string): void {
    scene.traverse((o: THREE.Object3D) => {
      if (/^Cube(\d+)?$/i.test(o.name || '')) {
        o.visible = false;
      }
    });
    if (EventDisplayComponent.needsBeamAxisYCorrection(assetPath)) {
      scene.position.y = EventDisplayComponent.DETECTOR_BEAM_AXIS_Y_OFFSET;
    }
  }

  static readonly lineSegments: number = 50;

  private static readonly VERTEX_MARKER_RADIUS = (0.35 * 2 / 3) * EventDisplayComponent.objectScale;
  private static readonly MARKER_PROXIMITY_PX = 155;
  private static readonly PAN_SPEED_FACTOR = 0.005;
  private static readonly WHEEL_PAN_FACTOR = 0.03;
  private static readonly MOUSE_DRAG_PAN_FACTOR = 0.0008;
  private static readonly FADE_OPACITY = 0.25;
  private static readonly DETECTOR_FADE_OPACITY = 0.08;
  /** Slider default; materials load solid (opacity 1) then sync via setDetectorPartOpacity. */
  private static readonly DETECTOR_COMPONENT_OPACITY = 0.78;
  private static readonly DETECTOR_INNER_OPACITY = 0.80;
  private static readonly DETECTOR_OUTER_OPACITY = 0.75;
  /** Separates nested detector shells in depth (log-depth ignores polygonOffset). */
  private static readonly DETECTOR_LAYER_RADIAL_INFLATE_STEP = 0.0009;

  /** sessionStorage: multipart assembly completed for this tab session. */
  static readonly DETECTOR_ASSEMBLY_DONE_STORAGE_KEY = 'alice_mc_visualAnalysis_detectorAssembledPaths_v1';

  private static detectorAssemblyPathsSignature(paths: string[]): string {
    return paths.join('\u0000');
  }

  /** True when VA can skip the assembly coach for this session. */
  static isMultipartDetectorStoredComplete(paths: string[]): boolean {
    if (!paths?.length || paths.length < 2) return true;
    try {
      const saved = typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(EventDisplayComponent.DETECTOR_ASSEMBLY_DONE_STORAGE_KEY)
        : null;
      return saved !== null && saved === EventDisplayComponent.detectorAssemblyPathsSignature(paths);
    } catch {
      return false;
    }
  }

  private isStoredDetectorAssemblyComplete(paths: string[]): boolean {
    return EventDisplayComponent.isMultipartDetectorStoredComplete(paths);
  }

  private persistDetectorAssemblyCompleted(paths: string[]): void {
    try {
      sessionStorage.setItem(
        EventDisplayComponent.DETECTOR_ASSEMBLY_DONE_STORAGE_KEY,
        EventDisplayComponent.detectorAssemblyPathsSignature(paths)
      );
    } catch {
      /* private browsing / quota */
    }
  }

  private static readonly LAMBDA_MASS_MIN = 1.07;
  private static readonly LAMBDA_MASS_MAX = 1.16;
  private static readonly XI_MASS_MIN = 1.25;
  private static readonly XI_MASS_MAX = 1.40;

  static readonly trackColor: THREE.Color = new THREE.Color(trackColor);
  static readonly clusterColor: THREE.Color = new THREE.Color(clusterColor);
  static readonly positiveTrackColor: THREE.Color = new THREE.Color(positiveTrackColor);
  static readonly negativeTrackColor: THREE.Color = new THREE.Color(negativeTrackColor);
  static readonly bachelorTrackColor: THREE.Color = new THREE.Color(bachelorTrackColor);
  static readonly highlightColor: THREE.Color = new THREE.Color(highlightColor);

  static readonly neonTrackColor: THREE.Color = new THREE.Color(neonTrackColor);
  static readonly caloBarColorLight: THREE.Color = new THREE.Color(caloBarColorLight);
  static readonly caloBarColorDark: THREE.Color = new THREE.Color(caloBarColorDark);

  private static readonly BLOOM_STRENGTH = 0.22;
  private static readonly BLOOM_RADIUS = 0.28;
  private static readonly BLOOM_THRESHOLD = 0.72;
  private static readonly DETECTOR_NEON_EMISSIVE_INTENSITY = 0.12;
  private static readonly CALO_BAR_MAX_COUNT = 3200;
  private static readonly CALO_BAR_PITCH_FILL = 0.96;
  private static readonly CALO_BAR_MIN_HEIGHT = 0.01;
  private static readonly CALO_BAR_MAX_HEIGHT = 0.35;
  private static readonly CALO_BAR_DARK_EMISSIVE = 0.9;

  private trackMaterial: THREE.Material = null;
  private postiveTrackMaterial: THREE.Material = null;
  private negativeTrackMaterial: THREE.Material = null;
  private bachelorTrackMaterial: THREE.Material = null;
  private highlightTrackMaterial: THREE.Material = null;
  private cascadeHoverTrackMaterial: THREE.Material = null;
  private cascadeProtonMaterial: THREE.Material = null;
  private pointsMaterial: THREE.Material = null;
  private caloBarMaterial: THREE.MeshStandardMaterial = null;
  private caloBarGeometry: THREE.BoxGeometry = null;

  private _backgroundColor: number = 0xFFFFFF;

  @Input()
  get backgroundColor(): number { return this._backgroundColor; }
  set backgroundColor(backgroundColor: number) {
    this._backgroundColor = backgroundColor;
    this.syncSceneBackground();
  }

  /** Keeps WebGL clear color and scene.background in lockstep with the UI panel tone. */
  private syncSceneBackground(): void {
    if (this.renderer) {
      this.renderer.setClearColor(this._backgroundColor, 1);
    }
    if (this.scene) {
      this.scene.background = new THREE.Color(this._backgroundColor);
    }
  }

  @Input() showThemeToggle = false;

  private _darkMode = false;

  @Input()
  get darkMode(): boolean { return this._darkMode; }
  set darkMode(darkMode: boolean) {
    this._darkMode = darkMode;
    this.applyDarkModeStyling();
  }
  @Output() darkModeChange: EventEmitter<boolean> = new EventEmitter<boolean>();

  private _showControls: boolean = true;

  @Input()
  get showControls(): boolean { return this._showControls; }
  set showControls(showControls: boolean) {
    this._showControls = showControls;
    if (!showControls) this.sidebarOpened = false;
  }

  private _showGridBackground: boolean = false;
  private gridHelpers: THREE.GridHelper[] = [];

  @Input()
  get showGridBackground(): boolean { return this._showGridBackground; }
  set showGridBackground(showGridBackground: boolean) {
    this._showGridBackground = showGridBackground;

    if (!this.scene) return;
    this.syncGridBackground();
  }

  @Input()
  get trackWidth(): number { return this._trackWidth; }
  get trackHighlightWidth(): number { return 6 * this.trackWidth; }
  get trackDecayWidth(): number { return 1.2 * this.trackWidth; }

  set trackWidth(trackWidth: number) {
    this._trackWidth = trackWidth;
    if (this.trackMaterial && (this.trackMaterial as LineMaterial).linewidth !== undefined) {
      (this.trackMaterial as LineMaterial).linewidth = this.trackWidth;
      (this.postiveTrackMaterial as LineMaterial).linewidth = this.trackDecayWidth;
      (this.negativeTrackMaterial as LineMaterial).linewidth = this.trackDecayWidth;
      (this.bachelorTrackMaterial as LineMaterial).linewidth = this.trackDecayWidth;
      (this.highlightTrackMaterial as LineMaterial).linewidth = this.trackHighlightWidth;
      (this.cascadeHoverTrackMaterial as LineMaterial).linewidth = this.trackHighlightWidth;
      if (this.cascadeProtonMaterial) (this.cascadeProtonMaterial as LineMaterial).linewidth = this.trackHighlightWidth;
    }
  }
  private _trackWidth: number = 2;

  @Input()
  get clusterSize(): number { return this._clusterSize; }
  set clusterSize(clusterSize: number) {
    this._clusterSize = clusterSize;
    if (this.CLUSTERS_USE_POINTS && this.pointsMaterial) {
      (this.pointsMaterial as THREE.PointsMaterial).size = this.clusterSize;
    } else {
      this.setSizeRecursive(this.clusters, this.clusterSize);
    }
  }
  private _clusterSize: number = 0.1;

  private setSizeRecursive(object: THREE.Object3D, value: number) {
    object.traverse((o: THREE.Object3D) => {
      if ((o as any).isMesh === true) {
        (o as THREE.Mesh).scale.set(value, value, value);
      }
    });
  }

  loading: boolean = false;
  sidebarOpened: boolean = true;
  detectorLayersPanelOpened: boolean = true;
  detectorPartsForUi: DetectorPartToggleModel[] = [];
  detectorPaletteItems: DetectorPaletteItem[] = [];
  /** Multiple GLBs: user drags pieces from the palette before the normal options sidebar is shown. */
  detectorMultipartAssemblyMode = false;
  private _detectorInteractiveAssemblyDone = true;
  private detectorMultipartModelPathsOrder: string[] = [];
  private detectorPreloadedRoots = new Map<string, THREE.Object3D>();
  cameraMode: 'centered' | 'free' = 'centered';
  private trackHoverObj: THREE.Object3D = null;
  private trackHoverOrigMaterial: THREE.Material = null;
  private decayGroupHovered: THREE.Object3D | null = null;
  private decayHoverOrigMaterials: THREE.Material[] = [];
  private cascadeHoverActive: boolean = false;
  vertexMarkerTooltip: { label: string; x: number; y: number } | null = null;
  trackTooltip: { label: string; x: number; y: number } | null = null;
  vertexPanelOpen: { label: string } | null = null;
  vertexPanelX: number = 0;
  vertexPanelY: number = 0;
  vertexPanelDragging = false;
  vertexPanelDragOffsetX = 0;
  vertexPanelDragOffsetY = 0;
  private cascadeMarkerEnhanced = false;
  private cascadeMarkerOrigColors: number[] = [];
  private cascadeMarkerOrigScales: number[] = [];

  // 3D
  private scene: THREE.Scene = new THREE.Scene();

  private axes: THREE.Group = (() => {
    const g = new THREE.Group();
    g.visible = false;
    return g;
  })();
  private lights: THREE.Group = new THREE.Group();

  private camera3D: THREE.PerspectiveCamera;
  private cam3DVP: THREE.Vector4 = new THREE.Vector4();
  private cameraRphi: THREE.PerspectiveCamera;
  private camRphiVP: THREE.Vector4 = new THREE.Vector4();
  private cameraRhoz: THREE.PerspectiveCamera;
  private camRhozVP: THREE.Vector4 = new THREE.Vector4();
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  // Bloom only on the main 3D view (not tiled side views).
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private tracks: THREE.Object3D = new THREE.Object3D();
  private decays: THREE.Object3D = new THREE.Object3D();
  private clusters: THREE.Object3D = new THREE.Object3D();
  /** Radial energy-readout bars on EMCal / DCal surfaces. */
  private calorimeterReadouts: THREE.Group = new THREE.Group();
  private cascadeVertexMarkers: THREE.Object3D = new THREE.Object3D();
  /** Primary vertex marker shown while ITS is unlocked but TPC is not yet placed. */
  private primaryVertexMarkers: THREE.Object3D = new THREE.Object3D();
  private cascadeConnectorLine: Line2 | null = null;
  private cascadeXiLine: Line2 | null = null;
  private lambdaFlightLine2Track: Line2 | null = null;
  private trackDrawAnimations: THREE.Object3D[] = [];
  private pendingTrackDrawLines: THREE.Object3D[] = [];
  private trackDrawAnimationStartMs = 0;
  /** When non-null, track draw progress is paused while two protons collide. */
  private collisionIntroPhase: 'loading' | 'animating' | null = null;
  private collisionProtonsGroup = new THREE.Group();
  private protonPlusZMesh: THREE.Object3D | null = null;
  private protonMinusZMesh: THREE.Object3D | null = null;
  /** World-space approximate radius after scaling (bounding sphere). */
  private protonRadiusWorld = 0.014;
  private lastRenderWallMs = 0;
  private protonHalfSeparationStart = 0.42;
  private readonly protonApproachSpeed = 1.35e-4;
  private keysDown: { [key: string]: boolean } = {};
  private panVec = new THREE.Vector3();
  private panRight = new THREE.Vector3();
  private panDir = new THREE.Vector3();
  private isMousePanning = false;
  private lastMousePanX = 0;
  private lastMousePanY = 0;

  // Loaders
  private loaderGLTF: GLTFLoader = new GLTFLoader();

  // Detector
  private detector: THREE.Group = new THREE.Group();
  private detectorScene: THREE.Group | null = null;
  private detectorPartRootByPath = new Map<string, THREE.Object3D>();

  @Input()
  get landscape(): boolean { return this._landscape; }
  set landscape(landscape: boolean) {
    this._landscape = landscape;
    this.resize(true);
  }
  private _landscape: boolean;

  @ViewChild('canvas')
  canvasRef: ElementRef;

  private get canvas(): HTMLCanvasElement {
    return this.canvasRef.nativeElement;
  }

  private get aspectRatio(): number {
    return this.canvas.clientWidth / this.canvas.clientHeight;
  }

  @Input()
  get detectorModel(): string | string[] { return this._detectorModel; }
  set detectorModel(detectorModel: string | string[]) {
    this._detectorModel = detectorModel;
    this.detector.clear();
    this.detectorScene = null;
    this.detectorPartRootByPath.clear();
    this.detectorPartsForUi = [];
    this.detectorPreloadedRoots.clear();
    this.detectorPaletteItems = [];
    this.detectorMultipartModelPathsOrder = [];
    this.clearCalorimeterReadouts();

    const modelPaths = Array.isArray(detectorModel) ? detectorModel : [detectorModel];
    const multiPart = modelPaths.length > 1;
    const useInteractiveMultipartAssembly =
      multiPart && !this.isStoredDetectorAssemblyComplete(modelPaths);
    this.detectorMultipartAssemblyMode = useInteractiveMultipartAssembly;
    this._detectorInteractiveAssemblyDone = !useInteractiveMultipartAssembly;

    if (modelPaths.length === 0) {
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    let remaining = modelPaths.length;
    const reloadToken = Date.now().toString();
    const loadedByPath = new Map<string, THREE.Object3D>();

    const finishImmediateAttached = () => {
      this.detectorPartRootByPath.clear();
      const nextUi: DetectorPartToggleModel[] = [];
      for (const modelPath of modelPaths) {
        const scene = loadedByPath.get(modelPath);
        if (!scene) continue;
        const pres = EventDisplayComponent.detectorPartPresentation(modelPath);
        scene.visible = true;
        this.zeroDetectorSceneOpacity(scene);
        this.detector.add(scene);
        this.detectorPartRootByPath.set(modelPath, scene);
        nextUi.push({
          assetPath: modelPath,
          labelKey: pres.labelKey,
          labelParams: pres.labelParams,
          visible: true,
          opacity: this.getDetectorPartOpacity(scene)
        });
      }
      this.detectorPartsForUi = nextUi;
      this.detectorScene = this.detector;
      this.loading = false;
      if (nextUi.length > 0) {
        this.detectorLayersPanelOpened = true;
      }
      this.cdr.markForCheck();
      this.resize(true);
      this.staggeredRevealDetectorParts(modelPaths);
      this.rebuildCalorimeterReadouts();
    };

    const finishMultipartPreload = () => {
      this.detectorMultipartModelPathsOrder = [...modelPaths];
      this.detectorPreloadedRoots.clear();
      this.detectorPaletteItems = [];
      for (const modelPath of modelPaths) {
        const scene = loadedByPath.get(modelPath);
        if (scene) {
          scene.visible = false;
          this.detectorPreloadedRoots.set(modelPath, scene);
        } else {
          console.warn(`[EventDisplay] Model not loaded, will be skipped in 3D but kept in palette: ${modelPath}`);
        }
        const pres = EventDisplayComponent.detectorPartPresentation(modelPath);
        this.detectorPaletteItems.push({
          assetPath: modelPath,
          labelKey: pres.labelKey,
          labelParams: pres.labelParams,
          placed: false
        });
      }
      this.detectorLayersPanelOpened = false;
      this.sidebarOpened = true;
      this.detectorPartsForUi = [];
      this.detectorScene = null;
      this.loading = false;
      this.cdr.markForCheck();
      this.resize(true);
    };

    const finishOne = () => {
      remaining -= 1;
      if (remaining === 0) {
        if (useInteractiveMultipartAssembly) {
          finishMultipartPreload();
        } else {
          finishImmediateAttached();
        }
      }
    };

    const total = modelPaths.length;
    for (let pathIndex = 0; pathIndex < total; pathIndex++) {
      const modelPath = modelPaths[pathIndex];
      const t = total > 1 ? pathIndex / (total - 1) : 0;
      const detectorOpacity =
        EventDisplayComponent.DETECTOR_INNER_OPACITY * (1 - t) +
        EventDisplayComponent.DETECTOR_OUTER_OPACITY * t;
      const isCalorimeterLayer = /(^|[/\\])(emcal|dcal|phos)\.glb($|\?)/i.test(modelPath);
      const defaultPartOpacity = isCalorimeterLayer
        ? Math.max(detectorOpacity, 0.45)
        : detectorOpacity;
      const modelPathWithReload = modelPath.includes('?')
        ? `${modelPath}&reload=${reloadToken}`
        : `${modelPath}?reload=${reloadToken}`;
      this.loaderGLTF.load(
        modelPathWithReload,
        (gltf: GLTF) => {
          const scene = gltf.scene;
          const radialInflate = 1 + pathIndex * EventDisplayComponent.DETECTOR_LAYER_RADIAL_INFLATE_STEP;
          scene.scale.setScalar(EventDisplayComponent.detectorModelScale * radialInflate);
          EventDisplayComponent.alignDetectorPartToBeamAxis(scene, modelPath);
          scene.updateMatrixWorld(true);
          scene.userData = {
            ...(scene.userData || {}),
            detectorAssetPath: modelPath,
            detectorLayerIndex: pathIndex
          };
          this.setDetectorMaterialsWithPolygonOffset(scene, defaultPartOpacity, pathIndex);
          // Collapses thousands of repeated-node meshes (e.g. calorimeter
          // crystals) down to ~1 draw call per material — see merge-static-meshes.ts.
          // Must run after setDetectorMaterialsWithPolygonOffset(), which mutates
          // the (shared) materials used as the merge grouping key.
          loadedByPath.set(modelPath, mergeStaticMeshesByMaterial(scene));
          finishOne();
        },
        undefined,
        (err) => {
          console.error(`[EventDisplay] Failed to load detector model: ${modelPath}`, err);
          finishOne();
        }
      );
    }
  }
  private _detectorModel: string | string[];

  get effectiveSideViewsShown(): boolean {
    return this._detectorInteractiveAssemblyDone && !!this._sideViewsShown;
  }

  get detectorInteractiveAssemblyDone(): boolean {
    return this._detectorInteractiveAssemblyDone;
  }

  onDetectorPaletteDragEnded(event: CdkDragEnd, item: DetectorPaletteItem): void {
    if (item.placed) {
      event.source.reset();
      return;
    }

    let clientX = 0;
    let clientY = 0;
    const ie = event as CdkDragEnd & {
      pointerPosition?: { x: number; y: number };
      event?: MouseEvent | TouchEvent;
    };
    const ev = ie.event;
    if (ev && 'changedTouches' in ev && ev.changedTouches?.length) {
      clientX = ev.changedTouches[0].clientX;
      clientY = ev.changedTouches[0].clientY;
    } else if (ev && 'clientX' in ev) {
      clientX = (ev as MouseEvent).clientX;
      clientY = (ev as MouseEvent).clientY;
    } else if (ie.pointerPosition) {
      clientX = ie.pointerPosition.x;
      clientY = ie.pointerPosition.y;
    }

    if (!clientX && !clientY) {
      event.source.reset();
      return;
    }

    const dropOk = this.tryPlaceDetectorPieceFromPalette(item, clientX, clientY);
    if (!dropOk || !item.placed) {
      event.source.reset();
    }
    this.cdr.markForCheck();
  }

  /** Returns true when the piece snaps into the detector (valid drop zone). */
  private tryPlaceDetectorPieceFromPalette(item: DetectorPaletteItem, clientX: number, clientY: number): boolean {
    const renderArea =
      typeof this.canvasRef?.nativeElement?.parentElement !== 'undefined'
        ? (this.canvasRef.nativeElement.parentElement as HTMLElement | null)
        : null;
    if (!renderArea) return false;
    const rect = renderArea.getBoundingClientRect();
    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;

    if (!inside) return false;

    const root = this.detectorPreloadedRoots.get(item.assetPath);
    if (!root || item.placed) return false;

    this.zeroDetectorSceneOpacity(root);
    this.detector.add(root);
    this.detectorPartRootByPath.set(item.assetPath, root);
    item.placed = true;
    this.fadeInDetectorScene(root, 500);

    this.detectorAssemblyPiecePlaced.emit(item.assetPath);

    this.detectorPartsForUi = this.rebuildDetectorPartTogglesSorted();
    this.refreshPhysicsForAssemblyUnlock();

    const allPlaced = this.detectorPaletteItems.every((row) => row.placed);
    if (allPlaced) {
      this.completeMultipartDetectorAssembly();
    } else if (EventDisplayComponent.isCalorimeterAssetPath(item.assetPath)) {
      this.rebuildCalorimeterReadouts();
    }
    return true;
  }

  private rebuildDetectorPartTogglesSorted(): DetectorPartToggleModel[] {
    if (this.detectorMultipartModelPathsOrder.length === 0) return [];
    const next: DetectorPartToggleModel[] = [];
    const presFor = (p: string) => EventDisplayComponent.detectorPartPresentation(p);
    for (const p of this.detectorMultipartModelPathsOrder) {
      if (!this.detectorPartRootByPath.has(p)) continue;
      const pres = presFor(p);
      const root = this.detectorPartRootByPath.get(p);
      const existing = this.detectorPartsForUi.find((t) => t.assetPath === p);
      next.push({
        assetPath: p,
        labelKey: pres.labelKey,
        labelParams: pres.labelParams,
        visible: existing ? existing.visible : root ? root.visible : true,
        opacity: existing ? existing.opacity : root ? this.getDetectorPartOpacity(root) : EventDisplayComponent.DETECTOR_OUTER_OPACITY
      });
    }
    return next;
  }

  private completeMultipartDetectorAssembly(): void {
    this.persistDetectorAssemblyCompleted(this.detectorMultipartModelPathsOrder);
    this._detectorInteractiveAssemblyDone = true;
    this.detectorScene = this.detector;
    this.detectorPartsForUi = this.rebuildDetectorPartTogglesSorted();
    if (this.detectorPartsForUi.length > 0) {
      this.detectorLayersPanelOpened = true;
    }
    this.sidebarOpened = false;
    this.applyUiDetectorOpacities();
    this.rebuildCalorimeterReadouts();
    this.refreshPhysicsForAssemblyUnlock();
    this.cdr.markForCheck();
    this.resize(true);
  }

  setDetectorPartVisibility(part: DetectorPartToggleModel, visible: boolean): void {
    part.visible = visible;
    const root = this.detectorPartRootByPath.get(part.assetPath);
    if (root) {
      root.visible = visible;
    }
    this.syncCalorimeterReadoutVisibility();
  }

  setDetectorPartOpacity(part: DetectorPartToggleModel, value: number | string): void {
    const nextOpacity = Math.max(0.05, Math.min(0.95, Number(value)));
    part.opacity = Number.isFinite(nextOpacity) ? nextOpacity : part.opacity;
    const root = this.detectorPartRootByPath.get(part.assetPath);
    if (!root) return;
    root.traverse((o: THREE.Object3D) => {
      if (!(o as any).isMesh) return;
      const raw = (o as THREE.Mesh).material;
      const mats: THREE.Material[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const m of mats) {
        if (!m) continue;
        (m as any).transparent = part.opacity < 0.995;
        (m as any).userData = { ...((m as any).userData || {}), baseOpacity: part.opacity };
        (m as any).opacity = part.opacity;
        (m as any).needsUpdate = true;
      }
    });
  }

  /** Push each part's UI opacity through setDetectorPartOpacity (identical to moving the slider). */
  private applyUiDetectorOpacities(): void {
    for (const part of this.detectorPartsForUi) {
      this.setDetectorPartOpacity(part, part.opacity);
    }
  }

  private getDetectorPartOpacity(root: THREE.Object3D): number {
    let found: number | null = null;
    root.traverse((o: THREE.Object3D) => {
      if (found !== null || !(o as any).isMesh) return;
      const raw = (o as THREE.Mesh).material;
      const mat = Array.isArray(raw) ? raw[0] : raw;
      const base = mat ? (mat as any).userData?.baseOpacity : null;
      if (typeof base === 'number' && Number.isFinite(base)) {
        found = base;
      }
    });
    return found ?? EventDisplayComponent.DETECTOR_OUTER_OPACITY;
  }

  private static readonly DETECTOR_RENDER_ORDER_LAYER_STRIDE = 10000;
  static readonly PHYSICS_RENDER_ORDER_BASE = 200000;

  private setDetectorMaterialsWithPolygonOffset(object: THREE.Object3D, opacity: number, layerIndex = 0) {
    const layerOffset = -(layerIndex + 1) * 2;
    const layerRenderOrderBase = layerIndex * EventDisplayComponent.DETECTOR_RENDER_ORDER_LAYER_STRIDE;
    object.renderOrder = layerRenderOrderBase;
    const tempVec = new THREE.Vector3();
    const meshes: THREE.Mesh[] = [];
    object.traverse((o: THREE.Object3D) => {
      if ((o as any).isMesh === true) meshes.push(o as THREE.Mesh);
    });
    meshes.sort((a, b) => {
      a.getWorldPosition(tempVec);
      const da = tempVec.lengthSq();
      b.getWorldPosition(tempVec);
      const db = tempVec.lengthSq();
      return da - db;
    });
    meshes.forEach((mesh, meshIndex) => {
      // Unique static renderOrder per mesh avoids z-flicker between sibling shells.
      mesh.renderOrder = layerRenderOrderBase + meshIndex;
      const subOffset = layerOffset - meshIndex * 0.01;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((mat: THREE.Material) => {
        if (!mat) return;
        (mat as any).transparent = false;
        (mat as any).opacity = 1;
        (mat as any).userData = { ...((mat as any).userData || {}), baseOpacity: opacity };
        (mat as any).side = THREE.FrontSide;
        (mat as any).depthWrite = true;
        (mat as any).alphaTest = 0;
        (mat as any).polygonOffset = true;
        (mat as any).polygonOffsetFactor = subOffset;
        (mat as any).polygonOffsetUnits = subOffset * 2;
        (mat as any).needsUpdate = true;
      });
    });
    this.applyDarkModeToObject(object);
  }

  /** Re-applies (or clears) the neon dark-mode look across everything currently in the scene. */
  private applyDarkModeStyling(): void {
    if (this.bloomPass) {
      this.bloomPass.enabled = this._darkMode;
    }
    if (this.renderer) {
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.toneMappingExposure = 1;
    }
    this.syncSceneBackground();
    if (this.trackMaterial) {
      (this.trackMaterial as any).color.copy(
        this._darkMode ? EventDisplayComponent.neonTrackColor : EventDisplayComponent.trackColor
      );
    }
    if (this.detector) {
      this.applyDarkModeToObject(this.detector);
    }
    this.applyCalorimeterBarTheme();
  }

  /** Boosts (or resets) saturation + self-emissive glow on every mesh material under `object`. */
  private applyDarkModeToObject(object: THREE.Object3D): void {
    const hsl = { h: 0, s: 0, l: 0 };
    object.traverse((o: THREE.Object3D) => {
      if (!(o as any).isMesh) return;
      const raw = (o as THREE.Mesh).material;
      const mats: THREE.Material[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const mat of mats) {
        const m = mat as THREE.MeshStandardMaterial;
        if (!m || !('color' in m)) continue;
        const userData: any = (m as any).userData || ((m as any).userData = {});
        if (!userData.neonBaseColor) {
          userData.neonBaseColor = m.color.clone();
        }
        if (this._darkMode) {
          userData.neonBaseColor.getHSL(hsl);
          m.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.1 + 0.05), Math.min(0.55, Math.max(0.3, hsl.l)));
          if ('emissive' in m) {
            m.emissive.copy(m.color);
            (m as any).emissiveIntensity = EventDisplayComponent.DETECTOR_NEON_EMISSIVE_INTENSITY;
          }
        } else {
          m.color.copy(userData.neonBaseColor);
          if ('emissive' in m) {
            m.emissive.setRGB(0, 0, 0);
            (m as any).emissiveIntensity = 1;
          }
        }
        (m as any).needsUpdate = true;
      }
    });
  }

  private applyCalorimeterBarTheme(): void {
    if (!this.caloBarMaterial) return;
    if (this._darkMode) {
      this.caloBarMaterial.color.copy(EventDisplayComponent.caloBarColorDark);
      this.caloBarMaterial.emissive.copy(EventDisplayComponent.caloBarColorDark);
      this.caloBarMaterial.emissiveIntensity = EventDisplayComponent.CALO_BAR_DARK_EMISSIVE;
      this.caloBarMaterial.transparent = true;
      this.caloBarMaterial.opacity = 0.92;
      this.caloBarMaterial.roughness = 0.35;
    } else {
      this.caloBarMaterial.color.copy(EventDisplayComponent.caloBarColorLight);
      this.caloBarMaterial.emissive.setRGB(0, 0, 0);
      this.caloBarMaterial.emissiveIntensity = 0;
      this.caloBarMaterial.transparent = false;
      this.caloBarMaterial.opacity = 1;
      this.caloBarMaterial.roughness = 0.55;
    }
    this.caloBarMaterial.needsUpdate = true;
  }

  private clearCalorimeterReadouts(): void {
    while (this.calorimeterReadouts.children.length > 0) {
      const child = this.calorimeterReadouts.children[0];
      this.calorimeterReadouts.remove(child);
      // Geometry and material are shared on the component — do not dispose them here.
    }
  }

  private syncCalorimeterReadoutVisibility(): void {
    if (!this.detector.visible) {
      this.calorimeterReadouts.visible = false;
      return;
    }
    this.calorimeterReadouts.visible = true;
    for (const child of this.calorimeterReadouts.children) {
      const assetPath = (child.userData && child.userData.detectorAssetPath) as string | undefined;
      if (!assetPath) continue;
      const root = this.detectorPartRootByPath.get(assetPath);
      const ui = this.detectorPartsForUi.find((p) => p.assetPath === assetPath);
      child.visible = !!(root && root.visible && (ui ? ui.visible : true));
    }
  }

  private rebuildCalorimeterReadouts(): void {
    this.clearCalorimeterReadouts();
    if (!this.caloBarGeometry || !this.caloBarMaterial) return;

    for (const [assetPath, root] of this.detectorPartRootByPath.entries()) {
      const detector = EventDisplayComponent.calorimeterDetectorId(assetPath);
      if (!detector) continue;

      const cells = detector === 'emcal'
        ? this.buildCalorimeterCellLayoutOnEmcal(root)
        : this.buildCalorimeterCellLayoutOnDcal(root);
      if (cells.length === 0) continue;

      const energies = this.resolveCalorimeterEnergies(detector, cells);
      const mesh = this.createCalorimeterBarInstances(cells, energies, detector);
      mesh.userData = { ...(mesh.userData || {}), detectorAssetPath: assetPath, calorimeterDetector: detector };
      mesh.renderOrder = EventDisplayComponent.PHYSICS_RENDER_ORDER_BASE + 200;
      this.calorimeterReadouts.add(mesh);
    }

    this.syncCalorimeterReadoutVisibility();
  }

  /**
   * Prefers packed collision data (`caloEmcal` / `caloDcal`), then sparse `caloHits`,
   * then a procedural preview so the grid is visible before real activations land.
   */
  private resolveCalorimeterEnergies(
    detector: CalorimeterDetectorId,
    cells: Array<{ position: THREE.Vector3; panel: number; phiIndex: number; zIndex: number }>
  ): Float32Array {
    const cellCount = cells.length;
    const flatSize = caloFlatSizeFor(detector);
    const ev = this._event;
    const dense = detector === 'emcal' ? ev?.caloEmcal : ev?.caloDcal;
    if (dense && dense.length >= Math.min(cellCount, flatSize)) {
      const out = new Float32Array(cellCount);
      for (let i = 0; i < cellCount; i++) {
        out[i] = dense[i] ?? 0;
      }
      return out;
    }

    if (ev?.caloHits?.length) {
      const packed = packCalorimeterHits(ev.caloHits, detector);
      const out = new Float32Array(cellCount);
      for (let i = 0; i < cellCount; i++) {
        out[i] = packed[i] ?? 0;
      }
      return out;
    }

    return this.buildProceduralCalorimeterEnergies(cells);
  }

  private buildProceduralCalorimeterEnergies(
    cells: Array<{ position: THREE.Vector3; panel: number; phiIndex: number; zIndex: number }>
  ): Float32Array {
    const seed = this.computeCalorimeterSeed();
    const hitPhis = this.collectTrackCalorimeterHitPhis();
    const out = new Float32Array(cells.length);
    for (let i = 0; i < cells.length; i++) {
      let energy = EventDisplayComponent.hash01(i, seed);
      energy = Math.pow(energy, 2.15);
      if (hitPhis.length > 0) {
        const phi = Math.atan2(cells[i].position.y, cells[i].position.x);
        let best = Math.PI;
        for (const hitPhi of hitPhis) {
          let d = Math.abs(phi - hitPhi);
          if (d > Math.PI) d = 2 * Math.PI - d;
          if (d < best) best = d;
        }
        if (best < 0.12) {
          energy = Math.min(1, energy + (0.12 - best) / 0.12 * 0.85);
        } else if (best < 0.28) {
          energy = Math.min(1, energy + (0.28 - best) / 0.28 * 0.35);
        }
      }
      if (energy < 0.04 && EventDisplayComponent.hash01(i, seed + 91) > 0.55) {
        energy = 0;
      }
      out[i] = energy;
    }
    return out;
  }

  private computeCalorimeterSeed(): number {
    const ev = this._event;
    if (!ev) return 1;
    let seed = (ev.tracks?.length || 0) * 131 + (ev.clusters?.length || 0) * 17;
    for (let i = 0; i < Math.min(8, ev.tracks?.length || 0); i++) {
      const t = ev.tracks[i];
      seed = (seed + Math.abs(t.px || 0) * 1009 + Math.abs(t.py || 0) * 917 + Math.abs(t.E || 0) * 503) | 0;
    }
    return seed || 1;
  }

  private collectTrackCalorimeterHitPhis(): number[] {
    const phis: number[] = [];
    const ev = this._event;
    if (!ev?.tracks?.length) return phis;
    for (const track of ev.tracks) {
      const traj = track.trajectory;
      if (traj?.length) {
        const tip = traj[traj.length - 1];
        phis.push(Math.atan2(tip[1], tip[0]));
      } else {
        phis.push(Math.atan2(track.py, track.px));
      }
    }
    for (const decay of ev.decays || []) {
      for (const track of decay) {
        const traj = track.trajectory;
        if (traj?.length) {
          const tip = traj[traj.length - 1];
          phis.push(Math.atan2(tip[1], tip[0]));
        }
      }
    }
    return phis;
  }

  /**
   * Places the EMCal readout grid (5×12×48 + 1×4×48) on the loaded detector face.
   * Flat plates fold about Z; seams between plates run parallel to Z.
   */
  private buildCalorimeterCellLayoutOnEmcal(root: THREE.Object3D): Array<{
    position: THREE.Vector3;
    panel: number;
    phiIndex: number;
    zIndex: number;
    pitchPhi: number;
    pitchZ: number;
    outwardX: number;
    outwardY: number;
    tangentX: number;
    tangentY: number;
  }> {
    const coverage = this.measureCalorimeterCylindricalCoverage(root);
    if (!coverage) return [];

    const { radius, zMin, zMax, phiStart, phiEnd } = coverage;
    // Final fit onto the live EMCal mesh (settled values).
    const surfaceR = radius * 0.63;
    const phiMid = (phiStart + phiEnd) * 0.5;
    const zMid = (zMin + zMax) * 0.5;
    const zHalf = (zMax - zMin) * 0.5 * 0.7;
    const zLo = zMid - zHalf;
    const zHi = zMid + zHalf;

    const cellsZ = CALO_PANELS[0].cellsZ;
    const nPanels = CALO_PANELS.length;
    const foldRad = (20 * Math.PI) / 180;
    const cellAngle = foldRad / CALO_PANELS[0].cellsPhi;
    const shiftRad = 3 * cellAngle;
    const pitchPhi = ((surfaceR * foldRad) / CALO_PANELS[0].cellsPhi) * 0.88;
    const pitchZ = (zHi - zLo) / cellsZ;
    const seam = 0.92 * pitchPhi;

    let angle = phiMid - foldRad * (nPanels - 1) * 0.5 + shiftRad;

    const w0 = CALO_PANELS[0].cellsPhi * pitchPhi;
    let hingeX = surfaceR * Math.cos(angle) - (-Math.sin(angle)) * (w0 * 0.5);
    let hingeY = surfaceR * Math.sin(angle) - Math.cos(angle) * (w0 * 0.5);

    const cells: Array<{
      position: THREE.Vector3;
      panel: number;
      phiIndex: number;
      zIndex: number;
      pitchPhi: number;
      pitchZ: number;
      outwardX: number;
      outwardY: number;
      tangentX: number;
      tangentY: number;
    }> = [];

    for (let p = 0; p < nPanels; p++) {
      const panel = CALO_PANELS[p];
      const panelWidth = panel.cellsPhi * pitchPhi;
      const outwardX = Math.cos(angle);
      const outwardY = Math.sin(angle);
      const tangentX = -Math.sin(angle);
      const tangentY = Math.cos(angle);

      for (let i = 0; i < panel.cellsPhi; i++) {
        const along = (i + 0.5) * pitchPhi;
        const x = hingeX + tangentX * along;
        const y = hingeY + tangentY * along;
        for (let j = 0; j < panel.cellsZ; j++) {
          const z = zLo + (j + 0.5) * pitchZ;
          cells.push({
            position: new THREE.Vector3(x, y, z),
            panel: p,
            phiIndex: i,
            zIndex: j,
            pitchPhi,
            pitchZ,
            outwardX,
            outwardY,
            tangentX,
            tangentY
          });
        }
      }

      hingeX += tangentX * (panelWidth + seam);
      hingeY += tangentY * (panelWidth + seam);
      angle += foldRad;
    }
    return cells;
  }

  /**
   * Places the DCal readout as an inverted U:
   * two Z-bands of 3×(12×16) folded in φ, bridged at the outer φ end by a 4×48 strip.
   */
  private buildCalorimeterCellLayoutOnDcal(root: THREE.Object3D): Array<{
    position: THREE.Vector3;
    panel: number;
    phiIndex: number;
    zIndex: number;
    pitchPhi: number;
    pitchZ: number;
    outwardX: number;
    outwardY: number;
    tangentX: number;
    tangentY: number;
  }> {
    const coverage = this.measureCalorimeterCylindricalCoverage(root, 'dcal');
    if (!coverage) return [];

    const { radius, zMin, zMax, phiStart, phiEnd } = coverage;
    // Final fit onto the live DCal mesh (settled values).
    const surfaceR = radius * 0.329;
    const phiMid = (phiStart + phiEnd) * 0.5;
    const zMid = (zMin + zMax) * 0.5;
    const zHalf = (zMax - zMin) * 0.5 * 0.95;
    const zLo = zMid - zHalf;
    const zHi = zMid + zHalf;
    const zSpan = zHi - zLo;
    const gapZ = zSpan * 0.35;
    const bandSpan = Math.max(1e-4, (zSpan - gapZ) * 0.5);
    const band0Lo = zLo;
    const band0Hi = zLo + bandSpan;
    const band1Lo = zHi - bandSpan;
    const band1Hi = zHi;

    const panels = CALO_DCAL_PANELS;
    const bandCount = 3;
    const mainCellsPhi = panels[0].cellsPhi;
    const foldRad = (20 * Math.PI) / 180;
    const cellAngle = foldRad / mainCellsPhi;
    const shiftRad = 0.75 * cellAngle;
    const pitchPhi = ((surfaceR * foldRad) / mainCellsPhi) * 0.987;
    const seam = 0.9 * pitchPhi;

    // 3 band plates + 1 connector in φ.
    const nPhiSlots = bandCount + 1;
    let angle = phiMid - foldRad * (nPhiSlots - 1) * 0.5 + shiftRad;
    const w0 = mainCellsPhi * pitchPhi;
    let hingeX = surfaceR * Math.cos(angle) - (-Math.sin(angle)) * (w0 * 0.5);
    let hingeY = surfaceR * Math.sin(angle) - Math.cos(angle) * (w0 * 0.5);

    type Cell = {
      position: THREE.Vector3;
      panel: number;
      phiIndex: number;
      zIndex: number;
      pitchPhi: number;
      pitchZ: number;
      outwardX: number;
      outwardY: number;
      tangentX: number;
      tangentY: number;
    };
    const cells: Cell[] = [];

    const pushPanel = (
      panelIndex: number,
      cellsPhi: number,
      cellsZ: number,
      zPanelLo: number,
      zPanelHi: number,
      ang: number,
      hx: number,
      hy: number
    ) => {
      const pitchZ = (zPanelHi - zPanelLo) / cellsZ;
      const outwardX = Math.cos(ang);
      const outwardY = Math.sin(ang);
      const tangentX = -Math.sin(ang);
      const tangentY = Math.cos(ang);
      for (let i = 0; i < cellsPhi; i++) {
        const along = (i + 0.5) * pitchPhi;
        const x = hx + tangentX * along;
        const y = hy + tangentY * along;
        for (let j = 0; j < cellsZ; j++) {
          const z = zPanelLo + (j + 0.5) * pitchZ;
          cells.push({
            position: new THREE.Vector3(x, y, z),
            panel: panelIndex,
            phiIndex: i,
            zIndex: j,
            pitchPhi,
            pitchZ,
            outwardX,
            outwardY,
            tangentX,
            tangentY
          });
        }
      }
    };

    // Two Z-bands share the same 3 φ plates (inverted-U arms).
    for (let b = 0; b < bandCount; b++) {
      const panelWidth = mainCellsPhi * pitchPhi;
      const tX = -Math.sin(angle);
      const tY = Math.cos(angle);
      pushPanel(b, mainCellsPhi, 16, band0Lo, band0Hi, angle, hingeX, hingeY);
      pushPanel(b + bandCount, mainCellsPhi, 16, band1Lo, band1Hi, angle, hingeX, hingeY);

      hingeX += tX * (panelWidth + seam);
      hingeY += tY * (panelWidth + seam);
      angle += foldRad;
    }

    // Outer φ connector: same seam as between band plates (no extra centering gap).
    const connector = panels[6];
    pushPanel(6, connector.cellsPhi, connector.cellsZ, zLo, zHi, angle, hingeX, hingeY);

    return cells;
  }

  /** Measures EMCal/DCal barrel face in scene space: radius, z span, contiguous φ arc. */
  private measureCalorimeterCylindricalCoverage(
    root: THREE.Object3D,
    detector: CalorimeterDetectorId = 'emcal'
  ): {
    radius: number;
    zMin: number;
    zMax: number;
    phiStart: number;
    phiEnd: number;
  } | null {
    root.updateMatrixWorld(true);
    const phis: number[] = [];
    const zs: number[] = [];
    const radii: number[] = [];
    const worldPos = new THREE.Vector3();

    const isTower = (o: THREE.Object3D): boolean => {
      let p: THREE.Object3D | null = o;
      while (p) {
        const n = (p.name || '').toUpperCase();
        if (detector === 'dcal') {
          if (n.startsWith('DCSM_') || n.startsWith('DCEXT_')) return true;
        } else if (n.startsWith('SMOD_') || n.startsWith('SM3RD_')) {
          return true;
        }
        p = p.parent;
      }
      return false;
    };

    let towerMeshes = 0;
    root.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Mesh).isMesh && isTower(o)) towerMeshes += 1;
    });
    const preferTower = towerMeshes >= 16;

    root.traverse((o: THREE.Object3D) => {
      if (!(o as THREE.Mesh).isMesh) return;
      if (preferTower && !isTower(o)) return;
      o.getWorldPosition(worldPos);
      const r = Math.hypot(worldPos.x, worldPos.y);
      if (r < 0.4) return;
      radii.push(r);
      phis.push(Math.atan2(worldPos.y, worldPos.x));
      zs.push(worldPos.z);
    });
    if (radii.length < 16) return null;


    const sortedR = radii.slice().sort((a, b) => a - b);
    const medianR = sortedR[Math.floor(sortedR.length / 2)];
    const facePhis: number[] = [];
    const faceZs: number[] = [];
    const faceRs: number[] = [];
    for (let i = 0; i < radii.length; i++) {
      if (radii[i] < medianR * 0.88 || radii[i] > medianR * 1.08) continue;
      facePhis.push(phis[i]);
      faceZs.push(zs[i]);
      faceRs.push(radii[i]);
    }
    if (facePhis.length < 16) return null;

    const sortedPhi = facePhis.slice().sort((a, b) => a - b);
    let largestGap = -1;
    let gapAfter = -1;
    for (let i = 0; i < sortedPhi.length; i++) {
      const gapVal = i < sortedPhi.length - 1
        ? sortedPhi[i + 1] - sortedPhi[i]
        : (sortedPhi[0] + Math.PI * 2) - sortedPhi[sortedPhi.length - 1];
      if (gapVal > largestGap) {
        largestGap = gapVal;
        gapAfter = i;
      }
    }

    const startIdx = (gapAfter + 1) % sortedPhi.length;
    const arc: number[] = [];
    for (let k = 0; k < sortedPhi.length; k++) {
      const idx = (startIdx + k) % sortedPhi.length;
      let phi = sortedPhi[idx];
      if (arc.length > 0) {
        while (phi < arc[arc.length - 1]) phi += Math.PI * 2;
      }
      arc.push(phi);
    }

    const zSorted = faceZs.slice().sort((a, b) => a - b);
    const trim = Math.max(1, Math.floor(zSorted.length * 0.02));
    const radius = faceRs.reduce((s, v) => s + v, 0) / faceRs.length;

    return {
      radius,
      zMin: zSorted[trim],
      zMax: zSorted[zSorted.length - 1 - trim],
      phiStart: arc[0],
      phiEnd: arc[arc.length - 1]
    };
  }

  private createCalorimeterBarInstances(
    cells: Array<{
      position: THREE.Vector3;
      panel: number;
      phiIndex: number;
      zIndex: number;
      pitchPhi: number;
      pitchZ: number;
      outwardX: number;
      outwardY: number;
      tangentX: number;
      tangentY: number;
    }>,
    energies: Float32Array,
    detector: CalorimeterDetectorId = 'emcal'
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.caloBarGeometry, this.caloBarMaterial, cells.length);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const outward = new THREE.Vector3();
    const tangential = new THREE.Vector3();
    const beam = new THREE.Vector3(0, 0, 1);
    const colX = new THREE.Vector3();
    const colY = new THREE.Vector3();
    const colZ = new THREE.Vector3();
    const fill = EventDisplayComponent.CALO_BAR_PITCH_FILL;
    const minH = EventDisplayComponent.CALO_BAR_MIN_HEIGHT;
    const maxH = EventDisplayComponent.CALO_BAR_MAX_HEIGHT;
    const panels = caloPanelsFor(detector);

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const base = cell.position;
      // Same normal for every cell on a flat rectangular plate.
      outward.set(cell.outwardX, cell.outwardY, 0).normalize();
      tangential.set(cell.tangentX, cell.tangentY, 0).normalize();

      const energy = Math.max(
        0,
        energies[caloFlatIndex(cell.panel, cell.phiIndex, cell.zIndex, panels)] ?? energies[i] ?? 0
      );
      const height = energy <= 0 ? 0 : minH + Math.min(1, energy) * (maxH - minH);
      if (height <= 0) {
        matrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, matrix);
        continue;
      }

      const sizePhi = Math.max(1e-4, cell.pitchPhi * fill);
      const sizeZ = Math.max(1e-4, cell.pitchZ * fill);

      position.copy(base).addScaledVector(outward, height * 0.5);
      // Basis: X = flat panel width, Y = panel normal (bar height), Z = beam.
      matrix.makeBasis(
        colX.copy(tangential).multiplyScalar(sizePhi),
        colY.copy(outward).multiplyScalar(height),
        colZ.copy(beam).multiplyScalar(sizeZ)
      );
      matrix.setPosition(position);
      mesh.setMatrixAt(i, matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  private static hash01(i: number, salt: number): number {
    const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453123;
    return x - Math.floor(x);
  }

  private zeroDetectorSceneOpacity(object: THREE.Object3D): void {
    object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mats = Array.isArray((o as THREE.Mesh).material)
          ? ((o as THREE.Mesh).material as THREE.Material[])
          : [(o as THREE.Mesh).material as THREE.Material];
        mats.forEach((mat) => { if (mat) (mat as any).opacity = 0; });
      }
    });
  }

  private fadeInDetectorScene(object: THREE.Object3D, durationMs: number): void {
    object.visible = true;
    const start = performance.now();
    const step = () => {
      const t = Math.min((performance.now() - start) / durationMs, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      object.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const mats = Array.isArray((o as THREE.Mesh).material)
            ? ((o as THREE.Mesh).material as THREE.Material[])
            : [(o as THREE.Mesh).material as THREE.Material];
          mats.forEach((mat) => {
            if (!mat) return;
            const base = (mat as any).userData?.baseOpacity ?? EventDisplayComponent.DETECTOR_COMPONENT_OPACITY;
            (mat as any).opacity = base * ease;
          });
        }
      });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private staggeredRevealDetectorParts(
    modelPaths: string[],
    staggerMs = 350,
    fadeDurationMs = 500
  ): void {
    let index = 0;
    const revealNext = () => {
      if (index >= modelPaths.length) {
        this.applyUiDetectorOpacities();
        return;
      }
      const path = modelPaths[index++];
      const scene = this.detectorPartRootByPath.get(path);
      if (scene) {
        this.fadeInDetectorScene(scene, fadeDurationMs);
      }
      if (index < modelPaths.length) {
        setTimeout(revealNext, staggerMs);
      } else {
        setTimeout(() => this.applyUiDetectorOpacities(), fadeDurationMs);
      }
    };
    revealNext();
  }

  @Input()
  get sideViewsShown(): boolean { return this._sideViewsShown; }
  set sideViewsShown(sideViewsShown: boolean) {
    this._sideViewsShown = sideViewsShown;
    this.resize(true);
  }
  private _sideViewsShown: boolean = false;

  @Input()
  get axesShown(): boolean { return this.axes.visible; }
  set axesShown(axesShown: boolean) {
    this.axes.visible = axesShown;
  }

  @Input()
  get detectorShown(): boolean { return this.detector.visible; }
  set detectorShown(detectorShown: boolean) {
    this.detector.visible = detectorShown;
    this.calorimeterReadouts.visible = detectorShown;
    if (detectorShown) {
      this.syncCalorimeterReadoutVisibility();
    }
  }

  private desiredTracksShown = true;
  private desiredClustersShown = true;
  private desiredDecaysShown = true;
  private _showProtonCollisionIntro = false;

  @Input()
  get tracksShown(): boolean { return this.desiredTracksShown; }
  set tracksShown(tracksShown: boolean) {
    this.desiredTracksShown = tracksShown;
    this.applyDesiredPhysicsVisibility();
  }

  @Input()
  hasClusters: boolean;

  @Input()
  get clustersShown(): boolean { return this.desiredClustersShown; }
  set clustersShown(clustersShown: boolean) {
    this.desiredClustersShown = clustersShown;
    this.applyDesiredPhysicsVisibility();
  }

  @Input()
  get decaysShown(): boolean { return this.desiredDecaysShown; }
  set decaysShown(decaysShown: boolean) {
    this.desiredDecaysShown = decaysShown;
    this.applyDesiredPhysicsVisibility();
  }

  @Input()
  get showProtonCollisionIntro(): boolean { return this._showProtonCollisionIntro; }
  set showProtonCollisionIntro(show: boolean) {
    const v = !!show;
    if (v === this._showProtonCollisionIntro) return;
    this._showProtonCollisionIntro = v;
    if (!v) {
      this.cancelProtonCollisionIntroAndRevealTracks();
    }
  }

  private createLine(track: number[][], material: THREE.Material): THREE.Object3D {
    let mesh: THREE.Object3D;
    const first = track[0];
    const last = track[track.length - 1];
    const firstR2 = first[0] * first[0] + first[1] * first[1] + first[2] * first[2];
    const lastR2 = last[0] * last[0] + last[1] * last[1] + last[2] * last[2];
    const orderedTrack = firstR2 <= lastR2 ? track : [...track].reverse();
    const points: Array<THREE.Vector3> = [];
    for (let point of orderedTrack) {
      points.push(new THREE.Vector3(
        EventDisplayComponent.objectScale * point[0],
        EventDisplayComponent.objectScale * point[1],
        EventDisplayComponent.objectScale * point[2]
      ));
    }
    const spline = new THREE.CatmullRomCurve3(points);
    const vertices = spline.getPoints(EventDisplayComponent.lineSegments);
    const points2 = [];
    for (let v of vertices) {
      points2.push(v.x, v.y, v.z);
    }
    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions(points2);
    mesh = new Line2(lineGeometry, material as LineMaterial);
    mesh.renderOrder = EventDisplayComponent.PHYSICS_RENDER_ORDER_BASE + 500;
    (mesh as Line2).computeLineDistances();
    const totalSegments = Math.max(1, vertices.length - 1);
    (mesh as any).userData = { ...((mesh as any).userData || {}), drawMode: 'line2', drawTotal: totalSegments };
    lineGeometry.setDrawRange(0, 1);
    return mesh;
  }

  private queueTrackDrawAnimation(line: THREE.Object3D): void {
    const drawTotal = (line as any).userData?.drawTotal;
    if (drawTotal == null) return;
    this.trackDrawAnimations.push(line);
  }

  private updateTrackDrawAnimations(): void {
    if (this.isCollisionIntroBlockingPhysics()) return;
    if (this.trackDrawAnimations.length === 0) return;
    const now = performance.now();
    const progress = Math.min(1, (now - this.trackDrawAnimationStartMs) / this.TRACK_DRAW_ANIMATION_MS);

    for (const line of this.trackDrawAnimations) {
      const userData = (line as any).userData || {};
      const drawMode = userData.drawMode;
      const drawTotal = userData.drawTotal as number;
      const geometry = (line as any).geometry as THREE.BufferGeometry;
      if (!geometry || !drawTotal) continue;
      if (drawMode === 'line2') {
        geometry.setDrawRange(0, Math.max(1, Math.floor(drawTotal * progress)));
      } else {
        geometry.setDrawRange(0, Math.max(2, Math.floor(drawTotal * progress)));
      }
    }

    if (progress >= 1) {
      this.trackDrawAnimations = [];
    }
  }

  private isCollisionIntroBlockingPhysics(): boolean {
    return this.collisionIntroPhase === 'loading' || this.collisionIntroPhase === 'animating';
  }

  /** Applies parent's track/decay/cluster toggles unless the proton intro hides physics layers. */
  private applyDesiredPhysicsVisibility(): void {
    if (this.isCollisionIntroBlockingPhysics()) {
      this.tracks.visible = false;
      this.decays.visible = false;
      this.clusters.visible = false;
      this.calorimeterReadouts.visible = false;
      this.cascadeVertexMarkers.visible = false;
      this.primaryVertexMarkers.visible = false;
      return;
    }
    this.tracks.visible = this.desiredTracksShown;
    this.decays.visible = this.desiredDecaysShown;
    this.clusters.visible = this.desiredClustersShown;
    this.cascadeVertexMarkers.visible = this.desiredDecaysShown;
    this.primaryVertexMarkers.visible = this.desiredTracksShown && this.primaryVertexMarkers.children.length > 0;
    this.syncCalorimeterReadoutVisibility();
  }

  /** True while multipart drag-assembly is still in progress (progressive track reveal applies). */
  private shouldUseProgressiveTrackReveal(): boolean {
    return this.detectorMultipartAssemblyMode && !this._detectorInteractiveAssemblyDone;
  }

  private getAssemblyUnlockState(): AssemblyUnlockState {
    const paths = [...this.detectorPartRootByPath.keys()];
    const hasFile = (file: string) =>
      paths.some((p) => new RegExp(`(^|[/\\\\])${file}\\.glb($|\\?)`, 'i').test(p));
    return {
      hasIts: hasFile('its'),
      hasTpc: hasFile('tpc'),
      hasTrd: hasFile('trd'),
      hasTof: hasFile('tof'),
      hasEmcal: hasFile('emcal'),
      hasDcal: hasFile('dcal'),
      hasPhos: hasFile('phos'),
      hasL3: hasFile('l3'),
    };
  }

  /** Rebuild tracks/markers when the set of snapped detector parts changes. */
  private refreshPhysicsForAssemblyUnlock(): void {
    if (!this._event) {
      return;
    }
    const deferTrackDraw = this.isCollisionIntroBlockingPhysics();
    this.trackDrawAnimations = [];
    if (deferTrackDraw) {
      this.pendingTrackDrawLines = [];
    } else {
      this.trackDrawAnimationStartMs = performance.now();
    }
    this.rebuildTracksFromEvent(deferTrackDraw);
    this.applyDesiredPhysicsVisibility();
    this.cdr.markForCheck();
  }

  private clearPrimaryVertexMarkers(): void {
    while (this.primaryVertexMarkers.children.length > 0) {
      const child = this.primaryVertexMarkers.children[0];
      this.primaryVertexMarkers.remove(child);
      if ((child as THREE.Mesh).geometry) {
        (child as THREE.Mesh).geometry.dispose();
      }
      const mat = (child as THREE.Mesh).material;
      if (mat) {
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat.dispose();
        }
      }
    }
  }

  private estimatePrimaryVertexPosition(tracks: Track[]): number[] {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    for (const track of tracks || []) {
      const traj = track.trajectory;
      if (!traj?.length) {
        continue;
      }
      const p0 = traj[0];
      const r = Math.hypot(p0[0], p0[1]);
      if (r > EventDisplayComponent.ITS_STUB_RADIUS) {
        continue;
      }
      sx += p0[0];
      sy += p0[1];
      sz += p0[2];
      n++;
    }
    if (n === 0) {
      return [0, 0, 0];
    }
    return [sx / n, sy / n, sz / n];
  }

  private trajectoryForAssemblyMode(trajectory: number[][], stubOnly: boolean): number[][] | null {
    if (!trajectory?.length) {
      return null;
    }
    const points = stubOnly
      ? EventDisplayComponent.clipTrajectoryToRadius(trajectory, EventDisplayComponent.ITS_STUB_RADIUS)
      : trajectory;
    return points.length >= 2 ? points : null;
  }

  /**
   * Builds background + decay track meshes (and vertex markers) according to
   * assembly unlock: ITS-only → stubs + primary vertex; TPC → full trajectories.
   */
  private rebuildTracksFromEvent(deferTrackDrawForIntro: boolean): void {
    this.tracks.clear();
    this.decays.clear();
    this.cascadeVertexMarkers.clear();
    this.clearPrimaryVertexMarkers();

    if (!this._event) {
      return;
    }

    const progressive = this.shouldUseProgressiveTrackReveal();
    const unlock = this.getAssemblyUnlockState();
    const showFull = !progressive || unlock.hasTpc;
    const showStubs = progressive && unlock.hasIts && !unlock.hasTpc;

    if (!showFull && !showStubs) {
      return;
    }

    const stubOnly = showStubs;

    if (showFull) {
      const cascadeVertices = this.getCascadeVertices(this._event);
      for (const v of cascadeVertices) {
        this.cascadeVertexMarkers.add(this.createVertexMarker(v.pos, v.label));
      }
      this.cascadeVertexMarkers.visible = this.desiredDecaysShown;
    }

    if (showStubs) {
      const pv = this.estimatePrimaryVertexPosition(this._event.tracks);
      this.primaryVertexMarkers.add(this.createVertexMarker(pv, 'Primary Vertex'));
    }

    for (const track of this._event.tracks) {
      const traj = this.trajectoryForAssemblyMode(track.trajectory, stubOnly);
      if (!traj) {
        continue;
      }
      const line = this.createLine(traj, this.trackMaterial);
      this.tracks.add(line);
      if (deferTrackDrawForIntro) {
        this.pendingTrackDrawLines.push(line);
      } else {
        this.queueTrackDrawAnimation(line);
      }
    }

    for (const particleList of this._event.decays) {
      const decayObject = new THREE.Object3D();
      for (const track of particleList) {
        const traj = this.trajectoryForAssemblyMode(track.trajectory, stubOnly);
        if (!traj) {
          continue;
        }
        let material: THREE.Material;
        if (track.type === TrackType.CASCADE_BACHELOR) {
          material = this.bachelorTrackMaterial;
        } else if (track.sign < 0) {
          material = this.negativeTrackMaterial;
        } else if (track.sign > 0) {
          material = this.postiveTrackMaterial;
        } else {
          material = this.trackMaterial;
        }
        const line = this.createLine(traj, material);
        (line as any).userData = { ...(line as any).userData, ...track, trackLabel: this.getTrackLabel(track) };
        decayObject.add(line);
        if (deferTrackDrawForIntro) {
          this.pendingTrackDrawLines.push(line);
        } else {
          this.queueTrackDrawAnimation(line);
        }
      }
      if (decayObject.children.length > 0) {
        this.decays.add(decayObject);
      }
      break;
    }
  }

  private clearCollisionProtonModels(): void {
    while (this.collisionProtonsGroup.children.length > 0) {
      const c = this.collisionProtonsGroup.children[0];
      this.collisionProtonsGroup.remove(c);
      c.traverse((o: THREE.Object3D) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = o as THREE.Mesh;
          m.geometry?.dispose?.();
          const mat = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose?.());
          else mat?.dispose?.();
        }
      });
    }
    this.protonPlusZMesh = null;
    this.protonMinusZMesh = null;
    this.collisionProtonsGroup.visible = false;
  }

  private beginProtonCollisionIntroLoad(): void {
    if (!this._event || !this.showProtonCollisionIntro) return;
    this.clearCollisionProtonModels();
    this.collisionIntroPhase = 'loading';
    this.loaderGLTF.load(
      this.protonModelUrl,
      (gltf: GLTF) => {
      if (
        !this._event ||
        !this.showProtonCollisionIntro ||
        this.collisionIntroPhase !== 'loading'
      ) {
        return;
      }
      const tpl = gltf.scene;
      const plus = tpl.clone(true);
      const minus = tpl.clone(true);
      const bbox = new THREE.Box3().setFromObject(tpl);
      const size = bbox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
      const targetDiameter =
        EventDisplayComponent.objectScale * 10;
      const uniform = targetDiameter / maxDim;
      plus.scale.setScalar(uniform);
      minus.scale.setScalar(uniform);

      plus.updateMatrixWorld(true);
      minus.updateMatrixWorld(true);
      const sph = new THREE.Sphere();
      new THREE.Box3().setFromObject(plus).getBoundingSphere(sph);
      this.protonRadiusWorld = sph.radius;

      const halfSep = Math.max(this.protonHalfSeparationStart, this.protonRadiusWorld * 2.6);
      minus.position.set(0, 0, -halfSep);
      plus.position.set(0, 0, halfSep);
      minus.traverse(this.setIntroProtonPresentationalState);
      plus.traverse(this.setIntroProtonPresentationalState);
      this.collisionProtonsGroup.add(minus);
      this.collisionProtonsGroup.add(plus);
      this.protonMinusZMesh = minus;
      this.protonPlusZMesh = plus;
      this.collisionProtonsGroup.visible = true;
      this.collisionIntroPhase = 'animating';
    },
      undefined,
      () => {
        this.collisionIntroPhase = null;
        this.clearCollisionProtonModels();
        if (this.pendingTrackDrawLines.length) {
          const pending = [...this.pendingTrackDrawLines];
          this.pendingTrackDrawLines = [];
          for (const line of pending) {
            this.queueTrackDrawAnimation(line);
          }
          this.trackDrawAnimationStartMs = performance.now();
        }
        this.applyDesiredPhysicsVisibility();
      }
    );
  }

  private setIntroProtonPresentationalState = (o: THREE.Object3D): void => {
    if ((o as THREE.Mesh).isMesh) {
      const m = (o as THREE.Mesh).material;
      const mats: THREE.Material[] = Array.isArray(m) ? m : m ? [m] : [];
      for (const mat of mats) {
        mat.depthWrite = true;
        mat.needsUpdate = true;
      }
      o.renderOrder = EventDisplayComponent.PHYSICS_RENDER_ORDER_BASE + 8000;
    }
  };

  private completeCollisionIntro(): void {
    if (this.collisionIntroPhase === null || this.collisionIntroPhase === 'loading') return;
    this.collisionIntroPhase = null;
    this.clearCollisionProtonModels();
    for (const line of this.pendingTrackDrawLines) {
      this.queueTrackDrawAnimation(line);
    }
    this.pendingTrackDrawLines = [];
    this.trackDrawAnimationStartMs = performance.now();
    this.applyDesiredPhysicsVisibility();
  }

  private cancelProtonCollisionIntroAndRevealTracks(): void {
    const blocking = this.isCollisionIntroBlockingPhysics();
    if (!blocking && this.pendingTrackDrawLines.length === 0) return;
    const pending = [...this.pendingTrackDrawLines];
    this.pendingTrackDrawLines = [];
    this.collisionIntroPhase = null;
    this.clearCollisionProtonModels();
    for (const line of pending) {
      this.queueTrackDrawAnimation(line);
    }
    if (pending.length) {
      this.trackDrawAnimationStartMs = performance.now();
    }
    this.applyDesiredPhysicsVisibility();
  }

  private updateProtonCollisionIntro(deltaWallMs: number): void {
    if (this.collisionIntroPhase !== 'animating' || !this.protonPlusZMesh || !this.protonMinusZMesh) return;
    const dt = Math.min(Math.max(deltaWallMs, 0), 72);
    const step = this.protonApproachSpeed * dt;
    this.protonPlusZMesh.position.z -= step;
    this.protonMinusZMesh.position.z += step;
    const sep = this.protonPlusZMesh.position.z - this.protonMinusZMesh.position.z;
    if (sep <= 2 * this.protonRadiusWorld * 1.02) {
      this.completeCollisionIntro();
    }
  }

  private invariantMass(tracks: Track[]): number {
    let E = 0, px = 0, py = 0, pz = 0;
    for (const t of tracks) {
      if (!t) return NaN;
      E += t.E;
      px += t.px;
      py += t.py;
      pz += t.pz;
    }
    const m2 = E * E - px * px - py * py - pz * pz;
    return m2 > 0 ? Math.sqrt(m2) : NaN;
  }

  private getCascadeVertices(event: Event): { pos: number[]; label: string }[] {
    const vertices: { pos: number[]; label: string }[] = [];
    const decays = event.decays || [];
    if (decays.length === 0) return vertices;
    const decay = decays[0];
    if (decay.length === 3) {
      const [t0, t1, bach] = decay;
      if (!t0?.trajectory?.length || !t1?.trajectory?.length || !bach?.trajectory?.length) return vertices;
      const lambdaMass = this.invariantMass([t0, t1]);
      const xiMass = this.invariantMass([t0, t1, bach]);
      const lambdaOk = !isNaN(lambdaMass) && lambdaMass >= EventDisplayComponent.LAMBDA_MASS_MIN && lambdaMass <= EventDisplayComponent.LAMBDA_MASS_MAX;
      const xiOk = !isNaN(xiMass) && xiMass >= EventDisplayComponent.XI_MASS_MIN && xiMass <= EventDisplayComponent.XI_MASS_MAX;
      const v0Label = lambdaOk
        ? (t0.sign < 0 ? 'Λ decay vertex (p + π⁻)' : 'Λ̄ decay vertex (p̄ + π⁺)')
        : 'V0';
      const vertex1Label = xiOk
        ? (bach.sign < 0 ? 'Ξ⁻ decay vertex (π⁻ + Λ)' : 'Ξ⁺ decay vertex (π⁺ + Λ̄)')
        : 'Vertex1';
      const v0Pos = [
        (t0.trajectory[0][0] + t1.trajectory[0][0]) / 2,
        (t0.trajectory[0][1] + t1.trajectory[0][1]) / 2,
        (t0.trajectory[0][2] + t1.trajectory[0][2]) / 2
      ];
      const vertex1Pos = [bach.trajectory[0][0], bach.trajectory[0][1], bach.trajectory[0][2]];
      vertices.push({ pos: v0Pos, label: v0Label }, { pos: vertex1Pos, label: vertex1Label });
    } else if (decay.length === 2) {
      const [t0, t1] = decay;
      if (!t0?.trajectory?.length || !t1?.trajectory?.length) return vertices;
      const lambdaMass = this.invariantMass([t0, t1]);
      const lambdaOk = !isNaN(lambdaMass) && lambdaMass >= EventDisplayComponent.LAMBDA_MASS_MIN && lambdaMass <= EventDisplayComponent.LAMBDA_MASS_MAX;
      const hasProtonAndPion = (t0.sign > 0 && t1.sign < 0) || (t0.sign < 0 && t1.sign > 0);
      if (!lambdaOk || !hasProtonAndPion) return vertices;
      const v0Pos = [
        (t0.trajectory[0][0] + t1.trajectory[0][0]) / 2,
        (t0.trajectory[0][1] + t1.trajectory[0][1]) / 2,
        (t0.trajectory[0][2] + t1.trajectory[0][2]) / 2
      ];
      const v0Label = t0.sign < 0 ? 'Λ decay vertex (p + π⁻)' : 'Λ̄ decay vertex (p̄ + π⁺)';
      vertices.push({ pos: v0Pos, label: v0Label });
    }
    return vertices;
  }

  private getTrackLabel(track: Track): string {
    if (track.type === TrackType.CASCADE_BACHELOR) return 'π⁻ track';
    if (track.sign > 0) return 'proton track';
    if (track.sign < 0) return 'π⁻ track';
    return 'track';
  }

  private createVertexMarker(position: number[], label: string): THREE.Mesh {
    const scale = EventDisplayComponent.objectScale;
    const geometry = new THREE.SphereGeometry(EventDisplayComponent.VERTEX_MARKER_RADIUS, 16, 14);
    const material = new THREE.MeshBasicMaterial({
      color: 0xFF0000,
      depthTest: false,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0] * scale, position[1] * scale, position[2] * scale);
    mesh.renderOrder = EventDisplayComponent.PHYSICS_RENDER_ORDER_BASE + 9999;
    (mesh as any).userData = { vertexLabel: label };
    return mesh;
  }

  @Input()
  get event(): Event { return this._event; }
  set event(event: Event) {
    this._event = event;
    this.tracks.clear();
    this.decays.clear();
    this.clusters.clear();
    this.cascadeVertexMarkers.clear();
    this.clearPrimaryVertexMarkers();
    if (this.cascadeConnectorLine) {
      this.scene.remove(this.cascadeConnectorLine);
      this.cascadeConnectorLine.geometry.dispose();
      (this.cascadeConnectorLine.material as THREE.Material).dispose();
      this.cascadeConnectorLine = null;
    }
    if (this.cascadeXiLine) {
      this.scene.remove(this.cascadeXiLine);
      this.cascadeXiLine.geometry.dispose();
      (this.cascadeXiLine.material as THREE.Material).dispose();
      this.cascadeXiLine = null;
    }
    if (this.lambdaFlightLine2Track) {
      this.scene.remove(this.lambdaFlightLine2Track);
      this.lambdaFlightLine2Track.geometry.dispose();
      (this.lambdaFlightLine2Track.material as THREE.Material).dispose();
      this.lambdaFlightLine2Track = null;
    }
    this.cascadeMarkerEnhanced = false;
    this.cascadeMarkerOrigColors = [];
    this.closeVertexPanel();
    this.trackDrawAnimations = [];
    this.pendingTrackDrawLines = [];
    this.collisionIntroPhase = null;
    this.lastRenderWallMs = 0;
    const deferTrackDrawForIntro =
      this._event !== null && this.showProtonCollisionIntro;
    if (deferTrackDrawForIntro) {
      this.clearCollisionProtonModels();
      this.collisionIntroPhase = 'loading';
    } else {
      this.collisionIntroPhase = null;
      this.clearCollisionProtonModels();
    }
    this.trackDrawAnimationStartMs = deferTrackDrawForIntro
      ? 0
      : performance.now();
    this.loading = true;
    if (this._event !== null) {
      this.rebuildTracksFromEvent(deferTrackDrawForIntro);
      if (this._event.clusters && this._event.clusters.length > 0) {
        const points: Array<THREE.Vector3> = [];
        for (let point of this._event.clusters) {
          points.push(new THREE.Vector3(
            EventDisplayComponent.objectScale * point[0],
            EventDisplayComponent.objectScale * point[1],
            EventDisplayComponent.objectScale * point[2]
          ));
        }
        if (this.CLUSTERS_USE_POINTS) {
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const pointsMesh = new THREE.Points(geometry, this.pointsMaterial);
          pointsMesh.renderOrder = EventDisplayComponent.PHYSICS_RENDER_ORDER_BASE + 500;
          this.clusters.add(pointsMesh);
        } else {
          for (let point of points) {
            const geometry = new THREE.SphereGeometry(this.clusterSize, 4, 4);
            const sphereMesh = new THREE.Mesh(geometry, this.pointsMaterial as THREE.Material);
            sphereMesh.position.set(point.x, point.y, point.z);
            sphereMesh.scale.set(this.clusterSize, this.clusterSize, this.clusterSize);
            this.clusters.add(sphereMesh);
          }
        }
      }
    }
    this.rebuildCalorimeterReadouts();
    this.applyDesiredPhysicsVisibility();
    if (deferTrackDrawForIntro) {
      this.beginProtonCollisionIntroLoad();
    }
    this.loading = false;
  }
  private _event: Event;

  @Output()
  trackClickedEvent: EventEmitter<Track> = new EventEmitter<Track>();

  @Input()
  previousEventButtonDisabled: boolean = false;

  @Input()
  nextEventButtonDisabled: boolean = false;

  @Output()
  previousEvent: EventEmitter<any> = new EventEmitter();

  @Output()
  nextEvent: EventEmitter<any> = new EventEmitter();

  /** Emits asset path once a multipart palette piece snaps onto the detector (during interactive assembly only). */
  @Output()
  detectorAssemblyPiecePlaced: EventEmitter<string> = new EventEmitter();

  /** Highlights the palette card for this asset path while building (e.g. guided coach hint). */
  @Input()
  assemblyCoachHighlightAssetPath: string | null = null;

  private rendernig: Observable<number> = scheduled([0], animationFrameScheduler).pipe(repeat());
  private renderingSubscription: Subscription = null;

  constructor(private cdr: ChangeDetectorRef) {
    const lineParams = {
      linewidth: this.trackWidth,
      resolution: new THREE.Vector2(1, 1),
      depthTest: false,
    };
    this.trackMaterial = new LineMaterial({ color: EventDisplayComponent.trackColor, ...lineParams });
    this.postiveTrackMaterial = new LineMaterial({ color: EventDisplayComponent.positiveTrackColor, ...lineParams });
    this.negativeTrackMaterial = new LineMaterial({ color: EventDisplayComponent.negativeTrackColor, ...lineParams });
    this.bachelorTrackMaterial = new LineMaterial({ color: EventDisplayComponent.bachelorTrackColor, ...lineParams });
    this.highlightTrackMaterial = new LineMaterial({ color: EventDisplayComponent.highlightColor, ...lineParams });
    const cascadeHoverParams = { linewidth: 6 * this.trackWidth, resolution: new THREE.Vector2(1, 1), depthTest: false };
    this.cascadeHoverTrackMaterial = new LineMaterial({ color: 0x000000, ...cascadeHoverParams });
    this.cascadeProtonMaterial = new LineMaterial({ color: 0x000080, ...cascadeHoverParams });
    this.pointsMaterial = new THREE.PointsMaterial({
      color: EventDisplayComponent.clusterColor,
      size: this.clusterSize,
      map: EventDisplayComponent.createCirclePointTexture(),
      transparent: true,
      alphaTest: 0.5,
      depthTest: false,
      sizeAttenuation: true,
    });
    this.caloBarGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.caloBarMaterial = new THREE.MeshStandardMaterial({
      color: EventDisplayComponent.caloBarColorLight,
      roughness: 0.45,
      metalness: 0.05,
      depthTest: true,
      depthWrite: true,
    });
    this.applyCalorimeterBarTheme();
  }

  /** Circular point sprite for cluster PointsMaterial. */
  private static createCirclePointTexture(): THREE.CanvasTexture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, size, size);
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.65, 'rgba(255,255,255,1)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private resize(force: boolean): void {
    if (this.canvasRef && this.canvas && this.renderer) {
      const parent = this.canvas.parentElement;
      const displayWidth = parent.clientWidth;
      const displayHeight = parent.clientHeight;
      const basePixelRatio = window.devicePixelRatio || 1;
      const targetPixelRatio = this.effectiveSideViewsShown
        ? Math.max(1, basePixelRatio * this.SIDE_VIEW_PIXEL_RATIO_FACTOR)
        : basePixelRatio;
      if (Math.abs(this.renderer.getPixelRatio() - targetPixelRatio) > 0.01) {
        this.renderer.setPixelRatio(targetPixelRatio);
        this.composer?.setPixelRatio(targetPixelRatio);
        force = true;
      }
      if (force || this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
        this.renderer.setSize(displayWidth, displayHeight);
        this.composer?.setSize(displayWidth, displayHeight);
        if (this.effectiveSideViewsShown) {
          if (this.landscape) {
            const width3D = Math.ceil(this.canvas.clientWidth * this.PRIMARY_AXIS_RATIO);
            const width = this.canvas.clientWidth - width3D;
            const height = Math.ceil(this.canvas.clientHeight * this.SECONDARY_AXIS_RATIO);
            this.camera3D.aspect = width3D / this.canvas.clientHeight;
            this.cameraRphi.aspect = this.cameraRhoz.aspect = width / height;
          } else {
            const width = Math.ceil(this.canvas.clientWidth * this.SECONDARY_AXIS_RATIO);
            const height3D = Math.ceil(this.canvas.clientHeight * this.PRIMARY_AXIS_RATIO);
            const height = this.canvas.clientHeight - height3D;
            this.camera3D.aspect = this.canvas.clientWidth / height3D;
            this.cameraRphi.aspect = this.cameraRhoz.aspect = width / height;
          }
          this.cameraRphi.updateProjectionMatrix();
          this.cameraRhoz.updateProjectionMatrix();
        } else {
          this.camera3D.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        }
        this.camera3D.updateProjectionMatrix();
      }
    }
  }

  ngAfterViewInit(): void {
    this.createScene();
    this.renderingSubscription = this.rendernig.subscribe(() => this.render());
  }

  ngOnDestroy(): void {
    this.renderingSubscription?.unsubscribe();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas?.removeEventListener('wheel', this.onWheel);
    this.clearGridBackground();
    this.clearCollisionProtonModels();
    this.clearCalorimeterReadouts();
    this.caloBarGeometry?.dispose();
    this.caloBarMaterial?.dispose();
  }

  private clearGridBackground(): void {
    for (const helper of this.gridHelpers) {
      this.scene.remove(helper);
      helper.geometry.dispose();
      const material = helper.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) {
        material.forEach((m) => m.dispose());
      } else {
        material.dispose();
      }
    }
    this.gridHelpers = [];
  }

  private syncGridBackground(): void {
    this.clearGridBackground();
    if (!this._showGridBackground) return;

    const size = 220;
    const divisions = 90;
    const white = 0xffffff;

    const gridXZ = new THREE.GridHelper(size, divisions, white, white);
    gridXZ.material.transparent = true;
    (gridXZ.material as THREE.Material).opacity = 0.22;
    gridXZ.position.set(0, 0, 0);

    const gridXY = new THREE.GridHelper(size, divisions, white, white);
    gridXY.rotation.x = Math.PI / 2;
    gridXY.material.transparent = true;
    (gridXY.material as THREE.Material).opacity = 0.12;
    gridXY.position.set(0, 0, 0);

    const gridYZ = new THREE.GridHelper(size, divisions, white, white);
    gridYZ.rotation.z = Math.PI / 2;
    gridYZ.material.transparent = true;
    (gridYZ.material as THREE.Material).opacity = 0.12;
    gridYZ.position.set(0, 0, 0);

    this.gridHelpers = [gridXZ, gridXY, gridYZ];
    this.gridHelpers.forEach((g) => this.scene.add(g));
  }

  onCameraModeChange(): void {
    this.updateCameraMode();
  }

  private updateCameraMode(): void {
    if (!this.controls) return;
    if (this.cameraMode === 'centered') {
      this.controls.enablePan = false;
      this.controls.enableRotate = true;
      this.controls.target.set(0, 0, 0);
    } else {
      this.controls.enablePan = true;
      this.controls.enableRotate = false;
    }
    this.isMousePanning = false;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
    this.keysDown[e.key] = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysDown[e.key] = false;
  };

  private onWheel = (e: WheelEvent) => {
    if (this.cameraMode !== 'free' || !this.controls || !this.camera3D) return;
    e.preventDefault();
    const distance = this.controls.target.distanceTo(this.camera3D.position);
    const step = (e.deltaY > 0 ? 1 : -1) * distance * EventDisplayComponent.WHEEL_PAN_FACTOR;
    this.panDir.subVectors(this.controls.target, this.camera3D.position).normalize();
    this.panVec.copy(this.panDir).multiplyScalar(step);
    this.camera3D.position.add(this.panVec);
  };

  private onPointerUp = () => {
    this.isMousePanning = false;
  };

  private applyMousePan(deltaX: number, deltaY: number): void {
    if (!this.controls || !this.camera3D) return;
    const distance = this.controls.target.distanceTo(this.camera3D.position);
    const scale = distance * EventDisplayComponent.MOUSE_DRAG_PAN_FACTOR;
    this.panDir.subVectors(this.controls.target, this.camera3D.position).normalize();
    this.panRight.crossVectors(this.panDir, this.camera3D.up).normalize();
    const up = this.camera3D.up.clone().normalize();
    this.panVec.set(0, 0, 0);
    this.panVec.addScaledVector(this.panRight, -deltaX * scale);
    this.panVec.addScaledVector(up, deltaY * scale);
    this.camera3D.position.add(this.panVec);
    this.controls.target.add(this.panVec);
  }

  private applyKeyboardPan(): void {
    if (this.cameraMode !== 'free' || !this.controls || !this.camera3D) return;
    const focusEl = document.activeElement as HTMLElement;
    if (focusEl?.tagName === 'INPUT' || focusEl?.tagName === 'TEXTAREA' || focusEl?.isContentEditable) return;
    const k = this.keysDown;
    if (!k['w'] && !k['W'] && !k['ArrowUp'] && !k['s'] && !k['S'] && !k['ArrowDown'] &&
        !k['a'] && !k['A'] && !k['ArrowLeft'] && !k['d'] && !k['D'] && !k['ArrowRight'] &&
        !k['q'] && !k['Q'] && !k['e'] && !k['E']) return;
    const distance = this.controls.target.distanceTo(this.camera3D.position);
    const step = distance * EventDisplayComponent.PAN_SPEED_FACTOR;
    this.panDir.subVectors(this.controls.target, this.camera3D.position).normalize();
    this.panRight.crossVectors(this.panDir, this.camera3D.up).normalize();
    this.panVec.set(0, 0, 0);
    if (k['w'] || k['W'] || k['ArrowUp']) this.panVec.add(this.panDir);
    if (k['s'] || k['S'] || k['ArrowDown']) this.panVec.sub(this.panDir);
    if (k['d'] || k['D'] || k['ArrowRight']) this.panVec.add(this.panRight);
    if (k['a'] || k['A'] || k['ArrowLeft']) this.panVec.sub(this.panRight);
    if (k['e'] || k['E']) this.panVec.y += 1;
    if (k['q'] || k['Q']) this.panVec.y -= 1;
    if (this.panVec.lengthSq() > 0) {
      this.panVec.normalize().multiplyScalar(step);
      this.camera3D.position.add(this.panVec);
      this.controls.target.add(this.panVec);
    }
  }

  private render(): void {
    const nowWall = performance.now();
    const deltaWall = this.lastRenderWallMs ? nowWall - this.lastRenderWallMs : 0;
    this.lastRenderWallMs = nowWall;
    this.updateProtonCollisionIntro(deltaWall);
    this.updateTrackDrawAnimations();
    this.resize(false);
    if (this.cameraMode === 'centered') {
      this.controls.target.set(0, 0, 0);
    } else {
      this.applyKeyboardPan();
    }
    this.controls.update();
    const zoomz = this.controls.target.distanceTo(this.controls.object.position);
    this.cameraRphi.zoom = this.cameraRhoz.zoom = 10 / zoomz;
    this.cameraRphi.updateProjectionMatrix();
    this.cameraRhoz.updateProjectionMatrix();
    this.renderer.setScissorTest(this.effectiveSideViewsShown);
    const oldVP = new THREE.Vector4();
    this.renderer.getViewport(oldVP);
    if (this.effectiveSideViewsShown) {
      if (this.landscape) {
        const width3D = Math.ceil(oldVP.z * this.PRIMARY_AXIS_RATIO);
        const width = oldVP.z - width3D;
        const height = Math.ceil(oldVP.w * this.SECONDARY_AXIS_RATIO);
        this.cam3DVP.set(oldVP.x, oldVP.y, width3D, oldVP.w);
        this.camRphiVP.set(oldVP.x + width3D, oldVP.y, width, height);
        this.camRhozVP.set(oldVP.x + width3D, oldVP.y + height, width, height);
      } else {
        const width = Math.ceil(oldVP.z * this.SECONDARY_AXIS_RATIO);
        const height3D = Math.ceil(oldVP.w * this.PRIMARY_AXIS_RATIO);
        const height = oldVP.w - height3D;
        this.cam3DVP.set(oldVP.x, oldVP.y + height, oldVP.z, oldVP.w - height);
        this.camRphiVP.set(oldVP.x, oldVP.y, width, height);
        this.camRhozVP.set(oldVP.x + width, oldVP.y, width, height);
      }
      this.renderer.setViewport(this.camRphiVP);
      this.renderer.setScissor(this.camRphiVP);
      const materials = [this.trackMaterial, this.postiveTrackMaterial, this.negativeTrackMaterial, this.bachelorTrackMaterial, this.highlightTrackMaterial, this.cascadeHoverTrackMaterial, this.cascadeProtonMaterial];
      if (this.cascadeConnectorLine?.material) materials.push(this.cascadeConnectorLine.material);
      if (this.cascadeXiLine?.material) materials.push(this.cascadeXiLine.material);
      if (this.lambdaFlightLine2Track?.material) materials.push(this.lambdaFlightLine2Track.material);
      materials.forEach((m: any) => m.resolution?.set(this.camRphiVP.z, this.camRphiVP.w));
      this.renderer.render(this.scene, this.cameraRphi);
      this.renderer.setViewport(this.camRhozVP);
      this.renderer.setScissor(this.camRhozVP);
      materials.forEach((m: any) => m.resolution?.set(this.camRhozVP.z, this.camRhozVP.w));
      this.renderer.render(this.scene, this.cameraRhoz);
    } else {
      this.cam3DVP.set(oldVP.x, oldVP.y, oldVP.z, oldVP.w);
    }
    this.renderer.setViewport(this.cam3DVP);
    this.renderer.setScissor(this.cam3DVP);
    const materials = [this.trackMaterial, this.postiveTrackMaterial, this.negativeTrackMaterial, this.bachelorTrackMaterial, this.highlightTrackMaterial, this.cascadeHoverTrackMaterial, this.cascadeProtonMaterial];
    if (this.cascadeConnectorLine?.material) materials.push(this.cascadeConnectorLine.material);
    if (this.cascadeXiLine?.material) materials.push(this.cascadeXiLine.material);
    if (this.lambdaFlightLine2Track?.material) materials.push(this.lambdaFlightLine2Track.material);
    materials.forEach((m: any) => m.resolution?.set(this.cam3DVP.z, this.cam3DVP.w));
    if (this.bloomPass?.enabled && this.composer && !this.effectiveSideViewsShown) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera3D);
    }
    this.renderer.setViewport(oldVP);
    this.renderer.setScissor(oldVP);
  }

  onPointerDown(event: PointerEvent) {
    if (this.cameraMode === 'free' && event.button === 0) {
      this.isMousePanning = true;
      this.lastMousePanX = event.clientX;
      this.lastMousePanY = event.clientY;
      return;
    }
    const intersects = this.findIntersect(event);
    if (intersects.length === 0) return;
    const obj = intersects[0].object as THREE.Mesh & { userData?: { vertexLabel?: string } };
    if (obj.userData?.vertexLabel != null) {
      const parent = this.canvas?.parentElement as HTMLElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        this.vertexPanelX = Math.max(0, event.clientX - rect.left - 20);
        this.vertexPanelY = Math.max(0, event.clientY - rect.top - 20);
      } else {
        this.vertexPanelX = 16;
        this.vertexPanelY = 16;
      }
      this.vertexPanelOpen = { label: obj.userData.vertexLabel };
      return;
    }
    if (this.decays.visible) {
      this.clearCascadeHover();
      if (this.trackHoverObj === null) {
        this.trackHoverObj = obj;
        this.trackHoverOrigMaterial = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        obj.material = this.highlightTrackMaterial;
        const highlightStop = () => {
          if (this.trackHoverObj !== null) {
            (this.trackHoverObj as THREE.Mesh).material = this.trackHoverOrigMaterial;
          }
          this.trackHoverObj = null;
          this.trackHoverOrigMaterial = null;
        };
        setTimeout(highlightStop, this.CLICK_HIGHLIGHT_DURATION);
      }
      this.trackClickedEvent.emit((obj as any).userData);
    }
  }

  onPointerMove(event: PointerEvent) {
    if (this.isMousePanning) {
      const deltaX = event.clientX - this.lastMousePanX;
      const deltaY = event.clientY - this.lastMousePanY;
      this.lastMousePanX = event.clientX;
      this.lastMousePanY = event.clientY;
      this.applyMousePan(deltaX, deltaY);
      return;
    }
    const intersects = this.findIntersect(event);
    const first = intersects[0]?.object as THREE.Mesh & { userData?: { vertexLabel?: string; trackLabel?: string } };
    const isMarkerByRaycast = first?.userData?.vertexLabel != null;
    const markerByProximity = !isMarkerByRaycast ? this.findMarkerByProximity(event) : null;
    const isMarker = isMarkerByRaycast || markerByProximity != null;
    let trackLabel = first?.userData?.trackLabel;
    if (!trackLabel && !isMarker) {
      const connectorProximity = this.cascadeConnectorLine ? this.findConnectorLineByProximity(event) : null;
      const xiProximity = this.cascadeXiLine ? this.findXiLineByProximity(event) : null;
      const lambdaFlightProximity = this.lambdaFlightLine2Track ? this.findLambdaFlightLineByProximity(event) : null;
      if (connectorProximity) trackLabel = connectorProximity.label;
      else if (xiProximity) trackLabel = xiProximity.label;
      else if (lambdaFlightProximity) trackLabel = lambdaFlightProximity.label;
    }

    if (isMarker) {
      this.vertexMarkerTooltip = {
        label: isMarkerByRaycast ? first.userData.vertexLabel : markerByProximity.label,
        x: event.clientX,
        y: event.clientY
      };
      this.trackTooltip = null;
      const decayGroup = this.decays.visible && this.decays.children.length > 0 ? this.decays.children[0] : null;
      if (decayGroup != null && this.decayGroupHovered !== decayGroup) {
        this.clearCascadeHover();
        this.applyCascadeHover(decayGroup);
      }
    } else if (trackLabel) {
      this.vertexMarkerTooltip = null;
      this.trackTooltip = { label: trackLabel, x: event.clientX, y: event.clientY };
      let decayGroup: THREE.Object3D | null = null;
      if (this.decays.visible && intersects.length > 0) {
        const obj = intersects[0].object as THREE.Object3D;
        decayGroup = obj.parent?.parent === this.decays ? obj.parent : null;
        if (!decayGroup && this.decays.children.length > 0 && (first === this.cascadeConnectorLine || first === this.cascadeXiLine || first === this.lambdaFlightLine2Track)) {
          decayGroup = this.decays.children[0];
        }
      }
      if (decayGroup != null && this.decayGroupHovered !== decayGroup) {
        this.clearCascadeHover();
        this.applyCascadeHover(decayGroup);
      } else if (decayGroup == null && !this.cascadeConnectorLine && !this.lambdaFlightLine2Track) {
        this.clearCascadeHover();
      }
    } else {
      this.vertexMarkerTooltip = null;
      this.trackTooltip = null;
      if (this.decays.visible && intersects.length > 0) {
        const obj = intersects[0].object as THREE.Object3D;
        const decayGroup = obj.parent?.parent === this.decays ? obj.parent : null;
        if (decayGroup != null) {
          if (this.decayGroupHovered !== decayGroup) {
            this.clearCascadeHover();
            this.applyCascadeHover(decayGroup);
          }
        } else {
          this.clearCascadeHover();
        }
      } else {
        this.clearCascadeHover();
      }
    }
  }

  onPointerLeave() {
    this.isMousePanning = false;
    this.vertexMarkerTooltip = null;
    this.trackTooltip = null;
    this.clearCascadeHover();
  }

  closeVertexPanel() {
    this.vertexPanelOpen = null;
  }

  onVertexPanelHeaderMouseDown(event: MouseEvent) {
    if (!this.vertexPanelOpen) return;
    event.preventDefault();
    event.stopPropagation();
    const parent = this.canvas?.parentElement as HTMLElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    this.vertexPanelDragOffsetX = event.clientX - rect.left - this.vertexPanelX;
    this.vertexPanelDragOffsetY = event.clientY - rect.top - this.vertexPanelY;
    this.vertexPanelDragging = true;
    window.addEventListener('mousemove', this.onVertexPanelDragMove);
    window.addEventListener('mouseup', this.onVertexPanelDragEnd);
  }

  private onVertexPanelDragMove = (e: MouseEvent) => {
    if (!this.vertexPanelDragging) return;
    const parent = this.canvas?.parentElement as HTMLElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    let x = e.clientX - rect.left - this.vertexPanelDragOffsetX;
    let y = e.clientY - rect.top - this.vertexPanelDragOffsetY;
    x = Math.max(0, Math.min(rect.width - 280, x));
    y = Math.max(0, Math.min(rect.height - 200, y));
    this.vertexPanelX = x;
    this.vertexPanelY = y;
    this.cdr.detectChanges();
  };

  private onVertexPanelDragEnd = () => {
    if (!this.vertexPanelDragging) return;
    this.vertexPanelDragging = false;
    window.removeEventListener('mousemove', this.onVertexPanelDragMove);
    window.removeEventListener('mouseup', this.onVertexPanelDragEnd);
  };

  private applyCascadeHover(decayGroup: THREE.Object3D) {
    this.decayGroupHovered = decayGroup;
    this.decayHoverOrigMaterials = [];
    for (const child of decayGroup.children) {
      const mesh = child as THREE.Mesh;
      if (mesh.material) {
        this.decayHoverOrigMaterials.push(Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);
        const track = (mesh as any).userData;
        mesh.material = track?.sign > 0 ? this.cascadeProtonMaterial : this.cascadeHoverTrackMaterial;
      }
    }
    this.cascadeHoverActive = true;
    (this.trackMaterial as any).transparent = true;
    (this.trackMaterial as any).opacity = 0;
    this.detectorScene?.traverse((o: THREE.Object3D) => {
      if ((o as any).isMesh) {
        const raw = (o as THREE.Mesh).material;
        const mats: THREE.Material[] = Array.isArray(raw) ? raw : (raw ? [raw] : []);
        for (const m of mats) { if (m) (m as any).opacity = EventDisplayComponent.DETECTOR_FADE_OPACITY; }
      }
    });
    this.cascadeMarkerOrigColors = [];
    this.cascadeVertexMarkers.children.forEach((obj, idx) => {
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (mat?.color) {
        this.cascadeMarkerOrigColors[idx] = mat.color.getHex();
        mat.color.set(0xFF3333);
      }
    });
    this.cascadeMarkerEnhanced = true;
    if (this.cascadeVertexMarkers.children.length >= 2) {
      const v0 = new THREE.Vector3();
      const v1 = new THREE.Vector3();
      this.cascadeVertexMarkers.children[0].getWorldPosition(v0);
      this.cascadeVertexMarkers.children[1].getWorldPosition(v1);
      const lineGeometry = new LineGeometry();
      lineGeometry.setPositions([v0.x, v0.y, v0.z, v1.x, v1.y, v1.z]);
      const mat = new LineMaterial({
        color: 0xff0000,
        linewidth: this.trackHighlightWidth,
        dashed: true,
        dashSize: 1,
        gapSize: 0.6,
        dashScale: 4,
        resolution: new THREE.Vector2(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight)
      });
      const line = new Line2(lineGeometry, mat);
      line.computeLineDistances();
      line.renderOrder = EventDisplayComponent.PHYSICS_RENDER_ORDER_BASE + 9998;
      (line as any).userData = { trackLabel: 'Λ track' };
      this.scene.add(line);
      this.cascadeConnectorLine = line;
      const origin = new THREE.Vector3(0, 0, 0);
      const xiLineGeometry = new LineGeometry();
      xiLineGeometry.setPositions([origin.x, origin.y, origin.z, v1.x, v1.y, v1.z]);
      const xiMat = new LineMaterial({
        color: 0x9932cc,
        linewidth: this.trackHighlightWidth,
        dashed: true,
        dashSize: 1,
        gapSize: 0.6,
        dashScale: 4,
        resolution: new THREE.Vector2(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight)
      });
      const xiLine = new Line2(xiLineGeometry, xiMat);
      xiLine.computeLineDistances();
      xiLine.renderOrder = EventDisplayComponent.PHYSICS_RENDER_ORDER_BASE + 9997;
      (xiLine as any).userData = { trackLabel: 'Ξ⁻ track' };
      this.scene.add(xiLine);
      this.cascadeXiLine = xiLine;
    } else if (this.cascadeVertexMarkers.children.length === 1) {
      const origin = new THREE.Vector3(0, 0, 0);
      const v0 = new THREE.Vector3();
      this.cascadeVertexMarkers.children[0].getWorldPosition(v0);
      const lineGeometry = new LineGeometry();
      lineGeometry.setPositions([origin.x, origin.y, origin.z, v0.x, v0.y, v0.z]);
      const mat = new LineMaterial({
        color: 0xff0000,
        linewidth: this.trackHighlightWidth,
        dashed: true,
        dashSize: 1,
        gapSize: 0.6,
        dashScale: 4,
        resolution: new THREE.Vector2(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight)
      });
      const line = new Line2(lineGeometry, mat);
      line.computeLineDistances();
      line.renderOrder = EventDisplayComponent.PHYSICS_RENDER_ORDER_BASE + 9997;
      (line as any).userData = { trackLabel: 'Λ track' };
      this.scene.add(line);
      this.lambdaFlightLine2Track = line;
    }
  }

  private clearCascadeHover() {
    if (this.decayGroupHovered) {
      const children = this.decayGroupHovered.children;
      for (let i = 0; i < children.length && i < this.decayHoverOrigMaterials.length; i++) {
        (children[i] as THREE.Mesh).material = this.decayHoverOrigMaterials[i];
      }
      this.decayGroupHovered = null;
      this.decayHoverOrigMaterials = [];
    }
    if (this.cascadeHoverActive) {
      this.cascadeHoverActive = false;
      (this.trackMaterial as any).transparent = false;
      (this.trackMaterial as any).opacity = 1;
      this.detectorScene?.traverse((o: THREE.Object3D) => {
        if ((o as any).isMesh) {
          const raw = (o as THREE.Mesh).material;
          const mats: THREE.Material[] = Array.isArray(raw) ? raw : (raw ? [raw] : []);
          for (const m of mats) {
            if (!m) continue;
            const baseOpacity = (m as any).userData?.baseOpacity ?? EventDisplayComponent.DETECTOR_COMPONENT_OPACITY;
            (m as any).opacity = baseOpacity;
          }
        }
      });
    }
    if (this.cascadeMarkerEnhanced) {
      this.cascadeVertexMarkers.children.forEach((obj, idx) => {
        const mesh = obj as THREE.Mesh;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        if (mat?.color && this.cascadeMarkerOrigColors[idx] !== undefined) {
          mat.color.setHex(this.cascadeMarkerOrigColors[idx]);
        }
      });
      this.cascadeMarkerEnhanced = false;
      this.cascadeMarkerOrigColors = [];
    }
    if (this.cascadeConnectorLine) {
      this.scene.remove(this.cascadeConnectorLine);
      this.cascadeConnectorLine.geometry.dispose();
      (this.cascadeConnectorLine.material as THREE.Material).dispose();
      this.cascadeConnectorLine = null;
    }
    if (this.cascadeXiLine) {
      this.scene.remove(this.cascadeXiLine);
      this.cascadeXiLine.geometry.dispose();
      (this.cascadeXiLine.material as THREE.Material).dispose();
      this.cascadeXiLine = null;
    }
    if (this.lambdaFlightLine2Track) {
      this.scene.remove(this.lambdaFlightLine2Track);
      this.lambdaFlightLine2Track.geometry.dispose();
      (this.lambdaFlightLine2Track.material as THREE.Material).dispose();
      this.lambdaFlightLine2Track = null;
    }
  }

  private findLambdaFlightLineByProximity(event: MouseEvent): { label: string } | null {
    if (!this.lambdaFlightLine2Track || this.cascadeVertexMarkers.children.length !== 1) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = rect.height - (event.clientY - rect.top);
    const maxDist = EventDisplayComponent.MARKER_PROXIMITY_PX * EventDisplayComponent.MARKER_PROXIMITY_PX;
    const origin = new THREE.Vector3(0, 0, 0);
    const v1 = new THREE.Vector3();
    this.cascadeVertexMarkers.children[0].getWorldPosition(v1);
    const viewports = this.effectiveSideViewsShown
      ? [{ view: this.cam3DVP, cam: this.camera3D }, { view: this.camRphiVP, cam: this.cameraRphi }, { view: this.camRhozVP, cam: this.cameraRhoz }]
      : [{ view: this.cam3DVP, cam: this.camera3D }];
    for (const { view, cam } of viewports) {
      const ndcX = (cursorX - view.x) / view.z;
      const ndcY = (cursorY - view.y) / view.w;
      if (ndcX < 0 || ndcX > 1 || ndcY < 0 || ndcY > 1) continue;
      const p0 = origin.clone().project(cam);
      const p1 = v1.clone().project(cam);
      const sx0 = (p0.x * 0.5 + 0.5) * view.z + view.x;
      const sy0 = (p0.y * 0.5 + 0.5) * view.w + view.y;
      const sx1 = (p1.x * 0.5 + 0.5) * view.z + view.x;
      const sy1 = (p1.y * 0.5 + 0.5) * view.w + view.y;
      const dx = sx1 - sx0;
      const dy = sy1 - sy0;
      const len2 = dx * dx + dy * dy;
      const t = len2 < 1e-10 ? 0 : Math.max(0, Math.min(1, ((cursorX - sx0) * dx + (cursorY - sy0) * dy) / len2));
      const px = sx0 + t * dx;
      const py = sy0 + t * dy;
      const d = (cursorX - px) * (cursorX - px) + (cursorY - py) * (cursorY - py);
      if (d < maxDist) return { label: 'Λ track' };
    }
    return null;
  }

  private findXiLineByProximity(event: MouseEvent): { label: string } | null {
    if (!this.cascadeXiLine || this.cascadeVertexMarkers.children.length < 2) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = rect.height - (event.clientY - rect.top);
    const maxDist = EventDisplayComponent.MARKER_PROXIMITY_PX * EventDisplayComponent.MARKER_PROXIMITY_PX;
    const origin = new THREE.Vector3(0, 0, 0);
    const v1 = new THREE.Vector3();
    this.cascadeVertexMarkers.children[1].getWorldPosition(v1);
    const viewports = this.effectiveSideViewsShown
      ? [{ view: this.cam3DVP, cam: this.camera3D }, { view: this.camRphiVP, cam: this.cameraRphi }, { view: this.camRhozVP, cam: this.cameraRhoz }]
      : [{ view: this.cam3DVP, cam: this.camera3D }];
    for (const { view, cam } of viewports) {
      const ndcX = (cursorX - view.x) / view.z;
      const ndcY = (cursorY - view.y) / view.w;
      if (ndcX < 0 || ndcX > 1 || ndcY < 0 || ndcY > 1) continue;
      const p0 = origin.clone().project(cam);
      const p1 = v1.clone().project(cam);
      const sx0 = (p0.x * 0.5 + 0.5) * view.z + view.x;
      const sy0 = (p0.y * 0.5 + 0.5) * view.w + view.y;
      const sx1 = (p1.x * 0.5 + 0.5) * view.z + view.x;
      const sy1 = (p1.y * 0.5 + 0.5) * view.w + view.y;
      const dx = sx1 - sx0;
      const dy = sy1 - sy0;
      const len2 = dx * dx + dy * dy;
      const t = len2 < 1e-10 ? 0 : Math.max(0, Math.min(1, ((cursorX - sx0) * dx + (cursorY - sy0) * dy) / len2));
      const px = sx0 + t * dx;
      const py = sy0 + t * dy;
      const d = (cursorX - px) * (cursorX - px) + (cursorY - py) * (cursorY - py);
      if (d < maxDist) return { label: 'Ξ⁻ track' };
    }
    return null;
  }

  private findConnectorLineByProximity(event: MouseEvent): { label: string } | null {
    if (!this.cascadeConnectorLine || this.cascadeVertexMarkers.children.length < 2) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = rect.height - (event.clientY - rect.top);
    const maxDist = EventDisplayComponent.MARKER_PROXIMITY_PX * EventDisplayComponent.MARKER_PROXIMITY_PX;
    const v0 = new THREE.Vector3();
    const v1 = new THREE.Vector3();
    this.cascadeVertexMarkers.children[0].getWorldPosition(v0);
    this.cascadeVertexMarkers.children[1].getWorldPosition(v1);
    const viewports = this.effectiveSideViewsShown
      ? [{ view: this.cam3DVP, cam: this.camera3D }, { view: this.camRphiVP, cam: this.cameraRphi }, { view: this.camRhozVP, cam: this.cameraRhoz }]
      : [{ view: this.cam3DVP, cam: this.camera3D }];
    for (const { view, cam } of viewports) {
      const ndcX = (cursorX - view.x) / view.z;
      const ndcY = (cursorY - view.y) / view.w;
      if (ndcX < 0 || ndcX > 1 || ndcY < 0 || ndcY > 1) continue;
      const p0 = v0.clone().project(cam);
      const p1 = v1.clone().project(cam);
      const sx0 = (p0.x * 0.5 + 0.5) * view.z + view.x;
      const sy0 = (p0.y * 0.5 + 0.5) * view.w + view.y;
      const sx1 = (p1.x * 0.5 + 0.5) * view.z + view.x;
      const sy1 = (p1.y * 0.5 + 0.5) * view.w + view.y;
      const dx = sx1 - sx0;
      const dy = sy1 - sy0;
      const len2 = dx * dx + dy * dy;
      const t = len2 < 1e-10 ? 0 : Math.max(0, Math.min(1, ((cursorX - sx0) * dx + (cursorY - sy0) * dy) / len2));
      const px = sx0 + t * dx;
      const py = sy0 + t * dy;
      const d = (cursorX - px) * (cursorX - px) + (cursorY - py) * (cursorY - py);
      if (d < maxDist) return { label: 'Λ track' };
    }
    return null;
  }

  private findMarkerByProximity(event: MouseEvent): { label: string } | null {
    if (this.cascadeVertexMarkers.children.length === 0) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = rect.height - (event.clientY - rect.top);
    const maxDist = EventDisplayComponent.MARKER_PROXIMITY_PX * EventDisplayComponent.MARKER_PROXIMITY_PX;
    let closest: { label: string; dist: number } | null = null;
    const viewports = this.effectiveSideViewsShown
      ? [{ view: this.cam3DVP, cam: this.camera3D }, { view: this.camRphiVP, cam: this.cameraRphi }, { view: this.camRhozVP, cam: this.cameraRhoz }]
      : [{ view: this.cam3DVP, cam: this.camera3D }];
    const v = new THREE.Vector3();
    for (const { view, cam } of viewports) {
      const ndcX = (cursorX - view.x) / view.z;
      const ndcY = (cursorY - view.y) / view.w;
      if (ndcX < 0 || ndcX > 1 || ndcY < 0 || ndcY > 1) continue;
      for (const marker of this.cascadeVertexMarkers.children) {
        marker.getWorldPosition(v);
        v.project(cam);
        const sx = (v.x * 0.5 + 0.5) * view.z + view.x;
        const sy = (v.y * 0.5 + 0.5) * view.w + view.y;
        const dx = cursorX - sx;
        const dy = cursorY - sy;
        const d = dx * dx + dy * dy;
        if (d < maxDist && (closest == null || d < closest.dist)) {
          const label = (marker as any).userData?.vertexLabel;
          if (label) closest = { label, dist: d };
        }
      }
    }
    return closest ? { label: closest.label } : null;
  }

  private findIntersect(event: MouseEvent): THREE.Intersection[] {
    const intersects: THREE.Intersection[] = [];
    const zoomz = this.controls.target.distanceTo(this.controls.object.position);
    const raycaster = new THREE.Raycaster();
    if (!raycaster.params.Line2) {
      raycaster.params.Line2 = { threshold: zoomz / 55 };
    } else {
      raycaster.params.Line2.threshold = zoomz / 55;
    }
    (raycaster.params as any).Line = (raycaster.params as any).Line || { threshold: zoomz / 55 };
    (raycaster.params as any).Line.threshold = zoomz / 55;
    const windowOffset = this.renderer.domElement.getBoundingClientRect();
    const viewportclick = new THREE.Vector2(
      event.clientX - windowOffset.left,
      -(event.clientY - windowOffset.top) + this.renderer.domElement.clientHeight
    );
    let viewports: { view: THREE.Vector4; cam: THREE.Camera }[];
    if (this.effectiveSideViewsShown) {
      viewports = [
        { view: this.cam3DVP, cam: this.camera3D },
        { view: this.camRphiVP, cam: this.cameraRphi },
        { view: this.camRhozVP, cam: this.cameraRhoz }
      ];
    } else {
      viewports = [{ view: this.cam3DVP, cam: this.camera3D }];
    }
    for (let v of viewports) {
      const vp = v.view;
      const cam = v.cam;
      const ndcpos = new THREE.Vector2(
        ((viewportclick.x - vp.x) / vp.z - 0.5) * 2,
        ((viewportclick.y - vp.y) / vp.w - 0.5) * 2
      );
      if (ndcpos.x < -1 || ndcpos.x > 1 || ndcpos.y < -1 || ndcpos.y > 1) continue;
      raycaster.setFromCamera(ndcpos, cam);
      if (this.decays.children.length > 0) {
        intersects.push(...raycaster.intersectObjects(this.decays.children, true));
      }
      if (this.cascadeVertexMarkers.children.length > 0) {
        intersects.push(...raycaster.intersectObjects(this.cascadeVertexMarkers.children, false));
      }
      if (this.cascadeConnectorLine) {
        intersects.push(...raycaster.intersectObject(this.cascadeConnectorLine, false));
      }
      if (this.cascadeXiLine) {
        intersects.push(...raycaster.intersectObject(this.cascadeXiLine, false));
      }
      if (this.lambdaFlightLine2Track) {
        intersects.push(...raycaster.intersectObject(this.lambdaFlightLine2Track, false));
      }
    }
    intersects.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    return intersects;
  }

  private createScene(): void {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, logarithmicDepthBuffer: true, antialias: true });
    this.renderer.shadowMap.enabled = false;
    this.renderer.sortObjects = true;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(1, 1);
    this.camera3D = new THREE.PerspectiveCamera(
      EventDisplayComponent.fieldOfView,
      this.aspectRatio,
      EventDisplayComponent.nearClippingPlane,
      EventDisplayComponent.farClippingPlane
    );
    this.camera3D.position.set(-7.5, 7.5, 2.5);
    this.camera3D.up.set(0.0, 1.0, 0.0);
    this.cameraRphi = new THREE.PerspectiveCamera(
      EventDisplayComponent.fieldOfView,
      this.aspectRatio,
      EventDisplayComponent.nearClippingPlane,
      EventDisplayComponent.farClippingPlane
    );
    this.cameraRphi.position.set(0.0, 0.0, 10.0);
    this.cameraRphi.up.set(0.0, 1.0, 0.0);
    this.cameraRphi.lookAt(new THREE.Vector3(0, 0, 0));
    this.cameraRhoz = new THREE.PerspectiveCamera(
      EventDisplayComponent.fieldOfView,
      this.aspectRatio,
      EventDisplayComponent.nearClippingPlane,
      EventDisplayComponent.farClippingPlane
    );
    this.cameraRhoz.position.set(-10.0, 0.0, 0.0);
    this.cameraRhoz.up.set(0.0, 1.0, 0.0);
    this.cameraRhoz.lookAt(new THREE.Vector3(0, 0, 0));
    this.controls = new OrbitControls(this.camera3D, this.renderer.domElement);
    this.controls.target.set(0.0, 0.0, 0.0);
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera3D));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      EventDisplayComponent.BLOOM_STRENGTH,
      EventDisplayComponent.BLOOM_RADIUS,
      EventDisplayComponent.BLOOM_THRESHOLD
    );
    this.composer.addPass(this.bloomPass);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.updateCameraMode();
    const ambientLight = new THREE.AmbientLight(0x444444);
    this.lights.add(ambientLight);
    const hemisphereLight = new THREE.HemisphereLight(0xb8c8e8, 0x2a2a30, 0.5);
    this.lights.add(hemisphereLight);
    const directionalLighta = new THREE.DirectionalLight(0xFFFFFF, 0.45);
    directionalLighta.position.set(1.0, 1.0, 1.0);
    this.lights.add(directionalLighta);
    const directionalLightb = new THREE.DirectionalLight(0xFFFFFF, 0.45);
    directionalLightb.position.set(-1.0, 1.0, -1.0);
    this.lights.add(directionalLightb);
    const axesHelper = new THREE.AxesHelper(5);
    this.axes.add(axesHelper);
    this.axes.visible = false;
    this.scene.add(this.axes);
    this.scene.add(this.lights);
    this.syncGridBackground();
    this.scene.add(this.detector);
    this.scene.add(this.tracks);
    this.scene.add(this.cascadeVertexMarkers);
    this.scene.add(this.primaryVertexMarkers);
    this.scene.add(this.clusters);
    this.scene.add(this.calorimeterReadouts);
    this.scene.add(this.decays);
    this.collisionProtonsGroup.visible = false;
    this.scene.add(this.collisionProtonsGroup);
    this.resize(true);
    this.syncSceneBackground();
    this.applyDarkModeStyling();
  }

  onPreviousEventClick(): void {
    this.previousEvent.emit();
  }

  onNextEventClick(): void {
    this.nextEvent.emit();
  }
}
