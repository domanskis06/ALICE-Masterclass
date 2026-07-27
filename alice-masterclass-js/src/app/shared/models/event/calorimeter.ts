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

/** EMCal: 5×(12×48) supermodules + 1×(4×48) strip, side-by-side in φ (long side || Z). */
export const CALO_EMCAL_PANELS: readonly CaloPanelSpec[] = [
  { cellsPhi: 12, cellsZ: 48 },
  { cellsPhi: 12, cellsZ: 48 },
  { cellsPhi: 12, cellsZ: 48 },
  { cellsPhi: 12, cellsZ: 48 },
  { cellsPhi: 12, cellsZ: 48 },
  { cellsPhi: 4, cellsZ: 48 },
] as const;

/**
 * DCal: inverted-U — two Z-bands of 3×(12×16), bridged at the outer φ end by 4×48.
 * Panel order: band−Z (0..2), band+Z (3..5), connector (6).
 */
export const CALO_DCAL_PANELS: readonly CaloPanelSpec[] = [
  { cellsPhi: 12, cellsZ: 16 },
  { cellsPhi: 12, cellsZ: 16 },
  { cellsPhi: 12, cellsZ: 16 },
  { cellsPhi: 12, cellsZ: 16 },
  { cellsPhi: 12, cellsZ: 16 },
  { cellsPhi: 12, cellsZ: 16 },
  { cellsPhi: 4, cellsZ: 48 },
] as const;

/** @deprecated Prefer {@link CALO_EMCAL_PANELS}. */
export const CALO_PANELS = CALO_EMCAL_PANELS;

export const CALO_EMCAL_PANEL_COUNT = CALO_EMCAL_PANELS.length;
export const CALO_DCAL_PANEL_COUNT = CALO_DCAL_PANELS.length;
/** @deprecated Prefer {@link CALO_EMCAL_PANEL_COUNT}. */
export const CALO_PANEL_COUNT = CALO_EMCAL_PANEL_COUNT;

export const CALO_EMCAL_FLAT_SIZE = CALO_EMCAL_PANELS.reduce(
  (sum, p) => sum + p.cellsPhi * p.cellsZ,
  0
);
export const CALO_DCAL_FLAT_SIZE = CALO_DCAL_PANELS.reduce(
  (sum, p) => sum + p.cellsPhi * p.cellsZ,
  0
);
/** @deprecated Prefer {@link CALO_EMCAL_FLAT_SIZE}. */
export const CALO_FLAT_SIZE = CALO_EMCAL_FLAT_SIZE;

export function caloPanelsFor(detector: CalorimeterDetectorId): readonly CaloPanelSpec[] {
  return detector === 'dcal' ? CALO_DCAL_PANELS : CALO_EMCAL_PANELS;
}

export function caloFlatSizeFor(detector: CalorimeterDetectorId): number {
  return detector === 'dcal' ? CALO_DCAL_FLAT_SIZE : CALO_EMCAL_FLAT_SIZE;
}

/** Dense pack index: panel-major, then φ within panel, then z along the beam. */
export function caloFlatIndex(
  panel: number,
  phiIndex: number,
  zIndex: number,
  panels: readonly CaloPanelSpec[] = CALO_EMCAL_PANELS
): number {
  let offset = 0;
  for (let p = 0; p < panel; p++) {
    offset += panels[p].cellsPhi * panels[p].cellsZ;
  }
  return offset + phiIndex * panels[panel].cellsZ + zIndex;
}

export function caloPanelCellCount(
  panel: number,
  panels: readonly CaloPanelSpec[] = CALO_EMCAL_PANELS
): number {
  const p = panels[panel];
  return p.cellsPhi * p.cellsZ;
}

/**
 * Sparse cell activation from pp (or other) collision data.
 * Indices address the detector’s panel list; `energy` drives bar height.
 *
 * TODO(future-data-update): Consumed by event-display readout bars once real
 * calorimeter hit data ships; display is currently disabled (CALORIMETER_HITS_ENABLED).
 */
export interface CalorimeterCellHit {
  detector: CalorimeterDetectorId;
  panel: number;
  phiIndex: number;
  zIndex: number;
  energy: number;
}

/** TODO(future-data-update): Dense packs for a future collision-data release. */
export interface CalorimeterEnergyPacks {
  caloEmcal?: number[];
  caloDcal?: number[];
}

export function emptyCaloEnergyPack(detector: CalorimeterDetectorId = 'emcal'): number[] {
  return new Array(caloFlatSizeFor(detector)).fill(0);
}

/**
 * Merges sparse hits into a dense pack for one detector (out-of-range hits ignored).
 * TODO(future-data-update): Used when calorimeter hit display is re-enabled.
 */
export function packCalorimeterHits(
  hits: CalorimeterCellHit[] | undefined,
  detector: CalorimeterDetectorId
): number[] {
  const panels = caloPanelsFor(detector);
  const pack = emptyCaloEnergyPack(detector);
  if (!hits?.length) return pack;
  for (const hit of hits) {
    if (hit.detector !== detector) continue;
    const panel = panels[hit.panel];
    if (
      !panel ||
      hit.phiIndex < 0 || hit.phiIndex >= panel.cellsPhi ||
      hit.zIndex < 0 || hit.zIndex >= panel.cellsZ
    ) {
      continue;
    }
    const idx = caloFlatIndex(hit.panel, hit.phiIndex, hit.zIndex, panels);
    pack[idx] = Math.max(pack[idx], hit.energy);
  }
  return pack;
}

/** @deprecated Use CALO_EMCAL_PANELS — kept as a summary for older call sites. */
export const CALO_GRID = {
  panelCount: CALO_EMCAL_PANEL_COUNT,
  cellsPhi: 12,
  cellsZ: 48,
} as const;
