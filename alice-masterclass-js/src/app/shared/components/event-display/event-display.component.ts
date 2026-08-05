import { Component, ElementRef, Input, Output, AfterViewInit, ViewChild, EventEmitter, HostBinding, OnDestroy, ChangeDetectorRef, TemplateRef } from '@angular/core';
import { CdkDragEnd } from '@angular/cdk/drag-drop';
import { TranslateService } from '@ngx-translate/core';
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
import { detectorPartAccentColor } from '../../three/detector-part-accent';
import { optimizeStaticDetectorPart } from '../../three/optimize-detector-part';
import { SideViewScaleModel, SideViewScaleService } from '../../services/side-view-scale.service';

/** Detector layer toggle row (multipart GLB assembly). */
export interface DetectorPartToggleModel {
  assetPath: string;
  labelKey: string;
  labelParams?: Record<string, string>;
  visible: boolean;
  opacity: number;
  /** CSS hex matching the part's GLB signature colour (opacity slider accent). */
  accentColor: string;
}

export interface DetectorPaletteItem {
  assetPath: string;
  labelKey: string;
  labelParams?: Record<string, string>;
  placed: boolean;
  /** Extra GLBs placed together with this palette card (e.g. DCal with EMCal). */
  companionAssetPaths?: string[];
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
  hasFit: boolean;
  hasL3: boolean;
}

@Component({
  selector: 'app-event-display',
  templateUrl: './event-display.component.html',
  styleUrls: ['./event-display.component.scss'],
  standalone: false
})
export class EventDisplayComponent implements AfterViewInit, OnDestroy {
  /**
   * Side views: full-res WebGLRenderTargets of the same scene from fixed Rφ/ρz
   * cameras. Detector shells are masked per pane (ρz/View1 side: ITS+TRD;
   * Rφ/View2 front: ITS+TPC+TRD+TOF) at a fixed opacity; tracks/markers stay
   * shared. Zoom follows the main orbit distance (throttled while gesturing).
   * Re-rendered when content/layout/zoom is dirty; blit every frame after the
   * main pass. Picking is main-viewport only.
   *
   * Layer 0 — shared by main + Rφ/ρz: detector parts, tracks, decays, clusters,
   * markers, lights, axes (calorimeter readouts hidden during side passes).
   * Layer 1 — main 3D only: helper grids (skip in side passes).
   */
  static readonly LAYER_SHARED = 0;
  static readonly LAYER_MAIN_ONLY = 1;
  /** Side-view kind: View 1 (Rφ) vs View 2 (ρz). */
  static readonly SIDE_VIEW_RPHI = 'rphi' as const;
  static readonly SIDE_VIEW_RHOZ = 'rhoz' as const;
  private readonly CLUSTERS_USE_POINTS: boolean = true;
  private readonly CLICK_HIGHLIGHT_DURATION = 200;

  @HostBinding("style.--primary-axis-ratio")
  /** Share of canvas width (landscape) / height (portrait) for the main 3D pane. */
  readonly PRIMARY_AXIS_RATIO: number = 0.62;
  @HostBinding("style.--secondary-axis-ratio")
  readonly SECONDARY_AXIS_RATIO: number = 1 / 2;

  static readonly fieldOfView: number = 70;
  static readonly nearClippingPlane: number = 0.05;
  static readonly farClippingPlane: number = 1500;
  static readonly objectScale: number = 1.0e-2;
  static readonly detectorModelScale: number = 1.0e-2;
  /**
   * Default overview framing: look along +Z (azimuth 0°) into the barrel so the
   * transverse cross-section (concentric shells) faces the screen.
   */
  static readonly CAMERA_3D_OVERVIEW = { x: 0, y: 0, z: 11 } as const;
  /**
   * Closer start framing for guided multipart assembly (ITS-scale).
   * Same +Z ray as overview (~3.7× nearer) so zoom-out stays end-on.
   */
  static readonly CAMERA_3D_ASSEMBLY_START = { x: 0, y: 0, z: 3 } as const;
  /** Side cameras sit this far from the origin (world units ≡ metres). */
  static readonly SIDE_CAMERA_DISTANCE = 10;
  /**
   * Fallback PerspectiveCamera.zoom for Rφ/ρz when orbit distance is unavailable.
   * Side cameras at {@link SIDE_CAMERA_DISTANCE}; at overview this is 10/11.
   */
  static readonly SIDE_VIEW_FIXED_ZOOM =
    EventDisplayComponent.SIDE_CAMERA_DISTANCE /
    EventDisplayComponent.CAMERA_3D_OVERVIEW.z;
  /**
   * View 2 (Rφ): distance from origin to the TOF face toward the front camera
   * (TOF half-length ≈ 3.75 m for ~7.5 m barrel). Pulls the scale plane forward so
   * TOF diameter reads ~8 m.
   */
  static readonly SIDE_VIEW_RPHI_SCALE_DEPTH_M = 3.75;
  /** Real TRD height (m) — target for ρz Y-axis labels (variant B). */
  static readonly SIDE_VIEW_TRD_HEIGHT_M = 7.36;
  /**
   * Origin-plane ρz Y over-read at overview (~10 m vs {@link SIDE_VIEW_TRD_HEIGHT_M}).
   * Y scale plane = cameraDistance * TRD_HEIGHT / this.
   */
  static readonly SIDE_VIEW_RHOZ_Y_OVERREAD_M = 10;
  /** Fixed detector-shell opacity while rendering a side-view pass. */
  static readonly SIDE_VIEW_DETECTOR_OPACITY = 0.5;
  /** Min interval between full side-view RT refreshes during an active orbit gesture. */
  static readonly SIDE_VIEW_ZOOM_THROTTLE_MS = 100;
  /** Relative orbit-distance change that counts as a zoom sync for side views. */
  static readonly SIDE_VIEW_ZOOM_EPS = 0.025;
  /** Duration of the auto zoom-out after each assembly piece is snapped. */
  static readonly ASSEMBLY_CAMERA_ZOOM_MS = 700;
  /**
   * ITS/TPC/TRD/FIT GLBs place the beam axis at local y=+30 (cm). After
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
  static readonly TRACK_RADIUS_ITS = 45;
  static readonly TRACK_RADIUS_TPC = 250;
  /** Beam-axis half-length (cm) for ITS-only stubs. */
  static readonly TRACK_Z_ITS = 50;
  /** Beam-axis half-length (cm) for TPC unlock (ALICE TPC ≈ ±250 cm). */
  static readonly TRACK_Z_TPC = 250;
  /** Transverse radius (~cm) of the TRD barrel — used for hit markers, not track clip. */
  static readonly TRACK_RADIUS_TRD = 370;
  /** Transverse radius (~cm) of the TOF barrel — used for hit markers, not track clip. */
  static readonly TRACK_RADIUS_TOF = 410;
  /**
   * Beam-axis half-length (cm) for TRD/TOF hit markers. Matched to the TPC
   * barrel length used in progressive assembly so layer hits do not float
   * past the end-caps of the built detector.
   */
  static readonly TRACK_Z_TRD = 250;
  static readonly TRACK_Z_TOF = 250;
  /** Fluorescent yellow — matches TRD layer tint. */
  static readonly LAYER_HIT_COLOR_TRD = 0xffe033;
  /** Fluorescent orange — matches TOF layer tint. */
  static readonly LAYER_HIT_COLOR_TOF = 0xff8a1a;
  /** Radius of a TRD/TOF hit glow-dot (scene units; smaller than the old ×). */
  static readonly LAYER_HIT_MARKER_RADIUS = 0.03;
  /** Arc-length step (cm) when sampling simulated TPC clusters along a track. */
  static readonly TPC_CLUSTER_SAMPLE_STEP_CM = 3;
  /** Min transverse radius (cm) for simulated TPC clusters (strictly outside). */
  static readonly TPC_CLUSTER_R_MIN_CM = 90;
  /** Gaussian σ (cm) for soft spatial smear of simulated TPC clusters. */
  static readonly TPC_CLUSTER_NOISE_SIGMA_CM = 0.2;
  /** Min |p| (GeV/c) to accept a straight-track direction. */
  private static readonly STRAIGHT_TRACK_EPS = 1e-4;
  /** Straight preview length (cm); clipped to the unlocked cylinder afterwards. */
  private static readonly STRAIGHT_TRACK_REACH_CM = 2000;
  /**
   * V0/cascade daughters are re-propagated separately from the reconstructed
   * `tracks` list (`particleId` is PDG there, usually 0 — not a unique id).
   * Hide the overlapping background helix when momenta agree within these cuts.
   */
  private static readonly DECAY_BG_MOMENTUM_COS_MIN = 0.985;
  private static readonly DECAY_BG_MOMENTUM_ABS_DP = 0.08;

  /**
   * True when a decay daughter and a background track are the same helix
   * (direction + |p|). Background `sign` is often 0 in the JSON, so charge
   * is not part of the test.
   */
  static momentaMatchDecayToBackground(decay: Track, background: Track): boolean {
    const pa = Math.hypot(decay.px, decay.py, decay.pz);
    const pb = Math.hypot(background.px, background.py, background.pz);
    if (pa < 1e-9 || pb < 1e-9) {
      return false;
    }
    const cos =
      (decay.px * background.px + decay.py * background.py + decay.pz * background.pz) / (pa * pb);
    return (
      cos >= EventDisplayComponent.DECAY_BG_MOMENTUM_COS_MIN &&
      Math.abs(pa - pb) <= EventDisplayComponent.DECAY_BG_MOMENTUM_ABS_DP
    );
  }

  /**
   * Indices into `event.tracks` that duplicate a decay daughter and should not
   * be drawn in the generic (white/blue) track pass. One-to-one assignment.
   */
  static backgroundTrackIndicesHiddenByDecays(event: Event): Set<number> {
    const hidden = new Set<number>();
    const tracks = event.tracks || [];
    for (const particleList of event.decays || []) {
      for (const decayTrack of particleList) {
        if (decayTrack == null) {
          continue;
        }
        let bestIdx = -1;
        let bestCos = -Infinity;
        for (let i = 0; i < tracks.length; i++) {
          if (hidden.has(i)) {
            continue;
          }
          const background = tracks[i];
          if (!EventDisplayComponent.momentaMatchDecayToBackground(decayTrack, background)) {
            continue;
          }
          const pa = Math.hypot(decayTrack.px, decayTrack.py, decayTrack.pz);
          const pb = Math.hypot(background.px, background.py, background.pz);
          const cos =
            (decayTrack.px * background.px +
              decayTrack.py * background.py +
              decayTrack.pz * background.pz) /
            (pa * pb);
          if (cos > bestCos) {
            bestCos = cos;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0) {
          hidden.add(bestIdx);
        }
      }
    }
    return hidden;
  }

  /**
   * Fraction in [0, 1] where segment a→b first exits R < rMax, |z| < zMax.
   * Returns 1 if the segment stays inside.
   */
  private static cylinderExitFraction(
    a: number[],
    b: number[],
    rMax: number,
    zMax: number
  ): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    let best = 1;

    if (Number.isFinite(zMax) && zMax > 0 && dz !== 0) {
      for (const zWall of [zMax, -zMax]) {
        const t = (zWall - a[2]) / dz;
        if (t >= 0 && t <= 1) {
          best = Math.min(best, t);
        }
      }
    }

    if (rMax > 0) {
      const aa = dx * dx + dy * dy;
      if (aa > 0) {
        const bb = 2 * (a[0] * dx + a[1] * dy);
        const cc = a[0] * a[0] + a[1] * a[1] - rMax * rMax;
        const disc = bb * bb - 4 * aa * cc;
        if (disc >= 0) {
          const sqrtDisc = Math.sqrt(disc);
          for (const t of [(-bb + sqrtDisc) / (2 * aa), (-bb - sqrtDisc) / (2 * aa)]) {
            if (t >= 0 && t <= 1) {
              best = Math.min(best, t);
            }
          }
        }
      }
    }

    return best;
  }

  /** Keeps points inside R < rMax and |z| < zMax; interpolates the first exit. */
  static clipTrajectoryToCylinder(
    trajectory: number[][],
    rMax: number,
    zMax: number
  ): number[][] {
    if (!trajectory?.length || !(rMax > 0) || !(zMax > 0)) {
      return [];
    }
    const inside = (p: number[]) =>
      Math.hypot(p[0], p[1]) < rMax && Math.abs(p[2]) < zMax;

    const out: number[][] = [];
    for (let i = 0; i < trajectory.length; i++) {
      const p = trajectory[i];
      if (inside(p)) {
        out.push([p[0], p[1], p[2]]);
        continue;
      }
      if (i === 0) {
        return [];
      }
      const prev = trajectory[i - 1];
      if (!inside(prev)) {
        break;
      }
      const t = EventDisplayComponent.cylinderExitFraction(prev, p, rMax, zMax);
      out.push([
        prev[0] + t * (p[0] - prev[0]),
        prev[1] + t * (p[1] - prev[1]),
        prev[2] + t * (p[2] - prev[2]),
      ]);
      break;
    }
    return out;
  }

  /**
   * First outward crossing of cylinder R = radius (xy), or null if the path
   * never reaches that shell (or the crossing lies outside |z| < zMax).
   */
  static intersectTrajectoryAtRadius(
    trajectory: number[][],
    radius: number,
    zMax: number = Infinity
  ): number[] | null {
    if (!trajectory?.length || !(radius > 0)) {
      return null;
    }
    const rOf = (p: number[]) => Math.hypot(p[0], p[1]);
    for (let i = 0; i < trajectory.length; i++) {
      const p = trajectory[i];
      const r = rOf(p);
      if (r < radius) {
        continue;
      }
      if (i === 0) {
        return null;
      }
      const prev = trajectory[i - 1];
      const rPrev = rOf(prev);
      if (rPrev >= radius) {
        return null;
      }
      const t = r === rPrev ? 0 : (radius - rPrev) / (r - rPrev);
      const hit = [
        prev[0] + t * (p[0] - prev[0]),
        prev[1] + t * (p[1] - prev[1]),
        prev[2] + t * (p[2] - prev[2]),
      ];
      if (Number.isFinite(zMax) && zMax > 0 && Math.abs(hit[2]) >= zMax) {
        return null;
      }
      return hit;
    }
    return null;
  }

  /** Deterministic [0,1) from integer seed (mulberry32 step). */
  static seededUnitRandom(seed: number): number {
    let t = (seed >>> 0) + 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Box–Muller using two seeded unit draws → ~N(0,1). */
  static seededGaussian(seedA: number, seedB: number): number {
    const u1 = Math.max(1e-12, EventDisplayComponent.seededUnitRandom(seedA));
    const u2 = EventDisplayComponent.seededUnitRandom(seedB);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Samples points along a polyline (cm), keeps those with transverse radius
   * strictly above rMin and below rMax (default: R > 90 cm / 0.9 m, inside TPC),
   * and applies a small deterministic Gaussian smear.
   */
  static sampleNoisyClustersAlongTrajectory(
    trajectory: number[][],
    options?: {
      stepCm?: number;
      noiseSigmaCm?: number;
      rMin?: number;
      rMax?: number;
      seed?: number;
    }
  ): number[][] {
    if (!trajectory?.length) {
      return [];
    }
    const step = options?.stepCm ?? EventDisplayComponent.TPC_CLUSTER_SAMPLE_STEP_CM;
    const sigma = options?.noiseSigmaCm ?? EventDisplayComponent.TPC_CLUSTER_NOISE_SIGMA_CM;
    const rMin = options?.rMin ?? EventDisplayComponent.TPC_CLUSTER_R_MIN_CM;
    const rMax = options?.rMax ?? EventDisplayComponent.TRACK_RADIUS_TPC;
    const seed0 = (options?.seed ?? 0) | 0;
    if (!(step > 0) || !(rMax > rMin)) {
      return [];
    }

    const out: number[][] = [];
    let traveled = 0;
    let nextSampleAt = 0;
    let sampleIndex = 0;

    const emitAt = (x: number, y: number, z: number) => {
      const r = Math.hypot(x, y);
      const n = sampleIndex++;
      // Strictly above rMin (default 90 cm) and inside TPC outer radius.
      if (r <= rMin || r >= rMax) {
        return;
      }
      const dx = sigma * EventDisplayComponent.seededGaussian(seed0 + n * 6 + 1, seed0 + n * 6 + 2);
      const dy = sigma * EventDisplayComponent.seededGaussian(seed0 + n * 6 + 3, seed0 + n * 6 + 4);
      const dz = sigma * EventDisplayComponent.seededGaussian(seed0 + n * 6 + 5, seed0 + n * 6 + 6);
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      const nr = Math.hypot(nx, ny);
      if (nr <= rMin || nr >= rMax) {
        return;
      }
      out.push([nx, ny, nz]);
    };

    for (let i = 1; i < trajectory.length; i++) {
      const a = trajectory[i - 1];
      const b = trajectory[i];
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (!(segLen > 0)) {
        continue;
      }
      while (nextSampleAt <= traveled + segLen + 1e-9) {
        const local = Math.min(Math.max(nextSampleAt - traveled, 0), segLen);
        const t = local / segLen;
        emitAt(
          a[0] + t * (b[0] - a[0]),
          a[1] + t * (b[1] - a[1]),
          a[2] + t * (b[2] - a[2])
        );
        nextSampleAt += step;
      }
      traveled += segLen;
    }
    return out;
  }

  /** Same inside-out ordering as createLine (smaller R² first). */
  static orderTrajectoryFromIp(trajectory: number[][]): number[][] {
    if (!trajectory?.length) {
      return [];
    }
    const first = trajectory[0];
    const last = trajectory[trajectory.length - 1];
    const firstR2 = first[0] * first[0] + first[1] * first[1] + first[2] * first[2];
    const lastR2 = last[0] * last[0] + last[1] * last[1] + last[2] * last[2];
    return firstR2 <= lastR2 ? trajectory : [...trajectory].reverse();
  }

  /**
   * B = 0 preview: ray along (px,py,pz).
   * Start = startOverride (V0/cascade), else beam axis at the inner sample's z.
   */
  static buildStraightTrajectory(
    trajectory: number[][],
    px = 0,
    py = 0,
    pz = 0,
    startOverride?: number[] | null
  ): number[][] | null {
    const eps = EventDisplayComponent.STRAIGHT_TRACK_EPS;
    const pMag = Math.hypot(px, py, pz);
    if (pMag < eps || !trajectory?.length) {
      return null;
    }

    const ordered = EventDisplayComponent.orderTrajectoryFromIp(trajectory);
    const p0 =
      startOverride && startOverride.length >= 3
        ? [startOverride[0], startOverride[1], startOverride[2]]
        : [0, 0, ordered[0][2]];
    const inv = 1 / pMag;
    const length = EventDisplayComponent.STRAIGHT_TRACK_REACH_CM;
    return [
      p0,
      [p0[0] + px * inv * length, p0[1] + py * inv * length, p0[2] + pz * inv * length],
    ];
  }

  static isItsAssetPath(assetPath: string): boolean {
    return /(^|[/\\])its\.glb($|\?)/i.test(assetPath);
  }

  static isTpcAssetPath(assetPath: string): boolean {
    return /(^|[/\\])tpc\.glb($|\?)/i.test(assetPath);
  }

  static isTrdAssetPath(assetPath: string): boolean {
    return /(^|[/\\])trd\.glb($|\?)/i.test(assetPath);
  }

  /**
   * Which detector shells appear in a side-view pass.
   * ρz / View 1 (side): ITS + TRD.
   * Rφ / View 2 (front): ITS + TPC + TRD + TOF (all @ SIDE_VIEW_DETECTOR_OPACITY).
   */
  static sideViewAllowsPart(
    assetPath: string,
    which: typeof EventDisplayComponent.SIDE_VIEW_RPHI | typeof EventDisplayComponent.SIDE_VIEW_RHOZ
  ): boolean {
    if (EventDisplayComponent.isItsAssetPath(assetPath) || EventDisplayComponent.isTrdAssetPath(assetPath)) {
      return true;
    }
    // Front (Rφ / View 2): also TPC + TOF. Side (ρz / View 1): no TPC/TOF.
    if (which === EventDisplayComponent.SIDE_VIEW_RPHI) {
      return EventDisplayComponent.isTpcAssetPath(assetPath)
        || EventDisplayComponent.isTofAssetPath(assetPath);
    }
    return false;
  }

  /**
   * Map main-orbit distance → side PerspectiveCamera.zoom.
   * Rφ uses the legacy `SIDE_CAMERA_DISTANCE / distance` framing.
   * ρz is zoomed in by `camDist / rphiScalePlane` so the initial metre window
   * matches View 2 (TOF near-face plane is closer than the IP).
   */
  static computeSideViewZoomFromDistance(
    distance: number,
    which:
      | typeof EventDisplayComponent.SIDE_VIEW_RPHI
      | typeof EventDisplayComponent.SIDE_VIEW_RHOZ
      = EventDisplayComponent.SIDE_VIEW_RPHI
  ): number {
    const overviewZ = EventDisplayComponent.CAMERA_3D_OVERVIEW.z;
    const d = !Number.isFinite(distance) || distance <= 1e-4 ? overviewZ : distance;
    const base =
      EventDisplayComponent.SIDE_CAMERA_DISTANCE / d;
    if (which !== EventDisplayComponent.SIDE_VIEW_RHOZ) {
      return base;
    }
    const rphiPlane = Math.max(
      0.5,
      EventDisplayComponent.SIDE_CAMERA_DISTANCE -
        EventDisplayComponent.SIDE_VIEW_RPHI_SCALE_DEPTH_M
    );
    return base * (EventDisplayComponent.SIDE_CAMERA_DISTANCE / rphiPlane);
  }

  static isTofAssetPath(assetPath: string): boolean {
    return /(^|[/\\])tof\.glb($|\?)/i.test(assetPath);
  }

  static isL3AssetPath(assetPath: string): boolean {
    return /(^|[/\\])l3\.glb($|\?)/i.test(assetPath);
  }

  static isFitAssetPath(assetPath: string): boolean {
    return /(^|[/\\])fit\.glb($|\?)/i.test(assetPath);
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
      'fit.glb': 'EVENT_DISPLAY.DETECTOR_FIT',
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

  static isEmcalAssetPath(assetPath: string): boolean {
    return /(^|[/\\])emcal\.glb($|\?)/i.test(assetPath);
  }

  static isDcalAssetPath(assetPath: string): boolean {
    return /(^|[/\\])dcal\.glb($|\?)/i.test(assetPath);
  }

  static calorimeterDetectorId(assetPath: string): CalorimeterDetectorId | null {
    const file = assetPath.replace(/^.*[/\\]/, '').toLowerCase();
    if (file.startsWith('emcal')) return 'emcal';
    if (file.startsWith('dcal')) return 'dcal';
    return null;
  }

  /** Assembly palette / coach label: EMCal+DCal are one construction step. */
  static assemblyPalettePresentation(
    assetPath: string
  ): Pick<DetectorPartToggleModel, 'labelKey' | 'labelParams'> {
    if (EventDisplayComponent.isEmcalAssetPath(assetPath)) {
      return { labelKey: 'EVENT_DISPLAY.DETECTOR_CALORIMETERS' };
    }
    return EventDisplayComponent.detectorPartPresentation(assetPath);
  }

  /**
   * Parts exported with beam axis at local y≈+30 (cm): ITS/TPC/TRD and FIT.
   * FIT keeps its physical Z (FT0/FV0 near IP, FDD far along the beam).
   */
  static needsBeamAxisYCorrection(assetPath: string): boolean {
    return /(^|[/\\])(its|tpc|trd|fit)\.glb($|\?)/i.test(assetPath);
  }

  /**
   * Shift barrel/FIT parts onto the beam axis (world Y).
   * Calorimeter GLBs stay put — they are already coaxial with L3; readout bars
   * are rebuilt from those meshes in world space.
   */
  static alignDetectorPartToBeamAxis(scene: THREE.Object3D, assetPath: string): void {
    if (EventDisplayComponent.needsBeamAxisYCorrection(assetPath)) {
      scene.position.y = EventDisplayComponent.DETECTOR_BEAM_AXIS_Y_OFFSET;
    }
  }

  /**
   * Disables `matrixAutoUpdate` once local/world matrices are final.
   * Detector shells are static after scale/align — skipping per-frame matrix
   * work on thousands of GLB nodes (same idea as Particle Propagation).
   */
  static freezeStaticTransforms(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      obj.matrixAutoUpdate = false;
    });
  }

  static readonly lineSegments: number = 50;

  private static readonly VERTEX_MARKER_RADIUS = (0.35 * 2 / 3) * EventDisplayComponent.objectScale;
  private static readonly MARKER_PROXIMITY_PX = 155;
  private static readonly PAN_SPEED_FACTOR = 0.007;
  private static readonly WHEEL_PAN_FACTOR = 0.05;
  private static readonly MOUSE_DRAG_PAN_FACTOR = 0.001;
  private static readonly FADE_OPACITY = 0.25;
  /** Detector / track / cluster opacity target while a decay is hovered. */
  private static readonly CASCADE_HOVER_FADE_OPACITY = 0.65;
  /** Opacity ramp when entering decay hover. */
  private static readonly CASCADE_HOVER_LERP_IN_MS = 50;
  /** Opacity ramp when leaving decay hover (or after click). */
  private static readonly CASCADE_HOVER_LERP_OUT_MS = 20;
  /** Ignore brief raycast misses before starting the leave fade. */
  private static readonly CASCADE_HOVER_LEAVE_DEBOUNCE_MS = 20;
  /**
   * After a decay click, suppress re-fade while the user moves the cursor off
   * the clicked track (avoids immediately dimming the scene again).
   */
  private static readonly CASCADE_HOVER_POST_CLICK_LOCK_MS = 450;
  /** Slider default; materials load solid (opacity 1) then sync via setDetectorPartOpacity. */
  private static readonly DETECTOR_COMPONENT_OPACITY = 0.78;
  private static readonly DETECTOR_INNER_OPACITY = 0.80;
  private static readonly DETECTOR_OUTER_OPACITY = 0.75;
  /** Separates nested detector shells in depth (log-depth ignores polygonOffset). */
  private static readonly DETECTOR_LAYER_RADIAL_INFLATE_STEP = 0.0009;

  /**
   * Multipart assembly completion for this browser page load.
   * Survives SPA module navigation; cleared on full refresh (unlike sessionStorage).
   */
  private static multipartDetectorAssemblyCompletedSignature: string | null = null;

  /** Legacy sessionStorage key — cleared so old tabs do not skip the build after refresh. */
  static readonly DETECTOR_ASSEMBLY_DONE_STORAGE_KEY = 'alice_mc_visualAnalysis_detectorAssembledPaths_v1';
  /** sessionStorage: per-part visibility/opacity after assembly (survives refresh). */
  static readonly DETECTOR_PART_UI_STORAGE_KEY = 'alice_mc_visualAnalysis_detectorPartUi_v1';

  private static detectorAssemblyPathsSignature(paths: string[]): string {
    return paths.join('\u0000');
  }

  private static clearLegacyAssemblySessionStorage(): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(EventDisplayComponent.DETECTOR_ASSEMBLY_DONE_STORAGE_KEY);
      }
    } catch {
      /* private browsing / quota */
    }
  }

  /** True when VA can skip the assembly coach for this page load (not across refresh). */
  static isMultipartDetectorStoredComplete(paths: string[]): boolean {
    if (!paths?.length || paths.length < 2) return true;
    EventDisplayComponent.clearLegacyAssemblySessionStorage();
    return (
      EventDisplayComponent.multipartDetectorAssemblyCompletedSignature ===
      EventDisplayComponent.detectorAssemblyPathsSignature(paths)
    );
  }

  /** Marks assembly complete for this page load (tests / callers). */
  static markMultipartDetectorAssemblyCompleteForPage(paths: string[]): void {
    EventDisplayComponent.multipartDetectorAssemblyCompletedSignature =
      EventDisplayComponent.detectorAssemblyPathsSignature(paths);
    EventDisplayComponent.clearLegacyAssemblySessionStorage();
  }

  /** Clears in-memory assembly completion (tests). */
  static resetMultipartDetectorAssemblyPageState(): void {
    EventDisplayComponent.multipartDetectorAssemblyCompletedSignature = null;
    EventDisplayComponent.clearLegacyAssemblySessionStorage();
  }

  private isStoredDetectorAssemblyComplete(paths: string[]): boolean {
    return EventDisplayComponent.isMultipartDetectorStoredComplete(paths);
  }

  private persistDetectorAssemblyCompleted(paths: string[]): void {
    EventDisplayComponent.markMultipartDetectorAssemblyCompleteForPage(paths);
  }

  /**
   * Layer toggles / opacity are intentionally not persisted across refresh or remount:
   * VA always restores the analysis defaults (FIT+L3 off, authored opacities).
   */
  private clearStoredDetectorPartUiState(): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(EventDisplayComponent.DETECTOR_PART_UI_STORAGE_KEY);
      }
    } catch {
      /* private browsing / quota */
    }
  }

  /** No-op keeper so call sites stay readable; defaults are reapplied on each detector load. */
  private persistDetectorPartUiState(): void {
    this.clearStoredDetectorPartUiState();
  }

  /** Post-assembly analysis default when no saved toggles exist: hide FIT and L3. */
  private defaultRestoredPartVisible(assetPath: string): boolean {
    return !(
      EventDisplayComponent.isFitAssetPath(assetPath) ||
      EventDisplayComponent.isL3AssetPath(assetPath)
    );
  }

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
  /**
   * TODO(future-data-update): Flip to `true` when real calorimeter cell energies
   * (`caloEmcal` / `caloDcal` / `caloHits`) ship with a collision-data update.
   * Detector shells (EMCal/DCal GLBs) stay visible; only energy readout bars are gated.
   */
  private static readonly CALORIMETER_HITS_ENABLED = false;
  private static readonly CALO_BAR_MAX_COUNT = 3200;
  private static readonly CALO_BAR_PITCH_FILL = 0.96;
  private static readonly CALO_BAR_MIN_HEIGHT = 0.01;
  private static readonly CALO_BAR_MAX_HEIGHT = 0.35;
  private static readonly CALO_BAR_DARK_EMISSIVE = 0.9;
  /** Extra screen-space linewidth in light mode so tracks punch through pale detectors. */
  private static readonly LIGHT_MODE_TRACK_WIDTH_SCALE = 1.5;
  /**
   * Light-mode metalness ceiling (same as Particle Propagation
   * `LIGHT_MODE_MAX_METALNESS`). Authored L3 metalness (~0.5) plus the two
   * directional lights blows flat octagon facets out to glare/white.
   */
  private static readonly LIGHT_MODE_MAX_METALNESS = 0.15;
  /** Soft fill: midpoint between the original dim lights and the brighter light-mode pass. */
  private static readonly LIGHT_MODE_AMBIENT = { color: 0xa2a2a2, intensity: 0.925 };
  private static readonly LIGHT_MODE_HEMISPHERE = { sky: 0xd5dff4, ground: 0x81838b, intensity: 0.7 };
  private static readonly LIGHT_MODE_DIRECTIONAL_INTENSITY = 0.5;
  private static readonly DARK_MODE_AMBIENT = { color: 0x444444, intensity: 1 };
  private static readonly DARK_MODE_HEMISPHERE = { sky: 0xb8c8e8, ground: 0x2a2a30, intensity: 0.5 };
  private static readonly DARK_MODE_DIRECTIONAL_INTENSITY = 0.45;

  private trackMaterial: THREE.Material = null;
  private postiveTrackMaterial: THREE.Material = null;
  private negativeTrackMaterial: THREE.Material = null;
  private bachelorTrackMaterial: THREE.Material = null;
  private highlightTrackMaterial: THREE.Material = null;
  private pointsMaterial: THREE.Material = null;
  private layerHitTrdMaterial: THREE.MeshBasicMaterial = null;
  private layerHitTofMaterial: THREE.MeshBasicMaterial = null;
  private caloBarMaterial: THREE.MeshStandardMaterial = null;
  private caloBarGeometry: THREE.BoxGeometry = null;

  private _backgroundColor: number = 0xFFFFFF;

  @Input()
  get backgroundColor(): number { return this._backgroundColor; }
  set backgroundColor(backgroundColor: number) {
    this._backgroundColor = backgroundColor;
    this.syncSceneBackground();
    this.requestRender(true);
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
    this.requestRender(true);
  }
  @HostBinding('class.event-display-dark')
  get darkModeHostClass(): boolean { return this._darkMode; }
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
    this.requestRender();
  }

  @Input()
  get trackWidth(): number { return this._trackWidth; }
  /** Click-flash linewidth (thicker than decay tracks). */
  get trackHighlightWidth(): number { return 3 * this.effectiveTrackWidth; }
  get trackDecayWidth(): number { return 1.25 * this.effectiveTrackWidth; }

  set trackWidth(trackWidth: number) {
    this._trackWidth = trackWidth;
    this.applyTrackMaterialWidths();
    this.requestRender(true);
  }
  private _trackWidth: number = 2;

  /** Screen-space linewidth used by LineMaterial (light mode is thicker for contrast). */
  private get effectiveTrackWidth(): number {
    return this._darkMode ? this._trackWidth : this._trackWidth * EventDisplayComponent.LIGHT_MODE_TRACK_WIDTH_SCALE;
  }

  private applyTrackMaterialWidths(): void {
    if (!this.trackMaterial || (this.trackMaterial as LineMaterial).linewidth === undefined) {
      return;
    }
    (this.trackMaterial as LineMaterial).linewidth = this.effectiveTrackWidth;
    (this.postiveTrackMaterial as LineMaterial).linewidth = this.trackDecayWidth;
    (this.negativeTrackMaterial as LineMaterial).linewidth = this.trackDecayWidth;
    (this.bachelorTrackMaterial as LineMaterial).linewidth = this.trackDecayWidth;
    (this.highlightTrackMaterial as LineMaterial).linewidth = this.trackHighlightWidth;
  }

  @Input()
  get clusterSize(): number { return this._clusterSize; }
  set clusterSize(clusterSize: number) {
    this._clusterSize = clusterSize;
    if (this.CLUSTERS_USE_POINTS && this.pointsMaterial) {
      (this.pointsMaterial as THREE.PointsMaterial).size = this.clusterSize;
    } else {
      this.setSizeRecursive(this.clusters, this.clusterSize);
    }
    this.requestRender(true);
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
  /** Left panel: dataset/event meta + detector parts. */
  leftSidebarOpened: boolean = true;
  /** @deprecated Alias kept in sync for older call sites. */
  get detectorLayersPanelOpened(): boolean {
    return this.leftSidebarOpened;
  }
  set detectorLayersPanelOpened(value: boolean) {
    this.leftSidebarOpened = value;
  }

  /** Side panels occupy layout width; the scene flexes between them. */
  toggleSidebar(): void {
    this.sidebarOpened = !this.sidebarOpened;
  }

  /** Used by the Visual Analysis tutorial so Visibility / Decays stay reachable. */
  ensureRightSidebarOpen(): void {
    this.sidebarOpened = true;
  }

  toggleLeftSidebar(): void {
    this.leftSidebarOpened = !this.leftSidebarOpened;
  }
  detectorPartsForUi: DetectorPartToggleModel[] = [];
  detectorPaletteItems: DetectorPaletteItem[] = [];
  /** Multiple GLBs: user drags pieces from the palette before the normal options sidebar is shown. */
  detectorMultipartAssemblyMode = false;
  private _detectorInteractiveAssemblyDone = true;
  private detectorMultipartModelPathsOrder: string[] = [];
  private detectorPreloadedRoots = new Map<string, THREE.Object3D>();
  /** Session-restore fade-in: hold tracks/clusters until shells finish revealing. */
  private deferPhysicsUntilDetectorReveal = false;
  /** Cancels an in-flight assembly zoom-out when another piece is placed. */
  private assemblyCameraZoomGeneration = 0;
  cameraMode: 'centered' | 'free' = 'centered';
  /** True while fade strength > 0 or a leave fade is in progress. */
  private cascadeHoverActive: boolean = false;
  /** 0 = normal scene, 1 = full hover fade targets. */
  private cascadeHoverStrength = 0;
  private cascadeHoverTarget = 0;
  private cascadeHoverLastTs: number | null = null;
  private cascadeHoverLeaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Active lerp duration (enter 50ms / leave 20ms). */
  private cascadeHoverLerpMs = EventDisplayComponent.CASCADE_HOVER_LERP_IN_MS;
  /** performance.now() until which hover fade must not re-engage (post-click). */
  private cascadeHoverLockedUntil = 0;
  private readonly clusterAlphaTestBase = 0.5;
  /** Brief gold flash after a decay click. */
  private clickHighlightLine: Line2 | null = null;
  private clickHighlightOrigMaterial: THREE.Material | null = null;
  private clickHighlightTimer: ReturnType<typeof setTimeout> | null = null;
  vertexMarkerTooltip: { label: string; x: number; y: number } | null = null;

  // 3D
  private scene: THREE.Scene = new THREE.Scene();

  private axes: THREE.Group = (() => {
    const g = new THREE.Group();
    g.visible = false;
    return g;
  })();
  private lights: THREE.Group = new THREE.Group();
  private ambientLight: THREE.AmbientLight | null = null;
  private hemisphereLight: THREE.HemisphereLight | null = null;
  private directionalLightA: THREE.DirectionalLight | null = null;
  private directionalLightB: THREE.DirectionalLight | null = null;

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
  /**
   * Radial energy-readout bars on EMCal / DCal surfaces.
   * TODO(future-data-update): Empty while CALORIMETER_HITS_ENABLED is false;
   * calorimeter detector meshes still load and display normally.
   */
  private calorimeterReadouts: THREE.Group = new THREE.Group();
  /** Primary vertex marker shown while ITS is unlocked but TPC is not yet placed. */
  private primaryVertexMarkers: THREE.Object3D = new THREE.Object3D();
  /** TRD/TOF layer-crossing hit markers during progressive assembly. */
  private layerHitMarkers: THREE.Object3D = new THREE.Object3D();
  /** When true, Rφ/ρz scene is re-rendered into the full-res side-view caches. */
  private sideViewsDirty = true;
  /** True after at least one successful side-view cache render (safe to blit). */
  private sideViewCacheValid = false;
  private sideViewRphiRT: THREE.WebGLRenderTarget | null = null;
  private sideViewRhozRT: THREE.WebGLRenderTarget | null = null;
  private sideViewBlitScene: THREE.Scene | null = null;
  private sideViewBlitCamera: THREE.OrthographicCamera | null = null;
  private sideViewBlitMaterial: THREE.MeshBasicMaterial | null = null;
  private sideViewBlitMesh: THREE.Mesh | null = null;
  /** performance.now() of the last completed side-view RT pair. */
  private lastSideViewRenderMs = 0;
  /** Orbit distance used for the last completed side-view RT pair. */
  private lastSideViewCameraDistance = Number.NaN;
  /** True while OrbitControls pointer gesture is active (start…end). */
  private sideViewControlsGesturing = false;
  /** Zoom distance changed enough to need a side-view refresh when throttle allows. */
  private sideViewZoomPending = false;
  /** Last EffectComposer CSS size used for the main viewport (avoid realloc each frame). */
  private composerMainCssW = 0;
  private composerMainCssH = 0;
  private renderDirty = true;
  private rafPending = false;
  private rafId: number | null = null;
  private viewDestroyed = false;
  private resizeObserver: ResizeObserver | null = null;
  /** Last CSS size applied to the WebGL canvas (avoids DPR false positives). */
  private lastDisplayWidth = 0;
  private lastDisplayHeight = 0;
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
    this.requestRender();
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
    this.deferPhysicsUntilDetectorReveal = false;
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
    // Left controls stay hidden through construction; open after assembly completes.
    if (useInteractiveMultipartAssembly) {
      this.leftSidebarOpened = false;
    }
    // Session restore: hold final physics until staggered shell reveal finishes.
    this.deferPhysicsUntilDetectorReveal = !useInteractiveMultipartAssembly && multiPart;

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
      this.detectorMultipartModelPathsOrder = [...modelPaths];
      // Always analysis defaults on load/remount (ignore any stale session toggles).
      this.clearStoredDetectorPartUiState();
      const nextUi: DetectorPartToggleModel[] = [];
      for (const modelPath of modelPaths) {
        const scene = loadedByPath.get(modelPath);
        if (!scene) continue;
        const pres = EventDisplayComponent.detectorPartPresentation(modelPath);
        const visible = this.defaultRestoredPartVisible(modelPath);
        const opacity = this.getDetectorPartOpacity(scene);
        scene.visible = visible;
        this.zeroDetectorSceneOpacity(scene);
        this.detector.add(scene);
        this.detectorPartRootByPath.set(modelPath, scene);
        nextUi.push({
          assetPath: modelPath,
          labelKey: pres.labelKey,
          labelParams: pres.labelParams,
          visible,
          opacity,
          accentColor: detectorPartAccentColor(modelPath)
        });
      }
      this.detectorPartsForUi = nextUi;
      this.persistDetectorPartUiState();
      this.detectorScene = this.detector;
      this.loading = false;
      // Options panel stays open after the staggered shell reveal.
      this.sidebarOpened = true;
      if (nextUi.length > 0) {
        this.detectorOpacity = nextUi[0].opacity;
        this.detectorLayersPanelOpened = true;
      }
      this.cdr.markForCheck();
      this.resize(true);
      this.rebuildCalorimeterReadouts();
      this.syncCalorimeterReadoutVisibility();
      this.requestRender(true);
      // Final physics (assembly already done) — reveal shells first, then tracks/clusters.
      this.staggeredRevealDetectorParts(modelPaths, 350, 500, () => {
        this.deferPhysicsUntilDetectorReveal = false;
        this.refreshPhysicsForAssemblyUnlock();
        this.sidebarOpened = true;
        this.cdr.markForCheck();
      });
    };

    const finishMultipartPreload = () => {
      this.detectorMultipartModelPathsOrder = [...modelPaths];
      this.detectorPreloadedRoots.clear();
      this.detectorPaletteItems = [];
      const dcalPath = modelPaths.find((p) => EventDisplayComponent.isDcalAssetPath(p)) ?? null;
      for (const modelPath of modelPaths) {
        const scene = loadedByPath.get(modelPath);
        if (scene) {
          scene.visible = false;
          this.detectorPreloadedRoots.set(modelPath, scene);
        } else {
          console.warn(`[EventDisplay] Model not loaded, will be skipped in 3D but kept in palette: ${modelPath}`);
        }
        // DCal rides with EMCal as one "Calorimeters" construction card.
        if (EventDisplayComponent.isDcalAssetPath(modelPath)) {
          continue;
        }
        const pres = EventDisplayComponent.assemblyPalettePresentation(modelPath);
        const companions =
          EventDisplayComponent.isEmcalAssetPath(modelPath) && dcalPath
            ? [dcalPath]
            : undefined;
        this.detectorPaletteItems.push({
          assetPath: modelPath,
          labelKey: pres.labelKey,
          labelParams: pres.labelParams,
          placed: false,
          companionAssetPaths: companions
        });
      }
      // Left sidebar stays closed until construction finishes.
      this.leftSidebarOpened = false;
      // Assembly palette lives in the right overlay — keep it visible.
      this.sidebarOpened = true;
      this.detectorPartsForUi = [];
      this.detectorScene = null;
      this.loading = false;
      this.applyCamera3DPosition(EventDisplayComponent.CAMERA_3D_ASSEMBLY_START);
      this.cdr.markForCheck();
      this.resize(true);
      this.requestRender(true);
    };

    const finishOne = () => {
      remaining -= 1;
      if (remaining === 0) {
        // Skip may persist completion while GLBs are still loading — attach as finished.
        if (useInteractiveMultipartAssembly && !this.isStoredDetectorAssemblyComplete(modelPaths)) {
          finishMultipartPreload();
        } else {
          this._detectorInteractiveAssemblyDone = true;
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
          let scene: THREE.Object3D = gltf.scene;
          const radialInflate = 1 + pathIndex * EventDisplayComponent.DETECTOR_LAYER_RADIAL_INFLATE_STEP;
          scene.scale.setScalar(EventDisplayComponent.detectorModelScale * radialInflate);
          EventDisplayComponent.alignDetectorPartToBeamAxis(scene, modelPath);
          EventDisplayComponent.freezeStaticTransforms(scene);
          scene.userData = {
            ...(scene.userData || {}),
            detectorAssetPath: modelPath,
            detectorLayerIndex: pathIndex
          };
          // Mild batched merge (≤20 source meshes / draw). ITS/TPC: merge only.
          // Other layers: prune tiny CAD bits first. EMCal/DCal stay unmerged.
          // FIT GLB is pre-gltfpacked.
          scene = optimizeStaticDetectorPart(scene, modelPath);
          EventDisplayComponent.freezeStaticTransforms(scene);
          this.setDetectorMaterialsWithPolygonOffset(scene, defaultPartOpacity, pathIndex);
          loadedByPath.set(modelPath, scene);
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

  /** Attach one preloaded GLB root onto the detector (fade-in + toggle row). */
  private attachPreloadedDetectorPart(assetPath: string): boolean {
    const root = this.detectorPreloadedRoots.get(assetPath);
    if (!root || this.detectorPartRootByPath.has(assetPath)) {
      return false;
    }

    this.zeroDetectorSceneOpacity(root);
    this.detector.add(root);
    this.detectorPartRootByPath.set(assetPath, root);
    // Preload keeps roots hidden; mark visible before rebuilding sidebar toggles.
    root.visible = true;
    // Fade to the same default opacity the left-sidebar slider shows for this part.
    this.fadeInDetectorScene(root, 500, () => {
      const part = this.detectorPartsForUi.find((p) => p.assetPath === assetPath);
      if (part) {
        this.setDetectorPartOpacity(part, part.opacity);
      }
    });
    return true;
  }

  /** Returns true when the piece snaps into the detector (valid drop zone). */
  private tryPlaceDetectorPieceFromPalette(item: DetectorPaletteItem, clientX: number, clientY: number): boolean {
    // Guided assembly: only the currently coached part may be placed.
    if (!this._detectorInteractiveAssemblyDone) {
      if (!this.assemblyAllowedDragAssetPath || item.assetPath !== this.assemblyAllowedDragAssetPath) {
        return false;
      }
    }

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

    const primaryRoot = this.detectorPreloadedRoots.get(item.assetPath);
    if (!primaryRoot || item.placed) return false;

    const pathsToPlace = [item.assetPath, ...(item.companionAssetPaths ?? [])];
    let attachedAny = false;
    for (const path of pathsToPlace) {
      if (this.attachPreloadedDetectorPart(path)) {
        attachedAny = true;
      }
    }
    if (!attachedAny) return false;

    item.placed = true;

    this.detectorPartsForUi = this.rebuildDetectorPartTogglesSorted();
    this.refreshPhysicsForAssemblyUnlock();
    this.zoomOutCameraForAssemblyProgress();
    this.requestRender(true);

    const allPlaced = this.detectorPaletteItems.every((row) => row.placed);
    if (allPlaced) {
      this.completeMultipartDetectorAssembly();
    } else if (pathsToPlace.some((p) => EventDisplayComponent.isCalorimeterAssetPath(p))) {
      this.rebuildCalorimeterReadouts();
    }

    // Emit after persist-on-complete so parent unlocks dataset/event controls.
    this.detectorAssemblyPiecePlaced.emit(item.assetPath);
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
        opacity: existing ? existing.opacity : root ? this.getDetectorPartOpacity(root) : EventDisplayComponent.DETECTOR_OUTER_OPACITY,
        accentColor: existing?.accentColor ?? detectorPartAccentColor(p)
      });
    }
    return next;
  }

  private completeMultipartDetectorAssembly(): void {
    this.persistDetectorAssemblyCompleted(this.detectorMultipartModelPathsOrder);
    this._detectorInteractiveAssemblyDone = true;
    this.detectorScene = this.detector;
    this.detectorPartsForUi = this.rebuildDetectorPartTogglesSorted();
    // Assembly never exposes toggles mid-build; ensure every placed part starts on.
    for (const part of this.detectorPartsForUi) {
      part.visible = true;
      const root = this.detectorPartRootByPath.get(part.assetPath);
      if (root) {
        root.visible = true;
      }
    }
    if (this.detectorPartsForUi.length > 0) {
      this.detectorOpacity = this.detectorPartsForUi[0].opacity;
    }
    this.syncCalorimeterReadoutVisibility();
    this.persistDetectorPartUiState();
    if (this.detectorPartsForUi.length > 0) {
      this.detectorLayersPanelOpened = true;
    }
    // After assembly finishes, keep the right options panel open by default.
    this.sidebarOpened = true;
    this.applyUiDetectorOpacities();
    this.rebuildCalorimeterReadouts();
    this.refreshPhysicsForAssemblyUnlock();
    this.cdr.markForCheck();
    this.syncSideViewResources();
    this.requestRender();
  }

  /**
   * Force-complete interactive detector assembly (VA Skip button).
   * Places any remaining preloaded parts, persists session completion, and frames the overview camera.
   * Safe to call while GLBs are still loading — completion is persisted so attach runs as finished.
   */
  skipMultipartDetectorAssembly(fallbackPaths?: string[]): void {
    const paths =
      this.detectorMultipartModelPathsOrder.length > 0
        ? this.detectorMultipartModelPathsOrder
        : (fallbackPaths?.length
          ? fallbackPaths
          : (Array.isArray(this.detectorModel) ? this.detectorModel : [this.detectorModel]).filter(Boolean));

    if (paths.length > 0) {
      this.persistDetectorAssemblyCompleted(paths);
    }

    if (!this._detectorInteractiveAssemblyDone) {
      for (const item of this.detectorPaletteItems) {
        if (item.placed) continue;
        const pathsToPlace = [item.assetPath, ...(item.companionAssetPaths ?? [])];
        for (const path of pathsToPlace) {
          this.attachPreloadedDetectorPart(path);
        }
        item.placed = true;
      }
      if (this.detectorMultipartModelPathsOrder.length > 0) {
        this.completeMultipartDetectorAssembly();
      } else {
        this._detectorInteractiveAssemblyDone = true;
        this.cdr.markForCheck();
      }
    }

    this.applyCamera3DPosition(EventDisplayComponent.CAMERA_3D_OVERVIEW);
    this.requestRender(true);
  }

  /** Hide FIT and L3 (e.g. after dismissing the assembly-complete coach). */
  hideOuterDetectorPartsAfterAssembly(): void {
    for (const part of this.detectorPartsForUi) {
      if (
        EventDisplayComponent.isFitAssetPath(part.assetPath) ||
        EventDisplayComponent.isL3AssetPath(part.assetPath)
      ) {
        part.visible = false;
        const root = this.detectorPartRootByPath.get(part.assetPath);
        if (root) {
          root.visible = false;
        }
      }
    }
    this.syncCalorimeterReadoutVisibility();
    this.persistDetectorPartUiState();
    this.requestRender(true);
  }

  /**
   * Camera framing along the assembly zoom path (t=0 close / ITS-scale, t=1 full overview).
   */
  static cameraPositionForAssemblyProgress(t: number): { x: number; y: number; z: number } {
    const u = Math.min(1, Math.max(0, t));
    const a = EventDisplayComponent.CAMERA_3D_ASSEMBLY_START;
    const b = EventDisplayComponent.CAMERA_3D_OVERVIEW;
    return {
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      z: a.z + (b.z - a.z) * u,
    };
  }

  /** Orbit distance from origin for the scripted assembly framing at progress t. */
  static cameraDistanceForAssemblyProgress(t: number): number {
    const pos = EventDisplayComponent.cameraPositionForAssemblyProgress(t);
    return Math.hypot(pos.x, pos.y, pos.z);
  }

  /** Frames the 3D orbit camera (no-op until WebGL scene exists). */
  private applyCamera3DPosition(pos: { x: number; y: number; z: number }): void {
    if (!this.camera3D || !this.controls) return;
    this.camera3D.position.set(pos.x, pos.y, pos.z);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  /**
   * After each multipart piece snaps in, ease the orbit camera farther out so
   * the growing detector stays framed. Preserves the user's current orbit target
   * and viewing angle — only increases distance (never snaps back to origin / scripted path).
   */
  private zoomOutCameraForAssemblyProgress(): void {
    if (!this.camera3D || !this.controls) return;

    const total = this.detectorPaletteItems.length;
    if (total <= 0) return;
    const placed = this.detectorPaletteItems.filter((row) => row.placed).length;
    const desiredDistance = EventDisplayComponent.cameraDistanceForAssemblyProgress(placed / total);

    const orbitTarget = {
      x: this.controls.target.x,
      y: this.controls.target.y,
      z: this.controls.target.z,
    };
    const from = {
      x: this.camera3D.position.x,
      y: this.camera3D.position.y,
      z: this.camera3D.position.z,
    };
    const offsetX = from.x - orbitTarget.x;
    const offsetY = from.y - orbitTarget.y;
    const offsetZ = from.z - orbitTarget.z;
    const currentDistance = Math.hypot(offsetX, offsetY, offsetZ);

    // Already framed at least as far as the scripted progress — keep user framing.
    if (currentDistance >= desiredDistance - 1e-6) return;

    let dirX: number;
    let dirY: number;
    let dirZ: number;
    if (currentDistance < 1e-6) {
      const fallback = EventDisplayComponent.cameraPositionForAssemblyProgress(placed / total);
      const fallbackLen = Math.hypot(fallback.x, fallback.y, fallback.z) || 1;
      dirX = fallback.x / fallbackLen;
      dirY = fallback.y / fallbackLen;
      dirZ = fallback.z / fallbackLen;
    } else {
      dirX = offsetX / currentDistance;
      dirY = offsetY / currentDistance;
      dirZ = offsetZ / currentDistance;
    }

    const to = {
      x: orbitTarget.x + dirX * desiredDistance,
      y: orbitTarget.y + dirY * desiredDistance,
      z: orbitTarget.z + dirZ * desiredDistance,
    };

    const generation = ++this.assemblyCameraZoomGeneration;
    const durationMs = EventDisplayComponent.ASSEMBLY_CAMERA_ZOOM_MS;
    const start = performance.now();

    const step = () => {
      if (this.viewDestroyed || generation !== this.assemblyCameraZoomGeneration) return;
      if (!this.camera3D || !this.controls) return;
      const t = Math.min((performance.now() - start) / durationMs, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.camera3D.position.set(
        from.x + (to.x - from.x) * ease,
        from.y + (to.y - from.y) * ease,
        from.z + (to.z - from.z) * ease
      );
      // Keep the user's orbit target (do not reset to origin).
      this.controls.target.set(orbitTarget.x, orbitTarget.y, orbitTarget.z);
      this.controls.update();
      this.requestRender();
      if (t < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }

  setDetectorPartVisibility(part: DetectorPartToggleModel, visible: boolean): void {
    part.visible = visible;
    const root = this.detectorPartRootByPath.get(part.assetPath);
    if (root) {
      root.visible = visible;
    }
    this.syncCalorimeterReadoutVisibility();
    this.persistDetectorPartUiState();
    this.requestRender(true);
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
    this.persistDetectorPartUiState();
    this.requestRender(true);
  }

  /** Push each part's UI opacity through setDetectorPartOpacity (identical to moving the slider). */
  private applyUiDetectorOpacities(): void {
    for (const part of this.detectorPartsForUi) {
      this.setDetectorPartOpacity(part, part.opacity);
    }
  }

  /**
   * Snapshot detector-root visibility + mesh material opacity for temporary side-view masks.
   */
  private captureDetectorPartRenderState(): Array<{
    root: THREE.Object3D;
    visible: boolean;
    materials: Array<{
      material: THREE.Material;
      opacity: number;
      transparent: boolean;
      baseOpacity: number | undefined;
    }>;
  }> {
    const snap: Array<{
      root: THREE.Object3D;
      visible: boolean;
      materials: Array<{
        material: THREE.Material;
        opacity: number;
        transparent: boolean;
        baseOpacity: number | undefined;
      }>;
    }> = [];
    for (const root of this.detectorPartRootByPath.values()) {
      const materials: Array<{
        material: THREE.Material;
        opacity: number;
        transparent: boolean;
        baseOpacity: number | undefined;
      }> = [];
      root.traverse((o: THREE.Object3D) => {
        if (!(o as THREE.Mesh).isMesh) return;
        const raw = (o as THREE.Mesh).material;
        const mats: THREE.Material[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
        for (const m of mats) {
          if (!m) continue;
          const anyMat = m as THREE.Material & { opacity?: number; transparent?: boolean; userData?: any };
          materials.push({
            material: m,
            opacity: typeof anyMat.opacity === 'number' ? anyMat.opacity : 1,
            transparent: !!anyMat.transparent,
            baseOpacity: typeof anyMat.userData?.baseOpacity === 'number'
              ? anyMat.userData.baseOpacity
              : undefined,
          });
        }
      });
      snap.push({ root, visible: root.visible, materials });
    }
    return snap;
  }

  private applySideViewDetectorMask(
    which: typeof EventDisplayComponent.SIDE_VIEW_RPHI | typeof EventDisplayComponent.SIDE_VIEW_RHOZ
  ): void {
    const opacity = EventDisplayComponent.SIDE_VIEW_DETECTOR_OPACITY;
    for (const [assetPath, root] of this.detectorPartRootByPath.entries()) {
      const allowed = EventDisplayComponent.sideViewAllowsPart(assetPath, which);
      root.visible = allowed;
      if (!allowed) continue;
      root.traverse((o: THREE.Object3D) => {
        if (!(o as THREE.Mesh).isMesh) return;
        const raw = (o as THREE.Mesh).material;
        const mats: THREE.Material[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
        for (const m of mats) {
          if (!m) continue;
          const anyMat = m as THREE.Material & { opacity?: number; transparent?: boolean; userData?: any; needsUpdate?: boolean };
          anyMat.transparent = opacity < 0.995;
          anyMat.userData = { ...(anyMat.userData || {}), baseOpacity: opacity };
          anyMat.opacity = opacity;
          anyMat.needsUpdate = true;
        }
      });
    }
    this.calorimeterReadouts.visible = false;
  }

  private restoreDetectorPartRenderState(
    snap: Array<{
      root: THREE.Object3D;
      visible: boolean;
      materials: Array<{
        material: THREE.Material;
        opacity: number;
        transparent: boolean;
        baseOpacity: number | undefined;
      }>;
    }>
  ): void {
    for (const entry of snap) {
      entry.root.visible = entry.visible;
      for (const matSnap of entry.materials) {
        const anyMat = matSnap.material as THREE.Material & {
          opacity?: number;
          transparent?: boolean;
          userData?: any;
          needsUpdate?: boolean;
        };
        anyMat.opacity = matSnap.opacity;
        anyMat.transparent = matSnap.transparent;
        if (matSnap.baseOpacity !== undefined) {
          anyMat.userData = { ...(anyMat.userData || {}), baseOpacity: matSnap.baseOpacity };
        }
        anyMat.needsUpdate = true;
      }
    }
    this.syncCalorimeterReadoutVisibility();
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
  /**
   * After tracks/clusters (+500): bars depth-test against track depth writes so a
   * near-side calorimeter occludes tracks and a far-side one stays behind them.
   * Tracks use opaque LineMaterials (depthTest/depthWrite on), same stack as
   * particle-propagation — bars stay transparent so they can still depth-test
   * in the later pass.
   */
  private static readonly CALO_BAR_RENDER_ORDER = EventDisplayComponent.PHYSICS_RENDER_ORDER_BASE + 600;
  /** Draw TRD/TOF hits after transparent detector shells (opaque queue always runs first). */
  private static readonly LAYER_HIT_RENDER_ORDER = EventDisplayComponent.PHYSICS_RENDER_ORDER_BASE + 50000;

  private setDetectorMaterialsWithPolygonOffset(object: THREE.Object3D, opacity: number, layerIndex = 0) {
    const layerOffset = -(layerIndex + 1) * 2;
    const layerRenderOrderBase = layerIndex * EventDisplayComponent.DETECTOR_RENDER_ORDER_LAYER_STRIDE;
    object.renderOrder = layerRenderOrderBase;
    const assetPath = String(object.userData?.['detectorAssetPath'] ?? '');
    const isL3 = EventDisplayComponent.isL3AssetPath(assetPath);
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
      // L3 liner + yoke share one GLB material. Clone per mesh like PP's
      // `buildOuterMagnetInstanced` so polygon-offset / opacity stay independent.
      if (isL3) {
        const raw = mesh.material;
        mesh.material = Array.isArray(raw)
          ? raw.map((m) => (m ? m.clone() : m))
          : raw
            ? raw.clone()
            : raw;
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((mat: THREE.Material) => {
        if (!mat) return;
        (mat as any).transparent = false;
        (mat as any).opacity = 1;
        (mat as any).userData = { ...((mat as any).userData || {}), baseOpacity: opacity };
        // Octagon L3 stand-in: VA's end-on camera looks into the bore. Authored
        // inner-wall normals are culled with FrontSide, so the tunnel reads as a
        // thin washed frame against the white clear color. DoubleSide restores
        // the saturated red interior facets (matches PP light-mode look).
        (mat as any).side = isL3 ? THREE.DoubleSide : THREE.FrontSide;
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
    this.syncSceneLighting();
    if (this.trackMaterial) {
      (this.trackMaterial as LineMaterial).color.copy(
        this._darkMode ? EventDisplayComponent.neonTrackColor : EventDisplayComponent.trackColor
      );
    }
    this.applyTrackMaterialWidths();
    if (this.detector) {
      this.applyDarkModeToObject(this.detector);
    }
    this.applyCalorimeterBarTheme();
  }

  /** Bright, flatter fill in light mode; keep darker contrast for neon dark mode. */
  private syncSceneLighting(): void {
    if (!this.ambientLight || !this.hemisphereLight || !this.directionalLightA || !this.directionalLightB) {
      return;
    }
    if (this._darkMode) {
      const a = EventDisplayComponent.DARK_MODE_AMBIENT;
      const h = EventDisplayComponent.DARK_MODE_HEMISPHERE;
      this.ambientLight.color.setHex(a.color);
      this.ambientLight.intensity = a.intensity;
      this.hemisphereLight.color.setHex(h.sky);
      this.hemisphereLight.groundColor.setHex(h.ground);
      this.hemisphereLight.intensity = h.intensity;
      this.directionalLightA.intensity = EventDisplayComponent.DARK_MODE_DIRECTIONAL_INTENSITY;
      this.directionalLightB.intensity = EventDisplayComponent.DARK_MODE_DIRECTIONAL_INTENSITY;
    } else {
      const a = EventDisplayComponent.LIGHT_MODE_AMBIENT;
      const h = EventDisplayComponent.LIGHT_MODE_HEMISPHERE;
      this.ambientLight.color.setHex(a.color);
      this.ambientLight.intensity = a.intensity;
      this.hemisphereLight.color.setHex(h.sky);
      this.hemisphereLight.groundColor.setHex(h.ground);
      this.hemisphereLight.intensity = h.intensity;
      this.directionalLightA.intensity = EventDisplayComponent.LIGHT_MODE_DIRECTIONAL_INTENSITY;
      this.directionalLightB.intensity = EventDisplayComponent.LIGHT_MODE_DIRECTIONAL_INTENSITY;
    }
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
          if ('metalness' in m && typeof userData.baseMetalness === 'number') {
            m.metalness = userData.baseMetalness;
          }
        } else {
          m.color.copy(userData.neonBaseColor);
          // Soften metallic self-shadows: keep albedo, cut metalness so light mode stays airy.
          // Same ceiling as Particle Propagation `applyDetectorDarkMode`.
          if ('metalness' in m) {
            if (typeof userData.baseMetalness !== 'number') {
              userData.baseMetalness = typeof m.metalness === 'number' ? m.metalness : 0;
            }
            m.metalness = Math.min(
              userData.baseMetalness,
              EventDisplayComponent.LIGHT_MODE_MAX_METALNESS
            );
          }
          if ('emissive' in m) {
            m.emissive.setRGB(0, 0, 0);
            (m as any).emissiveIntensity = 0;
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
      this.caloBarMaterial.opacity = 0.92;
      this.caloBarMaterial.roughness = 0.35;
    } else {
      this.caloBarMaterial.color.copy(EventDisplayComponent.caloBarColorLight);
      this.caloBarMaterial.emissive.setRGB(0, 0, 0);
      this.caloBarMaterial.emissiveIntensity = 0;
      this.caloBarMaterial.opacity = 1;
      this.caloBarMaterial.roughness = 0.55;
    }
    // Transparent so bars draw after opaque tracks and depth-test against them.
    this.caloBarMaterial.transparent = true;
    this.caloBarMaterial.depthTest = true;
    this.caloBarMaterial.depthWrite = true;
    this.caloBarMaterial.needsUpdate = true;
  }

  /** Put an object (and all descendants) on the main-view-only layer. */
  static assignMainOnlyLayer(root: THREE.Object3D): void {
    root.traverse((o) => {
      o.layers.set(EventDisplayComponent.LAYER_MAIN_ONLY);
    });
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
    // TODO(future-data-update): Remove this early return once CALORIMETER_HITS_ENABLED
    // is turned on with real cell-energy data in a future app / data release.
    if (!EventDisplayComponent.CALORIMETER_HITS_ENABLED) {
      this.syncCalorimeterReadoutVisibility();
      return;
    }
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
      mesh.renderOrder = EventDisplayComponent.CALO_BAR_RENDER_ORDER;
      this.calorimeterReadouts.add(mesh);
    }

    this.syncCalorimeterReadoutVisibility();
  }

  /**
   * Prefers packed collision data (`caloEmcal` / `caloDcal`), then sparse `caloHits`,
   * then a procedural preview so the grid is visible before real activations land.
   *
   * TODO(future-data-update): Wire real activations here when calorimeter hits
   * ship with a collision-data update (see {@link CALORIMETER_HITS_ENABLED}).
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
        mats.forEach((mat) => {
          if (!mat) return;
          (mat as any).opacity = 0;
          (mat as any).transparent = true;
          (mat as any).needsUpdate = true;
        });
      }
    });
  }

  private fadeInDetectorScene(object: THREE.Object3D, durationMs: number, onComplete?: () => void): void {
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
            const opacity = base * ease;
            (mat as any).opacity = opacity;
            (mat as any).transparent = opacity < 0.995;
            (mat as any).needsUpdate = true;
          });
        }
      });
      this.requestRender(true);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        onComplete?.();
      }
    };
    requestAnimationFrame(step);
  }

  private staggeredRevealDetectorParts(
    modelPaths: string[],
    staggerMs = 350,
    fadeDurationMs = 500,
    onComplete?: () => void
  ): void {
    let index = 0;
    const revealNext = () => {
      if (index >= modelPaths.length) {
        this.applyUiDetectorOpacities();
        onComplete?.();
        return;
      }
      const path = modelPaths[index++];
      const scene = this.detectorPartRootByPath.get(path);
      const ui = this.detectorPartsForUi.find((p) => p.assetPath === path);
      // Respect restored toggle state — do not force-fade hidden layers back on.
      if (scene && ui?.visible !== false) {
        this.fadeInDetectorScene(scene, fadeDurationMs);
      }
      if (index < modelPaths.length) {
        setTimeout(revealNext, staggerMs);
      } else {
        setTimeout(() => {
          this.applyUiDetectorOpacities();
          onComplete?.();
        }, fadeDurationMs);
      }
    };
    revealNext();
  }

  @Input()
  get sideViewsShown(): boolean { return this._sideViewsShown; }
  set sideViewsShown(sideViewsShown: boolean) {
    this._sideViewsShown = sideViewsShown;
    this.syncSideViewResources();
    this.requestRender();
  }
  private _sideViewsShown: boolean = false;

  @Input()
  get axesShown(): boolean { return this.axes.visible; }
  set axesShown(axesShown: boolean) {
    this.axes.visible = axesShown;
    this.requestRender(true);
  }


  @Input()
  get detectorShown(): boolean { return this.detector.visible; }
  set detectorShown(detectorShown: boolean) {
    this.detector.visible = detectorShown;
    this.calorimeterReadouts.visible = detectorShown;
    if (detectorShown) {
      this.syncCalorimeterReadoutVisibility();
    }
    this.requestRender(true);
  }

  /** Master opacity for the whole detector (left-panel global slider). */
  detectorOpacity = EventDisplayComponent.DETECTOR_COMPONENT_OPACITY;

  setGlobalDetectorOpacity(value: number | string): void {
    const nextOpacity = Math.max(0.05, Math.min(0.95, Number(value)));
    this.detectorOpacity = Number.isFinite(nextOpacity) ? nextOpacity : this.detectorOpacity;
    for (const part of this.detectorPartsForUi) {
      this.setDetectorPartOpacity(part, this.detectorOpacity);
    }
  }

  private desiredTracksShown = true;
  private desiredClustersShown = true;
  /** When false, V0/cascade tracks use the normal track color (still visible). */
  private desiredDecaysShown = false;

  @Input()
  get tracksShown(): boolean { return this.desiredTracksShown; }
  set tracksShown(tracksShown: boolean) {
    this.desiredTracksShown = tracksShown;
    this.applyDesiredPhysicsVisibility();
    this.requestRender(true);
  }

  @Input()
  hasClusters: boolean;

  @Input()
  get clustersShown(): boolean { return this.desiredClustersShown; }
  set clustersShown(clustersShown: boolean) {
    this.desiredClustersShown = clustersShown;
    this.applyDesiredPhysicsVisibility();
    this.requestRender(true);
  }

  @Input()
  get decaysShown(): boolean { return this.desiredDecaysShown; }
  set decaysShown(decaysShown: boolean) {
    this.desiredDecaysShown = decaysShown;
    if (!decaysShown) {
      this.clearClickHighlight();
      this.beginCascadeHoverFadeOut();
    }
    this.applyDecayTrackMaterials();
    this.applyDesiredPhysicsVisibility();
    this.requestRender(true);
  }

  private createLine(
    track: number[][],
    material: THREE.Material,
    options?: { geometricStraight?: boolean }
  ): THREE.Object3D {
    let mesh: THREE.Object3D;
    const orderedTrack = EventDisplayComponent.orderTrajectoryFromIp(track);
    const points: Array<THREE.Vector3> = [];
    for (let point of orderedTrack) {
      points.push(new THREE.Vector3(
        EventDisplayComponent.objectScale * point[0],
        EventDisplayComponent.objectScale * point[1],
        EventDisplayComponent.objectScale * point[2]
      ));
    }

    let vertices: THREE.Vector3[];
    if (options?.geometricStraight) {
      // Colinear samples only — no CatmullRom (B = 0 → straight flight).
      const n = Math.max(2, EventDisplayComponent.lineSegments + 1);
      const a = points[0];
      const b = points[points.length - 1];
      vertices = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        vertices.push(new THREE.Vector3(
          a.x + (b.x - a.x) * t,
          a.y + (b.y - a.y) * t,
          a.z + (b.z - a.z) * t
        ));
      }
    } else {
      const spline = new THREE.CatmullRomCurve3(points);
      vertices = spline.getPoints(EventDisplayComponent.lineSegments);
    }

    const points2 = [];
    for (let v of vertices) {
      points2.push(v.x, v.y, v.z);
    }
    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions(points2);
    mesh = new Line2(lineGeometry, material as LineMaterial);
    mesh.renderOrder = EventDisplayComponent.PHYSICS_RENDER_ORDER_BASE + 500;
    (mesh as Line2).computeLineDistances();
    return mesh;
  }

  /** Applies parent's track/decay/cluster toggles. */
  private applyDesiredPhysicsVisibility(): void {
    const show = !this.deferPhysicsUntilDetectorReveal;
    this.tracks.visible = this.desiredTracksShown && show;
    // Decay meshes stay visible with tracks (or alone when only the Decays
    // highlight is on). The Decays toggle itself only recolors — see
    // applyDecayTrackMaterials — it no longer hides V0/cascade tracks.
    this.decays.visible =
      show && (this.desiredTracksShown || this.desiredDecaysShown);
    this.clusters.visible = this.desiredClustersShown && this.assemblyAllowsClusters() && show;
    this.primaryVertexMarkers.visible =
      this.desiredTracksShown && this.primaryVertexMarkers.children.length > 0 && show;
    this.layerHitMarkers.visible =
      this.desiredTracksShown && this.layerHitMarkers.children.length > 0 && show;
    this.syncCalorimeterReadoutVisibility();
  }

  /** Model includes ITS/TPC progressive unlock pieces. */
  private detectorModelHasTrackerUnlock(): boolean {
    const paths =
      this.detectorMultipartModelPathsOrder.length > 0
        ? this.detectorMultipartModelPathsOrder
        : Array.isArray(this._detectorModel)
          ? this._detectorModel
          : [];
    return paths.some(
      (p) =>
        EventDisplayComponent.isItsAssetPath(p) || EventDisplayComponent.isTpcAssetPath(p)
    );
  }

  /** Whether a multipart piece has been snapped onto the scene (ignores UI visibility). */
  private isDetectorPartPlaced(match: (assetPath: string) => boolean): boolean {
    return [...this.detectorPartRootByPath.keys()].some(match);
  }

  /**
   * Max track cylinder unlocked by placed barrel trackers (ITS < TPC).
   * TRD/TOF unlock hit markers instead of extending tracks.
   * Null = no clip (non-progressive model, or full assembly complete).
   */
  private getUnlockedTrackClipBounds(): { rMax: number; zMax: number } | null {
    if (!this.detectorModelHasTrackerUnlock()) {
      return null;
    }
    // After the detector is fully assembled, show complete trajectories.
    if (this._detectorInteractiveAssemblyDone) {
      return null;
    }
    const unlock = this.getAssemblyUnlockState();
    if (unlock.hasTpc) {
      return {
        rMax: EventDisplayComponent.TRACK_RADIUS_TPC,
        zMax: EventDisplayComponent.TRACK_Z_TPC,
      };
    }
    if (unlock.hasIts) {
      return {
        rMax: EventDisplayComponent.TRACK_RADIUS_ITS,
        zMax: EventDisplayComponent.TRACK_Z_ITS,
      };
    }
    return null;
  }

  /** Clusters unlock once TPC is placed (simulated during assembly; real after complete). */
  private assemblyAllowsClusters(): boolean {
    if (!this.detectorModelHasTrackerUnlock()) {
      return true;
    }
    if (this._detectorInteractiveAssemblyDone) {
      return true;
    }
    return this.isDetectorPartPlaced(EventDisplayComponent.isTpcAssetPath);
  }

  /** True when L3 is active → bent tracks. After assembly: always on (final detector). */
  private isL3MagnetActive(): boolean {
    if (this._detectorInteractiveAssemblyDone) {
      return true;
    }
    const expectsL3 =
      this.detectorMultipartModelPathsOrder.some((p) => EventDisplayComponent.isL3AssetPath(p)) ||
      (Array.isArray(this._detectorModel) &&
        this._detectorModel.some((p) => EventDisplayComponent.isL3AssetPath(p)));
    if (!expectsL3) {
      return true;
    }
    return this.isDetectorPartPlaced(EventDisplayComponent.isL3AssetPath);
  }

  private shouldRenderStraightTracks(): boolean {
    return !this.isL3MagnetActive();
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
      hasFit: hasFile('fit'),
      hasL3: paths.some((p) => EventDisplayComponent.isL3AssetPath(p)),
    };
  }

  /** Rebuild tracks/markers when the set of snapped detector parts changes. */
  private refreshPhysicsForAssemblyUnlock(): void {
    if (!this._event) {
      return;
    }
    this.rebuildTracksFromEvent();
    this.applyDesiredPhysicsVisibility();
    this.cdr.markForCheck();
  }

  private clearClusters(): void {
    while (this.clusters.children.length > 0) {
      const child = this.clusters.children[0];
      this.clusters.remove(child);
      const mesh = child as THREE.Points | THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
    }
  }

  private addClusterPointsToScene(pointsCm: number[][]): void {
    if (!pointsCm.length || !this.pointsMaterial) {
      return;
    }
    const scale = EventDisplayComponent.objectScale;
    const points = pointsCm.map(
      (p) => new THREE.Vector3(scale * p[0], scale * p[1], scale * p[2])
    );
    if (this.CLUSTERS_USE_POINTS) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const pointsMesh = new THREE.Points(geometry, this.pointsMaterial);
      pointsMesh.renderOrder = EventDisplayComponent.PHYSICS_RENDER_ORDER_BASE + 500;
      this.clusters.add(pointsMesh);
      return;
    }
    for (const point of points) {
      const geometry = new THREE.SphereGeometry(this.clusterSize, 4, 4);
      const sphereMesh = new THREE.Mesh(geometry, this.pointsMaterial as THREE.Material);
      sphereMesh.position.set(point.x, point.y, point.z);
      sphereMesh.scale.set(this.clusterSize, this.clusterSize, this.clusterSize);
      this.clusters.add(sphereMesh);
    }
  }

  /**
   * During progressive assembly with TPC placed: clusters simulated along the
   * same (usually straight) clipped tracks. After assembly (or non-progressive
   * models): use real `event.clusters`.
   */
  private rebuildClustersFromEvent(
    straight: boolean,
    showFull: boolean
  ): void {
    this.clearClusters();
    if (!this._event) {
      return;
    }

    const useTrackerUnlock = this.detectorModelHasTrackerUnlock();
    const assemblyDone = this._detectorInteractiveAssemblyDone;
    const tpcActive = this.isDetectorPartPlaced(EventDisplayComponent.isTpcAssetPath);

    if (useTrackerUnlock && !assemblyDone) {
      if (!tpcActive || !showFull) {
        return;
      }
      const bounds = {
        rMax: EventDisplayComponent.TRACK_RADIUS_TPC,
        zMax: EventDisplayComponent.TRACK_Z_TPC,
      };
      const points: number[][] = [];
      let trackSeed = 1;

      const addForTrack = (track: Track, startOverride?: number[] | null) => {
        const resolved = this.trajectoryForAssemblyMode(track, bounds, straight, startOverride);
        if (!resolved?.points?.length) {
          return;
        }
        const sampled = EventDisplayComponent.sampleNoisyClustersAlongTrajectory(resolved.points, {
          seed: trackSeed * 9973 + (track.particleId | 0) * 131 + (track.sign | 0) * 17,
        });
        trackSeed++;
        for (const p of sampled) {
          points.push(p);
        }
      };

      for (const track of this._event.tracks || []) {
        addForTrack(track);
      }
      if (showFull) {
        for (const particleList of this._event.decays || []) {
          const { v0Start, cascadeStart } = this.getDecayVertexStarts(particleList);
          for (const track of particleList) {
            let startOverride: number[] | null = null;
            if (straight) {
              if (track.type === TrackType.CASCADE_BACHELOR) {
                startOverride = cascadeStart ?? v0Start;
              } else if (v0Start) {
                startOverride = v0Start;
              }
            }
            addForTrack(track, startOverride);
          }
        }
      }
      this.addClusterPointsToScene(points);
      return;
    }

    if (this._event.clusters?.length) {
      this.addClusterPointsToScene(this._event.clusters);
    }
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

  private clearLayerHitMarkers(): void {
    while (this.layerHitMarkers.children.length > 0) {
      const child = this.layerHitMarkers.children[0];
      this.layerHitMarkers.remove(child);
      child.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        // Materials are shared (layerHitTrd/TofMaterial) — do not dispose.
      });
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
      if (r > EventDisplayComponent.TRACK_RADIUS_ITS) {
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

  private trajectoryForAssemblyMode(
    track: Track,
    bounds: { rMax: number; zMax: number } | null,
    straight: boolean,
    startOverride?: number[] | null
  ): { points: number[][]; geometricStraight: boolean } | null {
    if (!track?.trajectory?.length) {
      return null;
    }

    let geometricStraight = false;
    let points: number[][] | null = null;

    if (straight) {
      points = EventDisplayComponent.buildStraightTrajectory(
        track.trajectory,
        track.px,
        track.py,
        track.pz,
        startOverride
      );
      geometricStraight = !!points;
    } else if (track.trajectory.length >= 2) {
      points = track.trajectory;
    }

    if (!points) {
      return null;
    }

    if (bounds != null && bounds.rMax > 0) {
      points = EventDisplayComponent.clipTrajectoryToCylinder(
        points,
        bounds.rMax,
        bounds.zMax
      );
    }

    return points.length >= 2 ? { points, geometricStraight } : null;
  }

  /**
   * Builds background + decay track meshes according to
   * assembly unlock: ITS-only → stubs + PV; TPC → full length; L3 → bent vs straight.
   * TRD/TOF place layer-crossing hit markers (no further radial track unlock).
   */
  private rebuildTracksFromEvent(): void {
    this.clearCascadeHover();
    this.clearClickHighlight();
    this.tracks.clear();
    this.decays.clear();
    this.clearPrimaryVertexMarkers();
    this.clearLayerHitMarkers();
    this.clearClusters();

    if (!this._event) {
      return;
    }

    const useTrackerUnlock = this.detectorModelHasTrackerUnlock();
    const assemblyDone = this._detectorInteractiveAssemblyDone;
    const tpcActive = this.isDetectorPartPlaced(EventDisplayComponent.isTpcAssetPath);
    const itsActive = this.isDetectorPartPlaced(EventDisplayComponent.isItsAssetPath);
    // Completed assembly (incl. refresh / session restore): always full tracks.
    // During progressive build: TPC+ → full mode; ITS-only → stubs; else nothing.
    const showFull = !useTrackerUnlock || assemblyDone || tpcActive;
    const showStubs = useTrackerUnlock && !assemblyDone && itsActive && !tpcActive;

    if (!showFull && !showStubs) {
      this.applyDesiredPhysicsVisibility();
      return;
    }

    const bounds = this.getUnlockedTrackClipBounds();
    const straight = this.shouldRenderStraightTracks();

    if (showStubs) {
      const pv = this.estimatePrimaryVertexPosition(this._event.tracks);
      this.primaryVertexMarkers.add(this.createVertexMarker(pv, 'Primary Vertex'));
    }

    // Hide background copies of decay daughters (same helix, often PDG=0 in tracks[]).
    const hiddenBackground = showFull
      ? EventDisplayComponent.backgroundTrackIndicesHiddenByDecays(this._event)
      : new Set<number>();

    for (let trackIndex = 0; trackIndex < this._event.tracks.length; trackIndex++) {
      if (hiddenBackground.has(trackIndex)) {
        continue;
      }
      const track = this._event.tracks[trackIndex];
      const resolved = this.trajectoryForAssemblyMode(track, bounds, straight);
      if (!resolved) {
        continue;
      }
      const line = this.createLine(resolved.points, this.trackMaterial, {
        geometricStraight: resolved.geometricStraight
      });
      this.tracks.add(line);
    }

    // Decays only after TPC (same gate as clusters / layer hits).
    const decays = showFull ? this._event.decays || [] : [];
    for (let decayIndex = 0; decayIndex < decays.length; decayIndex++) {
      const particleList = decays[decayIndex];
      const { v0Start, cascadeStart } = this.getDecayVertexStarts(particleList);
      const decayObject = new THREE.Object3D();
      (decayObject as any).userData = {
        decayIndex
      };
      for (const track of particleList) {
        let startOverride: number[] | null = null;
        if (straight) {
          if (track.type === TrackType.CASCADE_BACHELOR) {
            startOverride = cascadeStart ?? v0Start;
          } else if (v0Start) {
            startOverride = v0Start;
          }
        }
        const resolved = this.trajectoryForAssemblyMode(track, bounds, straight, startOverride);
        if (!resolved) {
          continue;
        }
        const line = this.createLine(
          resolved.points,
          this.materialForDecayTrack(track),
          { geometricStraight: resolved.geometricStraight }
        );
        (line as any).userData = {
          ...(line as any).userData,
          ...track,
          decayIndex,
          isDecayTrack: true
        };
        decayObject.add(line);
      }
      if (decayObject.children.length > 0) {
        this.decays.add(decayObject);
      }
    }

    this.rebuildLayerHitMarkers(straight, showFull);
    this.rebuildClustersFromEvent(straight, showFull);
    this.applyDesiredPhysicsVisibility();
  }

  /**
   * Places TRD/TOF hit spheres at trajectory × cylinder intersections while
   * progressive assembly is still open (tracks stay clipped at TPC).
   */
  private rebuildLayerHitMarkers(
    straight: boolean,
    showFull: boolean
  ): void {
    if (!this._event || !this.detectorModelHasTrackerUnlock() || this._detectorInteractiveAssemblyDone) {
      return;
    }
    const unlock = this.getAssemblyUnlockState();
    if (!unlock.hasTrd && !unlock.hasTof) {
      return;
    }

    const addHitsForTrack = (track: Track, startOverride?: number[] | null) => {
      const resolved = this.trajectoryForAssemblyMode(track, null, straight, startOverride);
      if (!resolved?.points?.length) {
        return;
      }
      if (unlock.hasTrd) {
        const hit = EventDisplayComponent.intersectTrajectoryAtRadius(
          resolved.points,
          EventDisplayComponent.TRACK_RADIUS_TRD,
          EventDisplayComponent.TRACK_Z_TRD
        );
        if (hit) {
          this.layerHitMarkers.add(
            this.createLayerHitMarker(hit, EventDisplayComponent.LAYER_HIT_COLOR_TRD, 'EVENT_DISPLAY.TRD_READING')
          );
        }
      }
      if (unlock.hasTof) {
        const hit = EventDisplayComponent.intersectTrajectoryAtRadius(
          resolved.points,
          EventDisplayComponent.TRACK_RADIUS_TOF,
          EventDisplayComponent.TRACK_Z_TOF
        );
        if (hit) {
          this.layerHitMarkers.add(
            this.createLayerHitMarker(hit, EventDisplayComponent.LAYER_HIT_COLOR_TOF, 'EVENT_DISPLAY.TOF_READING')
          );
        }
      }
    };

    for (const track of this._event.tracks || []) {
      addHitsForTrack(track);
    }

    if (showFull) {
      for (const particleList of this._event.decays || []) {
        const { v0Start, cascadeStart } = this.getDecayVertexStarts(particleList);
        for (const track of particleList) {
          let startOverride: number[] | null = null;
          if (straight) {
            if (track.type === TrackType.CASCADE_BACHELOR) {
              startOverride = cascadeStart ?? v0Start;
            } else if (v0Start) {
              startOverride = v0Start;
            }
          }
          addHitsForTrack(track, startOverride);
        }
      }
    }
  }


  /**
   * Vertex starts for one decay entry (V0 = 2 tracks, cascade = 3).
   * Positions are in event/physics coordinates (pre objectScale).
   */
  private getDecayVertexStarts(particleList: Track[]): {
    v0Start: number[] | null;
    cascadeStart: number[] | null;
  } {
    if (!particleList?.length) {
      return { v0Start: null, cascadeStart: null };
    }

    if (particleList.length === 3) {
      const [t0, t1, bach] = particleList;
      if (!t0?.trajectory?.length || !t1?.trajectory?.length || !bach?.trajectory?.length) {
        return { v0Start: null, cascadeStart: null };
      }
      const v0Start = [
        (t0.trajectory[0][0] + t1.trajectory[0][0]) / 2,
        (t0.trajectory[0][1] + t1.trajectory[0][1]) / 2,
        (t0.trajectory[0][2] + t1.trajectory[0][2]) / 2
      ];
      const cascadeStart = [bach.trajectory[0][0], bach.trajectory[0][1], bach.trajectory[0][2]];
      return { v0Start, cascadeStart };
    }

    if (particleList.length === 2) {
      const [t0, t1] = particleList;
      if (!t0?.trajectory?.length || !t1?.trajectory?.length) {
        return { v0Start: null, cascadeStart: null };
      }
      const v0Start = [
        (t0.trajectory[0][0] + t1.trajectory[0][0]) / 2,
        (t0.trajectory[0][1] + t1.trajectory[0][1]) / 2,
        (t0.trajectory[0][2] + t1.trajectory[0][2]) / 2
      ];
      return { v0Start, cascadeStart: null };
    }

    return { v0Start: null, cascadeStart: null };
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
    (mesh as any).userData = {
      vertexLabel: label
    };
    return mesh;
  }

  private createLayerHitMarker(position: number[], color: number, labelKey: string): THREE.Group {
    const scale = EventDisplayComponent.objectScale;
    const group = new THREE.Group();
    const labelData = {
      vertexLabelKey: labelKey,
      vertexLabel: this.translate.instant(labelKey)
    };
    (group as any).userData = labelData;

    const mat =
      color === EventDisplayComponent.LAYER_HIT_COLOR_TRD
        ? this.layerHitTrdMaterial
        : this.layerHitTofMaterial;
    const topOrder = EventDisplayComponent.LAYER_HIT_RENDER_ORDER;

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(EventDisplayComponent.LAYER_HIT_MARKER_RADIUS, 16, 12),
      mat
    );
    dot.renderOrder = topOrder;
    dot.frustumCulled = false;
    (dot as any).userData = { ...labelData };
    group.add(dot);

    group.position.set(position[0] * scale, position[1] * scale, position[2] * scale);
    group.renderOrder = topOrder;
    group.frustumCulled = false;
    return group;
  }

  private resolveMarkerLabel(userData: { vertexLabel?: string; vertexLabelKey?: string } | null | undefined): string {
    if (!userData) {
      return '';
    }
    if (userData.vertexLabelKey) {
      return this.translate.instant(userData.vertexLabelKey);
    }
    return userData.vertexLabel ?? '';
  }

  @Input()
  get event(): Event { return this._event; }
  set event(event: Event) {
    this._event = event;
    this.tracks.clear();
    this.decays.clear();
    this.clusters.clear();
    this.clearPrimaryVertexMarkers();
    this.clearLayerHitMarkers();
    this.loading = true;
    if (this._event !== null && !this.deferPhysicsUntilDetectorReveal) {
      this.rebuildTracksFromEvent();
    }
    this.rebuildCalorimeterReadouts();
    this.applyDesiredPhysicsVisibility();
    this.loading = false;
    this.requestRender(true);
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

  /**
   * When set during unfinished multipart assembly, only this palette asset can be dragged/placed.
   * When null while assembly is unfinished (e.g. welcome coach), all palette drags are blocked.
   */
  @Input()
  assemblyAllowedDragAssetPath: string | null = null;

  /**
   * Optional tip panel rendered in the top-right of the viz (next to the assembly drawer).
   * Prefer TemplateRef over ng-content: @if + preserveWhitespaces breaks multi-slot projection.
   */
  @Input()
  cornerOverlayTemplate: TemplateRef<unknown> | null = null;

  /**
   * HUD scale for CSS panes #scales1 / #scales2.
   * Landscape: pane1=ρz (top), pane2=Rφ (bottom). Portrait: pane1=Rφ (left), pane2=ρz (right)
   * — matches WebGL blit viewports in `render()`.
   */
  scalePane1: SideViewScaleModel | null = null;
  scalePane2: SideViewScaleModel | null = null;
  /** Last Rφ / ρz zooms applied to the HUD — skip markForCheck when unchanged. */
  private lastSideViewScaleZoomRphi = Number.NaN;
  private lastSideViewScaleZoomRhoz = Number.NaN;

  constructor(
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
    private sideViewScale: SideViewScaleService
  ) {
    const lineParams = {
      linewidth: this.effectiveTrackWidth,
      resolution: new THREE.Vector2(1, 1),
      // Same depth stack as particle-propagation track-renderer (opaque fat lines).
      depthTest: true,
      depthWrite: true,
      transparent: false,
      opacity: 1,
    };
    this.trackMaterial = new LineMaterial({ color: EventDisplayComponent.trackColor, ...lineParams });
    this.postiveTrackMaterial = new LineMaterial({
      color: EventDisplayComponent.positiveTrackColor,
      ...lineParams,
      linewidth: this.trackDecayWidth,
    });
    this.negativeTrackMaterial = new LineMaterial({
      color: EventDisplayComponent.negativeTrackColor,
      ...lineParams,
      linewidth: this.trackDecayWidth,
    });
    this.bachelorTrackMaterial = new LineMaterial({
      color: EventDisplayComponent.bachelorTrackColor,
      ...lineParams,
      linewidth: this.trackDecayWidth,
    });
    this.highlightTrackMaterial = new LineMaterial({
      color: EventDisplayComponent.highlightColor,
      ...lineParams,
      linewidth: this.trackHighlightWidth,
    });
    this.pointsMaterial = new THREE.PointsMaterial({
      color: EventDisplayComponent.clusterColor,
      size: this.clusterSize,
      map: EventDisplayComponent.createCirclePointTexture(),
      transparent: true,
      alphaTest: 0.5,
      depthTest: false,
      sizeAttenuation: true,
    });
    // transparent:true puts hits in the transparent pass (drawn after opaque + detector shells).
    // toneMapped:false keeps fluorescent dots bright enough for UnrealBloom.
    const hitMatParams = {
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      transparent: true,
      opacity: 1,
    } as const;
    this.layerHitTrdMaterial = new THREE.MeshBasicMaterial({
      color: EventDisplayComponent.LAYER_HIT_COLOR_TRD,
      ...hitMatParams
    });
    this.layerHitTofMaterial = new THREE.MeshBasicMaterial({
      color: EventDisplayComponent.LAYER_HIT_COLOR_TOF,
      ...hitMatParams
    });
    this.caloBarGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.caloBarMaterial = new THREE.MeshStandardMaterial({
      color: EventDisplayComponent.caloBarColorLight,
      roughness: 0.45,
      metalness: 0.05,
      transparent: true,
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
      if (displayWidth <= 0 || displayHeight <= 0) {
        return;
      }
      const basePixelRatio = window.devicePixelRatio || 1;
      // Always full DPR — side views are cost-controlled by dirty-only full-res passes.
      if (Math.abs(this.renderer.getPixelRatio() - basePixelRatio) > 0.01) {
        this.renderer.setPixelRatio(basePixelRatio);
        this.composer?.setPixelRatio(basePixelRatio);
        force = true;
      }
      if (
        force ||
        this.lastDisplayWidth !== displayWidth ||
        this.lastDisplayHeight !== displayHeight
      ) {
        this.lastDisplayWidth = displayWidth;
        this.lastDisplayHeight = displayHeight;
        this.renderer.setSize(displayWidth, displayHeight);
        this.composer?.setSize(displayWidth, displayHeight);
        if (this.effectiveSideViewsShown) {
          this.invalidateSideViews();
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
        if (this.effectiveSideViewsShown) {
          this.syncSideViewScales(true);
        }
        this.requestRender();
      }
    }
  }

  /** Schedules a frame; no-ops while a RAF is already queued or the GL renderer is not ready. */
  private requestRender = (invalidateSideViews = false): void => {
    if (this.viewDestroyed) return;
    if (invalidateSideViews) {
      this.invalidateSideViews();
    }
    this.renderDirty = true;
    if (!this.renderer || this.rafPending) return;
    this.rafPending = true;
    this.rafId = requestAnimationFrame(() => {
      this.rafPending = false;
      this.rafId = null;
      if (this.viewDestroyed || !this.renderer) return;
      if (!this.renderDirty && !this.isRenderActivityPending()) return;
      this.renderDirty = false;
      this.render();
      if (this.renderDirty || this.isRenderActivityPending()) {
        this.requestRender();
      }
    });
  };

  /** True while input/animations still need continuous frames (OrbitControls damping uses 'change'). */
  private isRenderActivityPending(): boolean {
    if (this.isMousePanning) return true;
    if (this.cameraMode === 'free' && this.hasPanKeysDown()) return true;
    if (this.cascadeHoverStrength !== this.cascadeHoverTarget) return true;
    return false;
  }

  private hasPanKeysDown(): boolean {
    const k = this.keysDown;
    return !!(k['w'] || k['W'] || k['ArrowUp'] || k['s'] || k['S'] || k['ArrowDown'] ||
      k['a'] || k['A'] || k['ArrowLeft'] || k['d'] || k['D'] || k['ArrowRight'] ||
      k['q'] || k['Q'] || k['e'] || k['E']);
  }

  private onControlsChange = (): void => {
    this.maybeInvalidateSideViewsForZoom();
    this.syncSideViewScales();
    this.requestRender();
  };

  private onControlsStart = (): void => {
    this.sideViewControlsGesturing = true;
    this.requestRender();
  };

  private onControlsEnd = (): void => {
    this.sideViewControlsGesturing = false;
    if (this.effectiveSideViewsShown) {
      this.invalidateSideViews();
    }
    this.requestRender();
  };

  /** True when orbit distance moved enough vs the last completed side-view RT. */
  private sideViewDistanceChanged(distance: number): boolean {
    if (!Number.isFinite(distance)) return false;
    if (!Number.isFinite(this.lastSideViewCameraDistance)) return true;
    const ref = Math.max(Math.abs(this.lastSideViewCameraDistance), 1e-3);
    return Math.abs(distance - this.lastSideViewCameraDistance) / ref
      > EventDisplayComponent.SIDE_VIEW_ZOOM_EPS;
  }

  /**
   * During orbit zoom, mark side views dirty at most every SIDE_VIEW_ZOOM_THROTTLE_MS.
   * Pure rotation (unchanged distance) does not invalidate.
   */
  private maybeInvalidateSideViewsForZoom(): void {
    if (!this.effectiveSideViewsShown || !this.controls) return;
    const distance = this.controls.getDistance();
    if (!this.sideViewDistanceChanged(distance)) return;
    this.sideViewZoomPending = true;
    const now = performance.now();
    const throttleOk = !this.sideViewControlsGesturing
      || (now - this.lastSideViewRenderMs) >= EventDisplayComponent.SIDE_VIEW_ZOOM_THROTTLE_MS;
    if (throttleOk) {
      this.invalidateSideViews();
    }
  }

  /** Mark Rφ/ρz caches stale (content / layout / synced zoom). */
  private invalidateSideViews(): void {
    this.sideViewsDirty = true;
  }

  /** Full-res caches matching the side viewport in drawing-buffer pixels. */
  private ensureSideViewTargets(viewW: number, viewH: number): void {
    const tw = Math.max(1, Math.floor(viewW));
    const th = Math.max(1, Math.floor(viewH));
    const needsNew =
      !this.sideViewRphiRT ||
      !this.sideViewRhozRT ||
      this.sideViewRphiRT.width !== tw ||
      this.sideViewRphiRT.height !== th;
    if (needsNew) {
      this.disposeSideViewTargets();
      const rtOpts = {
        depthBuffer: true,
        stencilBuffer: false
      } as const;
      this.sideViewRphiRT = new THREE.WebGLRenderTarget(tw, th, rtOpts);
      this.sideViewRhozRT = new THREE.WebGLRenderTarget(tw, th, rtOpts);
      // Match canvas output so side-view backgrounds don't drift vs the main 3D pass.
      const outSpace = this.renderer.outputColorSpace ?? THREE.SRGBColorSpace;
      this.sideViewRphiRT.texture.colorSpace = outSpace;
      this.sideViewRhozRT.texture.colorSpace = outSpace;
      this.sideViewCacheValid = false;
      this.invalidateSideViews();
    }
    if (!this.sideViewBlitScene) {
      this.sideViewBlitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.sideViewBlitMaterial = new THREE.MeshBasicMaterial({
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      });
      this.sideViewBlitMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        this.sideViewBlitMaterial
      );
      this.sideViewBlitScene = new THREE.Scene();
      this.sideViewBlitScene.add(this.sideViewBlitMesh);
    }
  }

  private disposeSideViewTargets(): void {
    this.sideViewRphiRT?.dispose();
    this.sideViewRhozRT?.dispose();
    this.sideViewRphiRT = null;
    this.sideViewRhozRT = null;
    this.sideViewCacheValid = false;
  }

  private disposeSideViewBlit(): void {
    if (this.sideViewBlitMesh) {
      this.sideViewBlitMesh.geometry.dispose();
      this.sideViewBlitMesh = null;
    }
    this.sideViewBlitMaterial?.dispose();
    this.sideViewBlitMaterial = null;
    this.sideViewBlitScene = null;
    this.sideViewBlitCamera = null;
  }

  /** Blit a cached side-view texture into `vp` at 1:1 (fixed framing). */
  private blitSideViewRT(rt: THREE.WebGLRenderTarget, vp: THREE.Vector4): void {
    if (!this.sideViewBlitScene || !this.sideViewBlitCamera || !this.sideViewBlitMaterial) return;
    this.sideViewBlitMaterial.map = rt.texture;
    this.sideViewBlitMaterial.needsUpdate = true;
    this.renderer.setViewport(vp);
    this.renderer.setScissor(vp);
    // Clear with the same tone as the main 3D view so empty regions match exactly.
    this.renderer.setClearColor(this._backgroundColor, 1);
    this.renderer.clear(true, true, true);
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.render(this.sideViewBlitScene, this.sideViewBlitCamera);
    this.renderer.autoClear = prevAutoClear;
  }

  private renderSideViewToRT(
    camera: THREE.PerspectiveCamera,
    rt: THREE.WebGLRenderTarget,
    materials: any[]
  ): void {
    materials.forEach((m: any) => m.resolution?.set(rt.width, rt.height));
    const prevTarget = this.renderer.getRenderTarget();
    const prevClear = new THREE.Color();
    this.renderer.getClearColor(prevClear);
    const prevAlpha = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(this._backgroundColor, 1);
    this.renderer.clear();
    this.renderer.render(this.scene, camera);
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearColor(prevClear, prevAlpha);
  }

  /** Side views on/off: invalidate caches and fix layout. Main keeps full DPR + AA. */
  private syncSideViewResources(): void {
    if (!this.renderer || !this.canvas || !this.camera3D) return;
    if (!this.effectiveSideViewsShown) {
      this.disposeSideViewTargets();
    } else {
      this.invalidateSideViews();
    }
    this.resize(true);
    this.syncSideViewScales(true);
  }

  /**
   * CSS pixel X for a normalised tick (full viewport — matches WebGL NDC / camera aspect).
   * Label insets (`m.pad*`) are chrome only and must not enter this mapping.
   */
  sideScaleX(m: SideViewScaleModel, t: number): number {
    return t * m.viewportCssW;
  }

  /**
   * CSS pixel Y for a normalised tick (SVG y-down; t=0 → bottom / min metres).
   * Full viewport so px/m on Y equals px/m on X.
   */
  sideScaleY(m: SideViewScaleModel, t: number): number {
    return (1 - t) * m.viewportCssH;
  }

  /**
   * Refresh metre scale HUD overlays for Rφ / ρz from the live side-camera framing.
   * Math lives in SideViewScaleService; this only supplies camera + CSS pane size.
   */
  private syncSideViewScales(force = false): void {
    if (
      !this.effectiveSideViewsShown ||
      !this.cameraRphi ||
      !this.cameraRhoz ||
      !this.canvas
    ) {
      if (this.scalePane1 || this.scalePane2) {
        this.scalePane1 = null;
        this.scalePane2 = null;
        this.lastSideViewScaleZoomRphi = Number.NaN;
        this.lastSideViewScaleZoomRhoz = Number.NaN;
        this.cdr.markForCheck();
      }
      return;
    }
    const displayWidth = this.canvas.clientWidth;
    const displayHeight = this.canvas.clientHeight;
    if (displayWidth <= 0 || displayHeight <= 0) {
      return;
    }

    let cssW: number;
    let cssH: number;
    if (this.landscape) {
      const width3D = Math.ceil(displayWidth * this.PRIMARY_AXIS_RATIO);
      cssW = displayWidth - width3D;
      cssH = Math.ceil(displayHeight * this.SECONDARY_AXIS_RATIO);
    } else {
      cssW = Math.ceil(displayWidth * this.SECONDARY_AXIS_RATIO);
      const height3D = Math.ceil(displayHeight * this.PRIMARY_AXIS_RATIO);
      cssH = displayHeight - height3D;
    }
    if (cssW <= 0 || cssH <= 0) {
      return;
    }

    const distance = this.controls?.getDistance();
    const dist = Number.isFinite(distance) ? (distance as number) : Number.NaN;
    const zoomRphi = EventDisplayComponent.computeSideViewZoomFromDistance(
      dist,
      EventDisplayComponent.SIDE_VIEW_RPHI
    );
    const zoomRhoz = EventDisplayComponent.computeSideViewZoomFromDistance(
      dist,
      EventDisplayComponent.SIDE_VIEW_RHOZ
    );
    if (
      !force &&
      Number.isFinite(this.lastSideViewScaleZoomRphi) &&
      Number.isFinite(this.lastSideViewScaleZoomRhoz) &&
      Math.abs(zoomRphi - this.lastSideViewScaleZoomRphi) < 1e-6 &&
      Math.abs(zoomRhoz - this.lastSideViewScaleZoomRhoz) < 1e-6 &&
      this.scalePane1 &&
      this.scalePane2 &&
      this.scalePane1.viewportCssW === cssW &&
      this.scalePane1.viewportCssH === cssH
    ) {
      return;
    }

    const camDist = EventDisplayComponent.SIDE_CAMERA_DISTANCE;
    const rphiPlane = Math.max(
      0.5,
      camDist - EventDisplayComponent.SIDE_VIEW_RPHI_SCALE_DEPTH_M
    );
    // Variant B: ρz Z stays on the IP (length OK); Y plane scaled so TRD height → 7.36 m.
    const rhozPlaneY = Math.max(
      0.5,
      camDist *
        (EventDisplayComponent.SIDE_VIEW_TRD_HEIGHT_M /
          EventDisplayComponent.SIDE_VIEW_RHOZ_Y_OVERREAD_M)
    );
    const shared = {
      fovDeg: EventDisplayComponent.fieldOfView,
      aspect: cssW / cssH,
      cameraDistanceWu: camDist,
      objectScale: EventDisplayComponent.objectScale,
      viewportCssW: cssW,
      viewportCssH: cssH,
    };
    const rhoz = this.sideViewScale.compute({
      ...shared,
      zoom: zoomRhoz,
      axisKind: 'rhoz',
      scalePlaneDistanceXWu: camDist,
      scalePlaneDistanceYWu: rhozPlaneY,
    });
    const rphi = this.sideViewScale.compute({
      ...shared,
      zoom: zoomRphi,
      axisKind: 'rphi',
      scalePlaneDistanceWu: rphiPlane,
    });
    // Match blit layout: landscape top=ρz / bottom=Rφ; portrait left=Rφ / right=ρz.
    if (this.landscape) {
      this.scalePane1 = rhoz;
      this.scalePane2 = rphi;
    } else {
      this.scalePane1 = rphi;
      this.scalePane2 = rhoz;
    }
    this.lastSideViewScaleZoomRphi = zoomRphi;
    this.lastSideViewScaleZoomRhoz = zoomRhoz;
    this.cdr.markForCheck();
  }

  ngAfterViewInit(): void {
    this.createScene();
    if (this.controls) {
      this.controls.addEventListener('change', this.onControlsChange);
      this.controls.addEventListener('start', this.onControlsStart);
      this.controls.addEventListener('end', this.onControlsEnd);
    }
    const parent = this.canvas?.parentElement;
    if (parent && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize(false);
      });
      this.resizeObserver.observe(parent);
    }
    window.addEventListener('resize', this.onWindowResize);
    // Inputs may already enable side views before the canvas exists.
    this.syncSideViewResources();
    this.requestRender();
  }

  private onWindowResize = (): void => {
    this.resize(false);
  };

  ngOnDestroy(): void {
    this.viewDestroyed = true;
    this.assemblyCameraZoomGeneration++;
    this.clearCascadeHover();
    this.clearClickHighlight();
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.rafPending = false;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.onWindowResize);
    this.controls?.removeEventListener('change', this.onControlsChange);
    this.controls?.removeEventListener('start', this.onControlsStart);
    this.controls?.removeEventListener('end', this.onControlsEnd);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas?.removeEventListener('wheel', this.onWheel);
    this.clearGridBackground();
    this.clearCalorimeterReadouts();
    this.disposeSideViewTargets();
    this.disposeSideViewBlit();
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
    this.gridHelpers.forEach((g) => {
      EventDisplayComponent.assignMainOnlyLayer(g);
      this.scene.add(g);
    });
  }

  onCameraModeChange(): void {
    this.updateCameraMode();
    this.requestRender();
  }

  private updateCameraMode(): void {
    if (!this.controls) return;
    if (this.cameraMode === 'centered') {
      this.controls.enablePan = false;
      this.controls.enableRotate = true;
      this.controls.enableZoom = true;
      this.controls.target.set(0, 0, 0);
    } else {
      // Free look: custom WASD / drag / wheel fly. Disable OrbitControls
      // dolly so it does not fight the wheel handler (opposing directions).
      this.controls.enablePan = true;
      this.controls.enableRotate = false;
      this.controls.enableZoom = false;
    }
    this.isMousePanning = false;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
    this.keysDown[e.key] = true;
    this.requestRender();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysDown[e.key] = false;
  };

  private onWheel = (e: WheelEvent) => {
    if (this.cameraMode !== 'free' || !this.controls || !this.camera3D) return;
    e.preventDefault();
    // Fly along the look axis (same as WASD W/S): move camera and target
    // together so distance stays constant. Scroll up = forward.
    const distance = this.controls.target.distanceTo(this.camera3D.position);
    const step = (e.deltaY > 0 ? -1 : 1) * distance * EventDisplayComponent.WHEEL_PAN_FACTOR;
    this.panDir.subVectors(this.controls.target, this.camera3D.position).normalize();
    this.panVec.copy(this.panDir).multiplyScalar(step);
    this.camera3D.position.add(this.panVec);
    this.controls.target.add(this.panVec);
    this.requestRender();
  };

  private onPointerUp = () => {
    this.isMousePanning = false;
    this.requestRender();
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
    this.requestRender();
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
    if (!this.renderer || !this.camera3D || !this.controls) return;
    this.updateCascadeHoverFade();
    this.resize(false);
    if (this.cameraMode === 'centered') {
      this.controls.target.set(0, 0, 0);
    } else {
      this.applyKeyboardPan();
    }
    this.controls.update();
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
      // Full-res scene render into cache when content/layout/zoom dirty.
      this.ensureSideViewTargets(this.camRphiVP.z, this.camRphiVP.w);
      // Flush a throttled zoom refresh if the gesture kept pending past the interval.
      if (
        this.sideViewZoomPending &&
        !this.sideViewsDirty &&
        (performance.now() - this.lastSideViewRenderMs) >= EventDisplayComponent.SIDE_VIEW_ZOOM_THROTTLE_MS
      ) {
        this.invalidateSideViews();
      }
      if (this.sideViewsDirty && this.sideViewRphiRT && this.sideViewRhozRT) {
        this.sideViewsDirty = false;
        const distance = this.controls?.getDistance();
        const dist = Number.isFinite(distance) ? (distance as number) : Number.NaN;
        this.cameraRphi.zoom = EventDisplayComponent.computeSideViewZoomFromDistance(
          dist,
          EventDisplayComponent.SIDE_VIEW_RPHI
        );
        this.cameraRhoz.zoom = EventDisplayComponent.computeSideViewZoomFromDistance(
          dist,
          EventDisplayComponent.SIDE_VIEW_RHOZ
        );
        this.cameraRphi.updateProjectionMatrix();
        this.cameraRhoz.updateProjectionMatrix();
        const sideMaterials = [
          this.trackMaterial,
          this.postiveTrackMaterial,
          this.negativeTrackMaterial,
          this.bachelorTrackMaterial,
          this.highlightTrackMaterial
        ];
        const snap = this.captureDetectorPartRenderState();
        try {
          this.applySideViewDetectorMask(EventDisplayComponent.SIDE_VIEW_RPHI);
          this.renderSideViewToRT(this.cameraRphi, this.sideViewRphiRT, sideMaterials);
          this.applySideViewDetectorMask(EventDisplayComponent.SIDE_VIEW_RHOZ);
          this.renderSideViewToRT(this.cameraRhoz, this.sideViewRhozRT, sideMaterials);
        } finally {
          this.restoreDetectorPartRenderState(snap);
        }
        this.sideViewCacheValid = true;
        this.lastSideViewRenderMs = performance.now();
        this.lastSideViewCameraDistance = Number.isFinite(distance) ? (distance as number) : Number.NaN;
        this.sideViewZoomPending = false;
      }
      this.renderMainView();
      if (this.sideViewCacheValid && this.sideViewRphiRT && this.sideViewRhozRT) {
        this.blitSideViewRT(this.sideViewRphiRT, this.camRphiVP);
        this.blitSideViewRT(this.sideViewRhozRT, this.camRhozVP);
      }
    } else {
      this.cam3DVP.set(oldVP.x, oldVP.y, oldVP.z, oldVP.w);
      this.renderMainView();
    }
    this.renderer.setViewport(oldVP);
    this.renderer.setScissor(oldVP);
  }

  /**
   * Main 3D pass (optionally with bloom). Viewport/scissor must already match cam3DVP
   * when side views are on so the side regions are not cleared.
   */
  private renderMainView(): void {
    this.renderer.setViewport(this.cam3DVP);
    this.renderer.setScissor(this.cam3DVP);
    const materials = [
      this.trackMaterial,
      this.postiveTrackMaterial,
      this.negativeTrackMaterial,
      this.bachelorTrackMaterial,
      this.highlightTrackMaterial
    ];
    materials.forEach((m: any) => m.resolution?.set(this.cam3DVP.z, this.cam3DVP.w));
    if (this.bloomPass?.enabled && this.composer) {
      const pr = this.renderer.getPixelRatio() || 1;
      const cssW = Math.max(1, this.cam3DVP.z / pr);
      const cssH = Math.max(1, this.cam3DVP.w / pr);
      if (
        Math.abs(this.composerMainCssW - cssW) > 0.5 ||
        Math.abs(this.composerMainCssH - cssH) > 0.5
      ) {
        this.composer.setSize(cssW, cssH);
        this.composerMainCssW = cssW;
        this.composerMainCssH = cssH;
      }
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera3D);
    }
  }

  onPointerDown(event: PointerEvent) {
    if (this.cameraMode === 'free' && event.button === 0) {
      this.isMousePanning = true;
      this.lastMousePanX = event.clientX;
      this.lastMousePanY = event.clientY;
      this.requestRender();
      return;
    }
    const intersects = this.findIntersect(event);
    if (intersects.length === 0) return;
    const obj = intersects[0].object as THREE.Mesh & {
      userData?: { vertexLabel?: string; vertexLabelKey?: string; isDecayTrack?: boolean };
    };
    const markerLabel = this.resolveMarkerLabel(obj.userData);
    if (markerLabel) {
      return;
    }
    if (this.desiredDecaysShown && this.decays.visible) {
      const line = obj as unknown as Line2;
      if (
        (line as any).isLine2 &&
        !!obj.userData?.isDecayTrack &&
        obj.parent?.parent === this.decays
      ) {
        // Restore scene opacity, lock hover-fade briefly so moving off the
        // clicked track does not immediately dim the detector again.
        this.cascadeHoverLockedUntil =
          performance.now() + EventDisplayComponent.CASCADE_HOVER_POST_CLICK_LOCK_MS;
        this.beginCascadeHoverFadeOut();
        this.beginClickHighlight(line);
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
      this.setDecayHoverCursor(false);
      return;
    }
    // Click flash owns the material briefly — skip hover bookkeeping.
    if (this.clickHighlightLine !== null) {
      this.vertexMarkerTooltip = null;
      this.setDecayHoverCursor(false);
      return;
    }
    if (performance.now() < this.cascadeHoverLockedUntil) {
      this.vertexMarkerTooltip = null;
      this.scheduleCascadeHoverClear();
      this.setDecayHoverCursor(false);
      return;
    }
    const intersects = this.findIntersect(event);
    const first = intersects[0]?.object as THREE.Mesh & {
      userData?: { vertexLabel?: string; vertexLabelKey?: string; decayIndex?: number; isDecayTrack?: boolean };
    };
    const raycastLabel = this.resolveMarkerLabel(first?.userData);
    const isMarkerByRaycast = !!raycastLabel;
    const markerByProximity = !isMarkerByRaycast ? this.findMarkerByProximity(event) : null;
    const isMarker = isMarkerByRaycast || markerByProximity != null;
    const isDecayTrackHit = !!first?.userData?.isDecayTrack;

    if (isMarker) {
      this.vertexMarkerTooltip = {
        label: isMarkerByRaycast ? raycastLabel : markerByProximity.label,
        x: event.clientX,
        y: event.clientY
      };
      this.scheduleCascadeHoverClear();
      this.setDecayHoverCursor(false);
    } else if (isDecayTrackHit) {
      this.vertexMarkerTooltip = null;
      const obj = intersects[0]?.object as THREE.Object3D & { userData?: { isDecayTrack?: boolean } };
      const isDecayLine =
        this.desiredDecaysShown &&
        this.decays.visible &&
        !!obj &&
        !!(obj as any).isLine2 &&
        !!obj.userData?.isDecayTrack &&
        obj.parent?.parent === this.decays;
      if (isDecayLine) {
        this.applyCascadeHover();
        this.setDecayHoverCursor(true);
      } else {
        this.scheduleCascadeHoverClear();
        this.setDecayHoverCursor(false);
      }
    } else {
      this.vertexMarkerTooltip = null;
      this.scheduleCascadeHoverClear();
      this.setDecayHoverCursor(false);
    }
  }

  onPointerLeave() {
    this.isMousePanning = false;
    this.vertexMarkerTooltip = null;
    this.scheduleCascadeHoverClear();
    this.setDecayHoverCursor(false);
  }

  /** Pointer cursor on clickable decay tracks (CSS `grab` otherwise). */
  private setDecayHoverCursor(active: boolean): void {
    const el = this.canvas ?? this.renderer?.domElement;
    if (!el) {
      return;
    }
    el.style.cursor = active ? 'pointer' : '';
  }

  private findDecayGroupByIndex(decayIndex: number | undefined | null): THREE.Object3D | null {
    if (
      decayIndex === undefined ||
      decayIndex === null ||
      !this.desiredDecaysShown ||
      !this.decays.visible
    ) {
      return null;
    }
    for (const child of this.decays.children) {
      if ((child as any).userData?.decayIndex === decayIndex) {
        return child;
      }
    }
    return null;
  }

  /** Soft fade of detector / tracks / clusters (no yellow on hover). */
  private applyCascadeHover(): void {
    this.cancelCascadeHoverLeaveDebounce();
    this.cascadeHoverLerpMs = EventDisplayComponent.CASCADE_HOVER_LERP_IN_MS;
    this.cascadeHoverTarget = 1;
    this.cascadeHoverActive = true;
    this.requestRender(true);
  }

  /** Start leave fade (20ms). Used on pointer leave and after click. */
  private beginCascadeHoverFadeOut(): void {
    this.cancelCascadeHoverLeaveDebounce();
    if (
      !this.cascadeHoverActive &&
      this.cascadeHoverStrength <= 0 &&
      this.cascadeHoverTarget <= 0
    ) {
      this.cascadeHoverLerpMs = EventDisplayComponent.CASCADE_HOVER_LERP_IN_MS;
      return;
    }
    this.cascadeHoverLerpMs = EventDisplayComponent.CASCADE_HOVER_LERP_OUT_MS;
    this.cascadeHoverTarget = 0;
    this.cascadeHoverLastTs = null;
    this.cascadeHoverActive = true;
    this.requestRender(true);
  }

  /** Debounced leave — brief raycast misses do not snap the scene back. */
  private scheduleCascadeHoverClear(): void {
    if (
      !this.cascadeHoverActive &&
      this.cascadeHoverStrength === 0 &&
      this.cascadeHoverTarget === 0
    ) {
      return;
    }
    if (this.cascadeHoverLeaveTimer != null) {
      return;
    }
    this.cascadeHoverLeaveTimer = setTimeout(() => {
      this.cascadeHoverLeaveTimer = null;
      this.beginCascadeHoverFadeOut();
    }, EventDisplayComponent.CASCADE_HOVER_LEAVE_DEBOUNCE_MS);
  }

  private cancelCascadeHoverLeaveDebounce(): void {
    if (this.cascadeHoverLeaveTimer != null) {
      clearTimeout(this.cascadeHoverLeaveTimer);
      this.cascadeHoverLeaveTimer = null;
    }
  }

  /** Instant restore (event rebuild, teardown). */
  private clearCascadeHover() {
    this.cancelCascadeHoverLeaveDebounce();
    const hadHover = !!(
      this.cascadeHoverActive ||
      this.cascadeHoverStrength > 0 ||
      this.cascadeHoverTarget > 0
    );
    this.cascadeHoverTarget = 0;
    this.cascadeHoverStrength = 0;
    this.cascadeHoverLastTs = null;
    this.cascadeHoverLerpMs = EventDisplayComponent.CASCADE_HOVER_LERP_IN_MS;
    this.resetCascadeHoverSharedMaterials();
    this.cascadeHoverActive = false;
    if (hadHover) {
      this.requestRender(true);
    }
  }

  private updateCascadeHoverFade(): void {
    if (this.cascadeHoverStrength === this.cascadeHoverTarget) {
      this.cascadeHoverLastTs = null;
      return;
    }
    const now = performance.now();
    let dt: number;
    if (this.cascadeHoverLastTs == null) {
      dt = Math.min(1000 / 60, this.cascadeHoverLerpMs * 0.2);
    } else {
      dt = Math.min(64, Math.max(0, now - this.cascadeHoverLastTs));
    }
    this.cascadeHoverLastTs = now;
    const step = dt / this.cascadeHoverLerpMs;
    if (this.cascadeHoverStrength < this.cascadeHoverTarget) {
      this.cascadeHoverStrength = Math.min(this.cascadeHoverTarget, this.cascadeHoverStrength + step);
    } else {
      this.cascadeHoverStrength = Math.max(this.cascadeHoverTarget, this.cascadeHoverStrength - step);
    }
    this.applyCascadeHoverFadeVisuals(this.cascadeHoverStrength);
    this.invalidateSideViews();
    if (this.cascadeHoverStrength <= 0 && this.cascadeHoverTarget <= 0) {
      this.finalizeCascadeHoverOff();
    }
  }

  private applyCascadeHoverFadeVisuals(t: number): void {
    const fade = EventDisplayComponent.CASCADE_HOVER_FADE_OPACITY;
    const trackOpacity = 1 + (fade - 1) * t;
    for (const mat of this.getCascadeFadeTrackMaterials()) {
      (mat as any).transparent = trackOpacity < 0.995;
      (mat as any).opacity = trackOpacity;
    }

    if (this.pointsMaterial) {
      const clusterOpacity = 1 + (fade - 1) * t;
      (this.pointsMaterial as any).transparent = true;
      (this.pointsMaterial as any).opacity = clusterOpacity;
      (this.pointsMaterial as any).alphaTest =
        t > 0
          ? Math.min(this.clusterAlphaTestBase, clusterOpacity * 0.45)
          : this.clusterAlphaTestBase;
    }

    this.getDetectorFadeRoot()?.traverse((o: THREE.Object3D) => {
      if (!(o as any).isMesh) return;
      const raw = (o as THREE.Mesh).material;
      const mats: THREE.Material[] = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      for (const m of mats) {
        if (!m) continue;
        const base =
          (m as any).userData?.baseOpacity ?? EventDisplayComponent.DETECTOR_COMPONENT_OPACITY;
        const opacity = base + (fade - base) * t;
        (m as any).opacity = opacity;
        (m as any).transparent = opacity < 0.995;
      }
    });
  }

  private finalizeCascadeHoverOff(): void {
    this.resetCascadeHoverSharedMaterials();
    this.cascadeHoverActive = false;
    this.cascadeHoverLastTs = null;
    this.cascadeHoverLerpMs = EventDisplayComponent.CASCADE_HOVER_LERP_IN_MS;
  }

  private resetCascadeHoverSharedMaterials(): void {
    for (const mat of this.getCascadeFadeTrackMaterials()) {
      (mat as any).transparent = false;
      (mat as any).opacity = 1;
    }
    if (this.pointsMaterial) {
      (this.pointsMaterial as any).opacity = 1;
      (this.pointsMaterial as any).transparent = true;
      (this.pointsMaterial as any).alphaTest = this.clusterAlphaTestBase;
    }
    this.applyDesiredPhysicsVisibility();
    this.getDetectorFadeRoot()?.traverse((o: THREE.Object3D) => {
      if (!(o as any).isMesh) return;
      const raw = (o as THREE.Mesh).material;
      const mats: THREE.Material[] = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      for (const m of mats) {
        if (!m) continue;
        const baseOpacity =
          (m as any).userData?.baseOpacity ?? EventDisplayComponent.DETECTOR_COMPONENT_OPACITY;
        (m as any).opacity = baseOpacity;
        (m as any).transparent = baseOpacity < 0.995;
      }
    });
  }

  /** Brief gold flash so the user sees the click register. */
  private beginClickHighlight(line: Line2): void {
    this.clearClickHighlight();
    const current = line.material as LineMaterial;
    this.clickHighlightOrigMaterial =
      current && current !== this.highlightTrackMaterial
        ? current
        : (this.sharedMaterialForDecayLine(line) as LineMaterial);
    line.material = this.highlightTrackMaterial as LineMaterial;
    this.clickHighlightLine = line;
    this.clickHighlightTimer = setTimeout(() => {
      this.clickHighlightTimer = null;
      this.finishClickHighlight();
    }, this.CLICK_HIGHLIGHT_DURATION);
    this.requestRender(true);
  }

  private finishClickHighlight(): void {
    const line = this.clickHighlightLine;
    const orig = this.clickHighlightOrigMaterial;
    this.clickHighlightLine = null;
    this.clickHighlightOrigMaterial = null;
    if (!line || !(line as any).isLine2) {
      return;
    }
    if (line.material === this.highlightTrackMaterial && orig) {
      line.material = orig as LineMaterial;
    }
    this.requestRender(true);
  }

  private clearClickHighlight(): void {
    if (this.clickHighlightTimer != null) {
      clearTimeout(this.clickHighlightTimer);
      this.clickHighlightTimer = null;
    }
    if (this.clickHighlightLine != null) {
      this.finishClickHighlight();
    }
  }

  /**
   * Material for a V0/cascade daughter: decay colors when the Decays toggle is
   * on, otherwise the same color as ordinary tracks.
   */
  private materialForDecayTrack(track: {
    type?: TrackType | number;
    sign?: number;
  }): THREE.Material {
    if (!this.desiredDecaysShown) {
      return this.trackMaterial;
    }
    if (track.type === TrackType.CASCADE_BACHELOR) {
      return this.bachelorTrackMaterial;
    }
    if (typeof track.sign === 'number' && track.sign < 0) {
      return this.negativeTrackMaterial;
    }
    if (typeof track.sign === 'number' && track.sign > 0) {
      return this.postiveTrackMaterial;
    }
    return this.trackMaterial;
  }

  /** Shared decay material for a track line (used if click restore data is corrupt). */
  private sharedMaterialForDecayLine(line: Line2): THREE.Material {
    return this.materialForDecayTrack((line as any).userData || {});
  }

  /** Recolor existing decay lines when the Decays highlight toggle changes. */
  private applyDecayTrackMaterials(): void {
    for (const decayObject of this.decays.children) {
      for (const child of decayObject.children) {
        if (!(child as any).isLine2) {
          continue;
        }
        const line = child as Line2;
        const material = this.sharedMaterialForDecayLine(line) as LineMaterial;
        if (line === this.clickHighlightLine) {
          this.clickHighlightOrigMaterial = material;
          continue;
        }
        line.material = material;
      }
    }
  }

  /** Shared track materials faded during cascade hover. */
  private getCascadeFadeTrackMaterials(): THREE.Material[] {
    return [
      this.trackMaterial,
      this.postiveTrackMaterial,
      this.negativeTrackMaterial,
      this.bachelorTrackMaterial,
    ].filter((m): m is THREE.Material => !!m);
  }

  /** Detector group to fade during cascade hover (assembly may leave detectorScene unset). */
  private getDetectorFadeRoot(): THREE.Object3D | null {
    return this.detectorScene ?? (this.detector.children.length > 0 ? this.detector : null);
  }

  private findMarkerByProximity(event: MouseEvent): { label: string } | null {
    const markers = [
      ...this.primaryVertexMarkers.children,
      ...this.layerHitMarkers.children
    ];
    if (markers.length === 0) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = rect.height - (event.clientY - rect.top);
    const maxDist = EventDisplayComponent.MARKER_PROXIMITY_PX * EventDisplayComponent.MARKER_PROXIMITY_PX;
    let closest: { label: string; dist: number } | null = null;
    // Side views are display-only — picking only on the main 3D viewport.
    const viewports = [{ view: this.cam3DVP, cam: this.camera3D }];
    const v = new THREE.Vector3();
    for (const { view, cam } of viewports) {
      const ndcX = (cursorX - view.x) / view.z;
      const ndcY = (cursorY - view.y) / view.w;
      if (ndcX < 0 || ndcX > 1 || ndcY < 0 || ndcY > 1) continue;
      for (const marker of markers) {
        marker.getWorldPosition(v);
        v.project(cam);
        const sx = (v.x * 0.5 + 0.5) * view.z + view.x;
        const sy = (v.y * 0.5 + 0.5) * view.w + view.y;
        const dx = cursorX - sx;
        const dy = cursorY - sy;
        const d = dx * dx + dy * dy;
        if (d < maxDist && (closest == null || d < closest.dist)) {
          const label = this.resolveMarkerLabel((marker as any).userData);
          if (label) {
            closest = {
              label,
              dist: d
            };
          }
        }
      }
    }
    return closest ? { label: closest.label } : null;
  }

  private findIntersect(event: MouseEvent): THREE.Intersection[] {
    const intersects: THREE.Intersection[] = [];
    const zoomz = this.controls.target.distanceTo(this.controls.object.position);
    // Larger than the visual linewidth so decay tracks are easier to hover/click.
    const lineThreshold = zoomz / 2;
    const raycaster = new THREE.Raycaster();
    if (!raycaster.params.Line2) {
      raycaster.params.Line2 = { threshold: lineThreshold };
    } else {
      raycaster.params.Line2.threshold = lineThreshold;
    }
    (raycaster.params as any).Line = (raycaster.params as any).Line || { threshold: lineThreshold };
    (raycaster.params as any).Line.threshold = lineThreshold;
    const windowOffset = this.renderer.domElement.getBoundingClientRect();
    const viewportclick = new THREE.Vector2(
      event.clientX - windowOffset.left,
      -(event.clientY - windowOffset.top) + this.renderer.domElement.clientHeight
    );
    // Side views are display-only — track/marker picks only on main 3D.
    const viewports: { view: THREE.Vector4; cam: THREE.Camera }[] = [
      { view: this.cam3DVP, cam: this.camera3D }
    ];
    for (let v of viewports) {
      const vp = v.view;
      const cam = v.cam;
      const ndcpos = new THREE.Vector2(
        ((viewportclick.x - vp.x) / vp.z - 0.5) * 2,
        ((viewportclick.y - vp.y) / vp.w - 0.5) * 2
      );
      if (ndcpos.x < -1 || ndcpos.x > 1 || ndcpos.y < -1 || ndcpos.y > 1) continue;
      raycaster.setFromCamera(ndcpos, cam);
      if (this.desiredDecaysShown && this.decays.children.length > 0) {
        intersects.push(...raycaster.intersectObjects(this.decays.children, true));
      }
      if (this.primaryVertexMarkers.children.length > 0) {
        intersects.push(...raycaster.intersectObjects(this.primaryVertexMarkers.children, false));
      }
      if (this.layerHitMarkers.children.length > 0) {
        intersects.push(...raycaster.intersectObjects(this.layerHitMarkers.children, true));
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
    const startCam = this.detectorMultipartAssemblyMode && !this._detectorInteractiveAssemblyDone
      ? EventDisplayComponent.CAMERA_3D_ASSEMBLY_START
      : EventDisplayComponent.CAMERA_3D_OVERVIEW;
    this.camera3D.position.set(startCam.x, startCam.y, startCam.z);
    this.camera3D.up.set(0.0, 1.0, 0.0);
    // Main sees shared + main-only; Rφ/ρz stay on LAYER_SHARED (default layer 0).
    this.camera3D.layers.enable(EventDisplayComponent.LAYER_MAIN_ONLY);
    this.cameraRphi = new THREE.PerspectiveCamera(
      EventDisplayComponent.fieldOfView,
      this.aspectRatio,
      EventDisplayComponent.nearClippingPlane,
      EventDisplayComponent.farClippingPlane
    );
    this.cameraRphi.position.set(0.0, 0.0, EventDisplayComponent.SIDE_CAMERA_DISTANCE);
    this.cameraRphi.up.set(0.0, 1.0, 0.0);
    this.cameraRphi.lookAt(new THREE.Vector3(0, 0, 0));
    this.cameraRphi.zoom = EventDisplayComponent.computeSideViewZoomFromDistance(
      EventDisplayComponent.CAMERA_3D_OVERVIEW.z,
      EventDisplayComponent.SIDE_VIEW_RPHI
    );
    this.cameraRphi.updateProjectionMatrix();
    this.cameraRphi.layers.set(EventDisplayComponent.LAYER_SHARED);
    this.cameraRhoz = new THREE.PerspectiveCamera(
      EventDisplayComponent.fieldOfView,
      this.aspectRatio,
      EventDisplayComponent.nearClippingPlane,
      EventDisplayComponent.farClippingPlane
    );
    this.cameraRhoz.position.set(-EventDisplayComponent.SIDE_CAMERA_DISTANCE, 0.0, 0.0);
    this.cameraRhoz.up.set(0.0, 1.0, 0.0);
    this.cameraRhoz.lookAt(new THREE.Vector3(0, 0, 0));
    this.cameraRhoz.zoom = EventDisplayComponent.computeSideViewZoomFromDistance(
      EventDisplayComponent.CAMERA_3D_OVERVIEW.z,
      EventDisplayComponent.SIDE_VIEW_RHOZ
    );
    this.cameraRhoz.updateProjectionMatrix();
    this.cameraRhoz.layers.set(EventDisplayComponent.LAYER_SHARED);
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
    this.ambientLight = new THREE.AmbientLight(0xa2a2a2, 0.925);
    this.lights.add(this.ambientLight);
    this.hemisphereLight = new THREE.HemisphereLight(0xd5dff4, 0x81838b, 0.7);
    this.lights.add(this.hemisphereLight);
    this.directionalLightA = new THREE.DirectionalLight(0xffffff, 0.5);
    this.directionalLightA.position.set(1.0, 1.0, 1.0);
    this.lights.add(this.directionalLightA);
    this.directionalLightB = new THREE.DirectionalLight(0xffffff, 0.5);
    this.directionalLightB.position.set(-1.0, 1.0, -1.0);
    this.lights.add(this.directionalLightB);
    this.syncSceneLighting();
    const axesHelper = new THREE.AxesHelper(5);
    this.axes.add(axesHelper);
    this.axes.visible = false;
    this.scene.add(this.axes);
    this.scene.add(this.lights);
    this.syncGridBackground();
    this.scene.add(this.detector);
    this.scene.add(this.tracks);
    this.scene.add(this.primaryVertexMarkers);
    this.layerHitMarkers.renderOrder = EventDisplayComponent.LAYER_HIT_RENDER_ORDER;
    this.scene.add(this.layerHitMarkers);
    this.scene.add(this.clusters);
    this.calorimeterReadouts.renderOrder = EventDisplayComponent.CALO_BAR_RENDER_ORDER;
    this.scene.add(this.calorimeterReadouts);
    this.scene.add(this.decays);
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
