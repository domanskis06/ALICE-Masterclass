import { CalorimeterCellHit } from './calorimeter';

export enum TrackType {
  STANDARD = 0,
  V0 = 1,
  CASCADE = 2,
  CASCADE_BACHELOR = 3
}

export interface Track {
  E: number;
  mass: number;
  particleId: number;
  comboId: number;
  sign: number;
  type: TrackType;
  px: number;
  py: number;
  pz: number;
  trajectory: number[][];
}

export interface Event {
  tracks: Track[];
  clusters: number[][];
  decays: Track[][];
  /**
   * Optional dense EMCal cell energies (length = CALO_EMCAL_FLAT_SIZE).
   * When set, readout bars use these values instead of the procedural preview.
   */
  caloEmcal?: number[];
  /** Optional dense DCal cell energies (length = CALO_DCAL_FLAT_SIZE). */
  caloDcal?: number[];
  /**
   * Optional sparse calorimeter hits. Applied when the matching dense pack is absent;
   * useful while wiring real pp activation data.
   */
  caloHits?: CalorimeterCellHit[];
}
