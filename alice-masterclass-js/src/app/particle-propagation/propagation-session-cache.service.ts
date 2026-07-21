/**
 * In-memory session cache for Particle Propagation across route navigations.
 *
 * The component is destroyed when leaving the module. Detector GLBs and field
 * streamlines stay warm so the next visit can re-parent them into a fresh
 * WebGL scene without re-fetching. Tracks and playback are intentionally
 * NOT restored — each visit shows the welcome / Start dialog and runs RK4
 * from scratch.
 */

import { Injectable } from '@angular/core';
import * as THREE from 'three';

import { BufferedTrack } from './physics/propagation-types';
import { FIELD_STRENGTH_DEFAULT_T } from './physics/constants';
import { FieldLineDensity } from './physics/field-line-tracer';
import { DetectorModel } from './scene/detector-loader';
import { CollisionIntro } from './scene/collision-intro';
import { PropagationCameraMode } from './scene/propagation-scene';

export interface DetectorPartUiSnapshot {
  assetPath: string;
  label: string;
  visible: boolean;
  opacity: number;
  accentColor: string;
}

export interface PropagationUiSnapshot {
  selectedEventIndex: number;
  isDarkMode: boolean;
  cameraMode: PropagationCameraMode;
  fieldVisible: boolean;
  fieldDipoleTransitionVisible: boolean;
  fieldOpacity: number;
  fieldDensity: FieldLineDensity;
  fieldLinewidth: number;
  fieldStrengthT: number;
  solenoidPolarity: 1 | -1;
  playbackSpeed: number;
}

@Injectable({ providedIn: 'root' })
export class PropagationSessionCacheService {
  /** Full detector assembly (group must be detached from any scene). */
  detectorModel: DetectorModel | null = null;
  detectorPartsForUi: DetectorPartUiSnapshot[] | null = null;

  /** Built streamline group (detached). */
  fieldLines: THREE.Object3D | null = null;
  fieldLinesBuiltAtStrengthT = FIELD_STRENGTH_DEFAULT_T;

  collisionIntro: CollisionIntro | null = null;

  /**
   * Transient RK4 / playback state for the current visit only. Cleared when
   * leaving the module so the next entry always starts from the welcome dialog.
   */
  hasStarted = false;
  tracks: BufferedTrack[] = [];
  minTimeMs = 0;
  maxTimeMs = 1;
  currentTimeMs = 0;
  tracksNeedRecompute = false;

  ui: PropagationUiSnapshot | null = null;

  /** Detector + field lines are warm enough to skip the boot splash. */
  get hasSceneAssets(): boolean {
    return this.detectorModel != null && this.fieldLines != null;
  }

  clearTracksOnly(): void {
    this.tracks = [];
    this.hasStarted = false;
    this.tracksNeedRecompute = false;
    this.minTimeMs = 0;
    this.maxTimeMs = 1;
    this.currentTimeMs = 0;
  }

  /** Full reset (tests / intentional cold boot). Does not dispose Three.js resources. */
  clearAll(): void {
    this.detectorModel = null;
    this.detectorPartsForUi = null;
    this.fieldLines = null;
    this.fieldLinesBuiltAtStrengthT = FIELD_STRENGTH_DEFAULT_T;
    this.collisionIntro = null;
    this.ui = null;
    this.clearTracksOnly();
  }
}
