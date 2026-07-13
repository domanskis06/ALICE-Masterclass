/**
 * Algorithmic EMCal/DCal readout grid from measured World-Space geometry.
 * Linear values are in the same units as the detector GLBs (pre `objectScale`).
 */

export type CalorimeterDetectorId = 'emcal' | 'dcal';

export interface CaloPanelSpec {
  /** Cells along azimuth (φ) within this panel. */
  cellsPhi: number;
  /** Cells along the beam (z). */
  cellsZ: number;
}

/**
 * 6 plates on the EMCal arc, seams parallel to Z (side-by-side in φ):
 * five dense 12×48 supermodules + one narrow 4×48 strip.
 * Absolute Blender R/φ are reference for cell counts & ratios; scene placement
 * is anchored to the loaded EMCal mesh (see EventDisplay buildCalorimeterCellLayoutOnEmcal).
 */
export const CALO_PANELS: readonly CaloPanelSpec[] = [
  { cellsPhi: 12, cellsZ: 48 },
  { cellsPhi: 12, cellsZ: 48 },
  { cellsPhi: 12, cellsZ: 48 },
  { cellsPhi: 12, cellsZ: 48 },
  { cellsPhi: 12, cellsZ: 48 },
  { cellsPhi: 4, cellsZ: 48 },
] as const;

export const CALO_PANEL_COUNT = CALO_PANELS.length;

export const CALO_FLAT_SIZE = CALO_PANELS.reduce(
  (sum, p) => sum + p.cellsPhi * p.cellsZ,
  0
);

/** Dense pack index: panel-major, then φ within panel, then z along the beam. */
export function caloFlatIndex(panel: number, phiIndex: number, zIndex: number): number {
  let offset = 0;
  for (let p = 0; p < panel; p++) {
    offset += CALO_PANELS[p].cellsPhi * CALO_PANELS[p].cellsZ;
  }
  return offset + phiIndex * CALO_PANELS[panel].cellsZ + zIndex;
}

export function caloPanelCellCount(panel: number): number {
  const p = CALO_PANELS[panel];
  return p.cellsPhi * p.cellsZ;
}

/**
 * Reference World-Space geometry (single cube + arc layout) measured in Blender.
 * Bar box: X = pitch φ, Y = radial depth, Z = pitch along beam.
 */
export const CALO_EMCAL_WORLD = {
  /** Cylinder radius to bar centres (xy). */
  radius: 811.6574,
  /** φ of the first cell centre (panel 0, phiIndex 0), degrees. */
  phi0Deg: -140.28,
  /** z of the first cell centre (zIndex 0). */
  z0: -48.0511,
  /** Bounding-box pitches of one tower cube. */
  pitchPhi: 12.7040,
  pitchZ: 11.9521,
  /** Radial extent of one cube (used as max readout height scale). */
  radialDepth: 26.0017,
  /** Reference world position of the first cell centre. */
  origin: { x: -624.3343, y: -518.6467, z: -48.0511 },
} as const;

/**
 * Sparse cell activation from pp (or other) collision data.
 * Indices address {@link CALO_PANELS}; `energy` drives bar height (0..1 relative or GeV-scaled later).
 */
export interface CalorimeterCellHit {
  detector: CalorimeterDetectorId;
  panel: number;
  phiIndex: number;
  zIndex: number;
  energy: number;
}

export interface CalorimeterEnergyPacks {
  caloEmcal?: number[];
  caloDcal?: number[];
}

export function emptyCaloEnergyPack(): number[] {
  return new Array(CALO_FLAT_SIZE).fill(0);
}

/** Merges sparse hits into a dense pack for one detector (out-of-range hits ignored). */
export function packCalorimeterHits(
  hits: CalorimeterCellHit[] | undefined,
  detector: CalorimeterDetectorId
): number[] {
  const pack = emptyCaloEnergyPack();
  if (!hits?.length) return pack;
  for (const hit of hits) {
    if (hit.detector !== detector) continue;
    const panel = CALO_PANELS[hit.panel];
    if (
      !panel ||
      hit.phiIndex < 0 || hit.phiIndex >= panel.cellsPhi ||
      hit.zIndex < 0 || hit.zIndex >= panel.cellsZ
    ) {
      continue;
    }
    const idx = caloFlatIndex(hit.panel, hit.phiIndex, hit.zIndex);
    pack[idx] = Math.max(pack[idx], hit.energy);
  }
  return pack;
}

/** @deprecated Use CALO_PANELS — kept as a summary for older call sites. */
export const CALO_GRID = {
  panelCount: CALO_PANEL_COUNT,
  cellsPhi: 12,
  cellsZ: 48,
} as const;
