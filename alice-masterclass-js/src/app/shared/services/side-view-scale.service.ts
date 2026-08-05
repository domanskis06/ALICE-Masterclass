import { Injectable } from '@angular/core';

/** Which side-view projection maps world axes to the HUD. */
export type SideViewAxisKind = 'rphi' | 'rhoz';

export interface SideViewScaleTick {
  /** Physical coordinate in metres. */
  valueM: number;
  /** Normalised position along the axis (0 = left/bottom, 1 = right/top). */
  t: number;
  label: string;
}

export interface SideViewScaleBar {
  /** Bar length in CSS pixels within the plot area. */
  lengthPx: number;
  lengthM: number;
  label: string;
}

export interface SideViewScaleModel {
  xMinM: number;
  xMaxM: number;
  yMinM: number;
  yMaxM: number;
  xTicks: SideViewScaleTick[];
  yTicks: SideViewScaleTick[];
  /** Short axis name shown near the scale (Rφ: x/y, ρz: z/y). */
  xAxisLabel: string;
  yAxisLabel: string;
  scaleBar: SideViewScaleBar;
  /**
   * Label / chrome inset only (not part of the metre mapping).
   * Tick positions use the full viewport so px/m matches the WebGL camera (isotropic).
   */
  padTop: number;
  padRight: number;
  padBottom: number;
  padLeft: number;
  viewportCssW: number;
  viewportCssH: number;
}

export interface SideViewScaleInput {
  fovDeg: number;
  aspect: number;
  zoom: number;
  /** Distance from camera to look-at origin in world units. */
  cameraDistanceWu: number;
  /**
   * Distance from camera to the plane used for metre labels (world units).
   * Defaults to {@link cameraDistanceWu} (origin). Applied to both axes unless
   * {@link scalePlaneDistanceXWu} / {@link scalePlaneDistanceYWu} override.
   */
  scalePlaneDistanceWu?: number;
  /** Optional horizontal-axis (plot X) scale-plane distance; defaults as above. */
  scalePlaneDistanceXWu?: number;
  /** Optional vertical-axis (plot Y) scale-plane distance; defaults as above. */
  scalePlaneDistanceYWu?: number;
  /**
   * Scene scale: physics_cm * objectScale = world units (EventDisplay: 1e-2).
   * With that convention 1 world unit = 1 metre.
   */
  objectScale: number;
  axisKind: SideViewAxisKind;
  viewportCssW: number;
  viewportCssH: number;
}

/** Nice steps in metres (detector-scale down to ITS close-ups). */
const NICE_STEPS_M = [
  0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50,
];

@Injectable({ providedIn: 'root' })
export class SideViewScaleService {
  /**
   * Equal label margins (chrome only). Metric mapping uses the full CSS viewport
   * so px/m on X equals px/m on Y and matches the side-camera aspect.
   */
  static readonly LABEL_INSET = 14;
  /** physics cm → metres (objectScale maps cm → world units ≡ metres). */
  static readonly CM_PER_M = 100;

  /**
   * Visible half-extents (metres) for a perspective side camera.
   * halfH = tan(fov/2) * planeY / zoom; halfW = tan(fov/2) * planeX / zoom * aspect.
   * Per-axis planes allow ρz (View 1) to keep Z at the IP while correcting Y for TRD height.
   */
  visibleHalfExtentsM(input: Pick<
    SideViewScaleInput,
    | 'fovDeg'
    | 'aspect'
    | 'zoom'
    | 'cameraDistanceWu'
    | 'scalePlaneDistanceWu'
    | 'scalePlaneDistanceXWu'
    | 'scalePlaneDistanceYWu'
    | 'objectScale'
  >): { halfWM: number; halfHM: number } {
    const zoom = Number.isFinite(input.zoom) && input.zoom > 0 ? input.zoom : 1;
    const cameraDistance =
      Number.isFinite(input.cameraDistanceWu) && input.cameraDistanceWu > 0
        ? input.cameraDistanceWu
        : 10;
    const sharedPlane =
      Number.isFinite(input.scalePlaneDistanceWu) &&
      (input.scalePlaneDistanceWu as number) > 0
        ? (input.scalePlaneDistanceWu as number)
        : cameraDistance;
    const planeX =
      Number.isFinite(input.scalePlaneDistanceXWu) &&
      (input.scalePlaneDistanceXWu as number) > 0
        ? (input.scalePlaneDistanceXWu as number)
        : sharedPlane;
    const planeY =
      Number.isFinite(input.scalePlaneDistanceYWu) &&
      (input.scalePlaneDistanceYWu as number) > 0
        ? (input.scalePlaneDistanceYWu as number)
        : sharedPlane;
    const objectScale =
      Number.isFinite(input.objectScale) && input.objectScale > 0
        ? input.objectScale
        : 1e-2;
    const aspect = Number.isFinite(input.aspect) && input.aspect > 0 ? input.aspect : 1;
    const fovRad = ((Number.isFinite(input.fovDeg) ? input.fovDeg : 70) * Math.PI) / 180;
    const tanHalf = Math.tan(fovRad / 2);
    const halfHWu = tanHalf * planeY / zoom;
    const halfWWu = tanHalf * planeX / zoom * aspect;
    // wu / objectScale → cm; / 100 → m. With objectScale=1e-2, 1 wu = 1 m.
    const wuToM = 1 / (objectScale * SideViewScaleService.CM_PER_M);
    return {
      halfWM: halfWWu * wuToM,
      halfHM: halfHWu * wuToM,
    };
  }

  /** Pick a “nice” tick step (m) for the given full-axis span. */
  niceStepM(spanM: number, targetTicks = 5): number {
    const span = Math.max(Math.abs(spanM), 1e-9);
    const rough = span / Math.max(targetTicks, 2);
    let best = NICE_STEPS_M[NICE_STEPS_M.length - 1];
    for (const step of NICE_STEPS_M) {
      if (step >= rough) {
        best = step;
        break;
      }
    }
    return best;
  }

  /** Nice scale-bar length in m (~22% of the visible width). */
  niceScaleBarM(halfWM: number): number {
    const target = Math.max(halfWM * 2 * 0.22, NICE_STEPS_M[0]);
    let best = NICE_STEPS_M[0];
    for (const step of NICE_STEPS_M) {
      if (step <= target) {
        best = step;
      } else {
        break;
      }
    }
    return best;
  }

  compute(input: SideViewScaleInput): SideViewScaleModel {
    const { halfWM, halfHM } = this.visibleHalfExtentsM(input);
    const xMinM = -halfWM;
    const xMaxM = halfWM;
    const yMinM = -halfHM;
    const yMaxM = halfHM;

    const inset = SideViewScaleService.LABEL_INSET;
    const xStep = this.niceStepM(halfWM * 2, 5);
    const yStep = this.niceStepM(halfHM * 2, 5);
    const xTicks = this.buildTicks(xMinM, xMaxM, xStep);
    const yTicks = this.buildTicks(yMinM, yMaxM, yStep);

    // Scale bar length against the full viewport width (same mapping as tick X).
    const barM = this.niceScaleBarM(halfWM);
    const lengthPx = (barM / (halfWM * 2)) * Math.max(input.viewportCssW, 1);

    const rphi = input.axisKind === 'rphi';
    return {
      xMinM,
      xMaxM,
      yMinM,
      yMaxM,
      xTicks,
      yTicks,
      xAxisLabel: rphi ? 'x' : 'z',
      yAxisLabel: 'y',
      scaleBar: {
        lengthPx,
        lengthM: barM,
        label: `${this.formatTick(barM)} m`,
      },
      padTop: inset,
      padRight: inset,
      padBottom: inset,
      padLeft: inset,
      viewportCssW: input.viewportCssW,
      viewportCssH: input.viewportCssH,
    };
  }

  /**
   * Metres per CSS pixel on each axis for a computed model.
   * With full-viewport tick mapping these must be equal (isotropic HUD).
   */
  metresPerPixel(model: SideViewScaleModel): { x: number; y: number } {
    const spanX = model.xMaxM - model.xMinM;
    const spanY = model.yMaxM - model.yMinM;
    return {
      x: spanX / Math.max(model.viewportCssW, 1),
      y: spanY / Math.max(model.viewportCssH, 1),
    };
  }

  private buildTicks(minM: number, maxM: number, stepM: number): SideViewScaleTick[] {
    const span = maxM - minM;
    if (!(span > 0) || !(stepM > 0)) {
      return [];
    }
    const start = Math.ceil(minM / stepM - 1e-12) * stepM;
    const ticks: SideViewScaleTick[] = [];
    const end = maxM + stepM * 1e-9;
    for (let v = start; v <= end; v += stepM) {
      const valueM = Math.abs(v) < stepM * 1e-9 ? 0 : v;
      const t = (valueM - minM) / span;
      if (t < -0.01 || t > 1.01) {
        continue;
      }
      ticks.push({
        valueM,
        t: Math.min(1, Math.max(0, t)),
        label: this.formatTick(valueM),
      });
      if (ticks.length > 24) {
        break;
      }
    }
    return ticks;
  }

  private formatTick(valueM: number): string {
    if (Object.is(valueM, -0) || Math.abs(valueM) < 1e-12) {
      return '0';
    }
    const abs = Math.abs(valueM);
    if (abs >= 10 || Number.isInteger(valueM)) {
      return String(Math.round(valueM));
    }
    if (abs >= 1) {
      return String(Number(valueM.toFixed(1)));
    }
    if (abs >= 0.1) {
      return String(Number(valueM.toFixed(2)));
    }
    return String(Number(valueM.toFixed(2)));
  }
}
