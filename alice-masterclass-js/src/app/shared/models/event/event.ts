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
   * TODO(future-data-update): Dense EMCal cell energies (length = CALO_EMCAL_FLAT_SIZE).
   * Not shown yet — readout bars are gated until a future collision-data update.
   */
  caloEmcal?: number[];
  /**
   * TODO(future-data-update): Dense DCal cell energies (length = CALO_DCAL_FLAT_SIZE).
   * Not shown yet — readout bars are gated until a future collision-data update.
   */
  caloDcal?: number[];
  /**
   * TODO(future-data-update): Sparse calorimeter hits when dense packs are absent.
   * Not shown yet — enable with CALORIMETER_HITS_ENABLED after the data update.
   */
  caloHits?: CalorimeterCellHit[];
}
