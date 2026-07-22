/**
 * Dominant UI accent colour per GLB (from each part's signature
 * `baseColorFactor` in `assets/models/alice components/*.glb`).
 * Grey structural materials are ignored in favour of the coloured shell.
 */
const DETECTOR_PART_ACCENT_HEX: Record<string, string> = {
  'its.glb': '#33FF71',
  'tpc.glb': '#22C4FF',
  'trd.glb': '#FFAA32',
  'tof.glb': '#FF5E1C',
  'emcal.glb': '#2B1FFF',
  'dcal.glb': '#FF2FC0',
  'phos.glb': '#D1C30C',
  /** CAD magnet (Visual Analysis / EventDisplay). */
  'l3.glb': '#FF0D12',
  /** Lightweight octagon stand-in (Particle Propagation). */
  'l3_pp.glb': '#FF0D12',
  'mch.glb': '#814244',
  'abso.glb': '#DE782B',
  'dipo.glb': '#0068D0',
  'bp.glb': '#9EB0C4',
  /** FIT is mostly silver metal in the GLB — keep the slider matching that look. */
  'fit.glb': '#C0C4C8',
};

/** CSS hex accent for opacity sliders / part chips; falls back to orange. */
export function detectorPartAccentColor(assetPath: string): string {
  const file = assetPath.replace(/^.*[/\\]/, '').toLowerCase();
  return DETECTOR_PART_ACCENT_HEX[file] ?? '#ff6f00';
}
