import { AfterViewInit, ApplicationRef, Component, ElementRef, OnDestroy, OnInit, Type, ViewChild, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { InstructionsProvider } from '../shared/interfaces';
import { BreakpointObserver } from '@angular/cdk/layout';
import { forkJoin, Observable } from 'rxjs';
import { map, shareReplay, filter, take } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Event, Track, TrackType } from '../shared/models';

import {
  DATASET_PICKER_DEMO,
  DATASET_PICKER_FULL_EVENT,
  StrangenessDataService,
} from '../services/strangeness-data.service';
import { ParticleType, VisualAnalysisResultsEntry } from '../shared/services/api.service';
import { InstructionsComponent } from './instructions/instructions.component';
import { TranslateService } from '@ngx-translate/core';
import { DetectorPartToggleModel, EventDisplayComponent } from '../shared/components/event-display/event-display.component';
import { MassHistogramsComponent } from './mass-histograms/mass-histograms.component';
import { FlightService } from '../shared/services/flight.service';
import {
  antiLambdaHistogramColor,
  backgroundHistogramColor,
  kaonHistogramColor,
  lambdaHistogramColor,
  xiHistogramColor,
} from '../shared/globals';
import { HistogramInfoDialogComponent } from './histogram-info-dialog/histogram-info-dialog.component';

export interface SubmitHistogramEntry {
  type: ParticleType,
  mass: number
}

/** Same palette as mass-histogram bars — flight particle matches its destination plot. */
const FLIGHT_COLORS: Record<ParticleType, string> = {
  [ParticleType.KAON]: kaonHistogramColor,
  [ParticleType.LAMBDA]: lambdaHistogramColor,
  [ParticleType.ANTI_LAMBDA]: antiLambdaHistogramColor,
  [ParticleType.XI]: xiHistogramColor,
  [ParticleType.BACKGROUND]: backgroundHistogramColor,
};

@Component({
    selector: 'app-strangeness-visual-analysis',
    templateUrl: './strangeness-visual-analysis.component.html',
    styleUrls: ['./strangeness-visual-analysis.component.scss'],
    standalone: false
})
export class StrangenessVisualAnalysisComponent implements OnInit, AfterViewInit, OnDestroy, InstructionsProvider {
  @ViewChild('eventDisplayHost')
  private eventDisplay!: EventDisplayComponent;

  @ViewChild('eventDisplayHost', {read: ElementRef})
  private eventDisplayHostRef!: ElementRef<HTMLElement>;

  @ViewChild('collisionVideo')
  private collisionVideoRef?: ElementRef<HTMLVideoElement>;

  @ViewChild('massHistograms')
  private massHistograms?: MassHistogramsComponent;

  instructionsComponent: Type<any> = InstructionsComponent;

  /** Guided coach while multipart detector assembly is still required this session. */
  vaCoachOverlayVisible = false;
  vaCoachWelcomePhase = true;
  vaCoachVictoryPhase = false;
  vaCoachPieceHintIndex = 0;
  private vaCoachScheduleSub: Subscription | null = null;
  private vaCoachOpenScheduled = false;
  /** First real event loaded — avoids running the collision intro on the empty stub event. */
  private eventReadyForProtonIntro = false;
  /** Collision intro finished (or skipped because assembly was already done). */
  private protonCollisionIntroFinished = false;

  /** MP4 proton–proton collision intro shown before the assembly coach. */
  readonly collisionVideoUrl = 'assets/videos/proton_collision_animation.mp4';

  readonly ALICE_DETECTOR_MODEL = [
    'assets/models/alice components/its.glb',
    'assets/models/alice components/FIT.glb',
    'assets/models/alice components/tpc.glb',
    'assets/models/alice components/TRD.glb',
    'assets/models/alice components/TOF.glb',
    'assets/models/alice components/EMCAL.glb',
    'assets/models/alice components/DCAL.glb',
    'assets/models/alice components/PHOS.glb',
    'assets/models/alice components/L3.glb',
  ];

  datasetID: number = DATASET_PICKER_DEMO;
  eventID: number = 0;
  maxEvents: number = 0;
  event: Event = {tracks: [], decays: [], clusters: []};

  particlePos: Track = null;
  particleNeg: Track = null;
  particleBac: Track = null;

  visualDarkMode = false;
  readonly visualLightBackgroundColor = 0xFFFFFF;
  readonly visualDarkBackgroundColor = 0x0a1832;

  uploadDisabledDatasets: Array<Number> = [DATASET_PICKER_DEMO];
  
  isLandscape$: Observable<boolean>;

  private readonly flightService = inject(FlightService);
  private readonly dialog = inject(MatDialog);
  /** Entries waiting for the global flying-ball animation to finish before commit. */
  private pendingFlightEntries = new Map<number, {
    entry: VisualAnalysisResultsEntry;
    trackIds: number[];
    particle: ParticleType;
    binIndex: number;
  }>();
  private nextPendingFlightId = 0;
  /** Delay so students see the particle leave the detector before the page scrolls. */
  private static readonly SCROLL_AFTER_FLIGHT_START_MS = 500;
  private scrollAfterFlightTimeouts: number[] = [];
  /** Shown once after the first mass-to-histogram flight finishes. */
  private static readonly HISTOGRAM_INFO_STORAGE_KEY = 'va-histogram-info-seen';
  /** Brief pause after the bin pulse so the landing is visible before the dialog. */
  private static readonly HISTOGRAM_INFO_DIALOG_DELAY_MS = 480;
  private histogramInfoDialogTimeout: number | null = null;

  /**
   * Event is complete once every decay-track particleId has been used in a histogram add.
   * Counts unique tracks across all V0/cascade groups — not the number of decay groups.
   */
  get isCurrentEventDone(): boolean {
    const required = this.collectDecayTrackIds();
    if (required.size === 0) {
      return false;
    }
    return this.dataService.areAllDecayTracksAnalyzed(String(this.eventID), required);
  }

  /** Unique particleIds of all daughter tracks in this event's decays. */
  private collectDecayTrackIds(): Set<number> {
    const ids = new Set<number>();
    for (const decay of this.event?.decays ?? []) {
      for (const track of decay) {
        if (track != null) {
          ids.add(track.particleId);
        }
      }
    }
    return ids;
  }

  /**
   * particleIds used for the current calculator mass — same selection rules as the calculator
   * (V0 → pos+neg; cascade → pos+neg+bachelor).
   */
  private collectSelectedTrackIdsForHistogram(): number[] {
    const particles = [this.particlePos, this.particleNeg, this.particleBac];
    const ids: number[] = [];
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      if (particle === null) {
        break;
      }
      ids.push(particle.particleId);
      if (i === 1 && particle.type === TrackType.V0) {
        break;
      }
    }
    return ids;
  }

  constructor(
    private breakpointObserver: BreakpointObserver,
    private snackBar: MatSnackBar,
    public dataService: StrangenessDataService,
    private translateService: TranslateService,
    private appRef: ApplicationRef,
    ) { 
      this.isLandscape$ = this.breakpointObserver.observe('(orientation: landscape)')
    .pipe(
      map(result => result.matches),
      shareReplay()
    );
  }

  ngAfterViewInit(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    this.vaCoachScheduleSub = this.appRef.isStable
      .pipe(filter((stable) => stable), take(1))
      .subscribe(() => {
        queueMicrotask(() => window.setTimeout(() => this.tryScheduleVaCoach(), 380));
      });
    window.setTimeout(() => this.tryScheduleVaCoach(), 1650);
  }

  ngOnDestroy(): void {
    this.vaCoachScheduleSub?.unsubscribe();
    this.vaCoachScheduleSub = null;
    this.scrollAfterFlightTimeouts.forEach((id) => window.clearTimeout(id));
    this.scrollAfterFlightTimeouts = [];
    if (this.histogramInfoDialogTimeout != null) {
      window.clearTimeout(this.histogramInfoDialogTimeout);
      this.histogramInfoDialogTimeout = null;
    }
    // Commit entries still in flight so a mid-animation destroy does not drop them.
    for (const pending of this.pendingFlightEntries.values()) {
      this.commitHistogramEntry(pending.entry, pending.trackIds);
    }
    this.pendingFlightEntries.clear();
  }

  /**
   * Coach / palette order: DCal is placed together with EMCal as "Calorimeters",
   * so it is not a separate construction step.
   */
  private get assemblyCoachSteps(): string[] {
    return this.ALICE_DETECTOR_MODEL.filter(
      (path) => !EventDisplayComponent.isDcalAssetPath(path)
    );
  }

  get assemblyCoachHighlightPath(): string | null {
    if (!this.vaCoachOverlayVisible || this.vaCoachWelcomePhase || this.vaCoachVictoryPhase) return null;
    return this.assemblyCoachSteps[this.vaCoachPieceHintIndex] ?? null;
  }

  /**
   * Only this palette asset may be dragged/placed while assembly is in progress.
   * Null during welcome (description not shown yet) → all palette drag disabled.
   */
  get assemblyAllowedDragPath(): string | null {
    if (!this.isDetectorAssemblyInProgress || this.vaCoachVictoryPhase) {
      return null;
    }
    if (this.vaCoachOverlayVisible && this.vaCoachWelcomePhase) {
      return null;
    }
    return this.assemblyCoachSteps[this.vaCoachPieceHintIndex] ?? null;
  }

  /** True until the multipart detector has been fully assembled this session. */
  get isDetectorAssemblyInProgress(): boolean {
    return !EventDisplayComponent.isMultipartDetectorStoredComplete(this.ALICE_DETECTOR_MODEL);
  }

  /**
   * Show the MP4 proton–proton collision intro before the detector assembly coach.
   * Skipped when assembly was already completed in this browser tab session.
   */
  get showCollisionVideoIntro(): boolean {
    return (
      this.isDetectorAssemblyInProgress &&
      this.eventReadyForProtonIntro &&
      !this.protonCollisionIntroFinished
    );
  }

  get vaCoachCurrentPiecePresentation(): Pick<DetectorPartToggleModel, 'labelKey' | 'labelParams'> {
    const path = this.assemblyCoachSteps[this.vaCoachPieceHintIndex];
    if (!path) {
      return { labelKey: 'EVENT_DISPLAY.DETECTOR_LAYER_FALLBACK', labelParams: { name: '' } };
    }
    return EventDisplayComponent.assemblyPalettePresentation(path);
  }

  /** Real photos for selected detector parts (shown under "Next piece to place"). */
  private static readonly DETECTOR_PART_PHOTOS: Record<string, string> = {
    ITS: 'assets/images/detector-parts/ITS.png',
    FIT: 'assets/images/detector-parts/FIT.png',
    TPC: 'assets/images/detector-parts/TPC.png',
    TRD: 'assets/images/detector-parts/TRD.png',
    TOF: 'assets/images/detector-parts/TOF.png',
    EMCAL: 'assets/images/detector-parts/EMCAL.png',
    CALORIMETERS: 'assets/images/detector-parts/EMCAL.png',
    PHOS: 'assets/images/detector-parts/PHOS.png',
    L3: 'assets/images/detector-parts/L3.png',
  };

  /** i18n key under VA_COACH.PART_DESC for the piece currently highlighted (e.g. ITS). */
  get vaCoachCurrentPartDescId(): string | null {
    const path = this.assemblyCoachSteps[this.vaCoachPieceHintIndex];
    if (!path) return null;
    const file = path.replace(/^.*[/\\]/, '').toLowerCase();
    const byFile: Record<string, string> = {
      'its.glb': 'ITS',
      'fit.glb': 'FIT',
      'tpc.glb': 'TPC',
      'trd.glb': 'TRD',
      'tof.glb': 'TOF',
      'emcal.glb': 'CALORIMETERS',
      'phos.glb': 'PHOS',
      'l3.glb': 'L3',
    };
    return byFile[file] ?? null;
  }

  /** Photo URL for the current assembly piece, when available. */
  get vaCoachCurrentPartPhotoUrl(): string | null {
    const path = this.assemblyCoachSteps[this.vaCoachPieceHintIndex];
    if (path && EventDisplayComponent.isEmcalAssetPath(path)) {
      return StrangenessVisualAnalysisComponent.DETECTOR_PART_PHOTOS.CALORIMETERS;
    }
    const id = this.vaCoachCurrentPartDescId;
    if (!id) return null;
    return StrangenessVisualAnalysisComponent.DETECTOR_PART_PHOTOS[id] ?? null;
  }

  /** LETS US tip panel next to the assembly drawer (hidden during welcome / victory). */
  get showLetsUsPanel(): boolean {
    return (
      this.vaCoachOverlayVisible &&
      !this.vaCoachWelcomePhase &&
      !this.vaCoachVictoryPhase &&
      !!this.vaCoachCurrentPartDescId
    );
  }

  /** Bullet keys (B1, B2, …) present for the current PART_DESC — length may vary per component. */
  get vaCoachCurrentPartBulletKeys(): string[] {
    const id = this.vaCoachCurrentPartDescId;
    if (!id) return [];
    const candidates = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'];
    const block = this.translateService.instant(`VA_COACH.PART_DESC.${id}`);
    if (block && typeof block === 'object') {
      return candidates.filter((k) => typeof (block as Record<string, unknown>)[k] === 'string'
        && String((block as Record<string, unknown>)[k]).length > 0);
    }
    return candidates.filter((k) => {
      const key = `VA_COACH.PART_DESC.${id}.${k}`;
      const text = this.translateService.instant(key);
      return typeof text === 'string' && text.length > 0 && text !== key;
    });
  }

  onVaCoachWelcomeContinue(): void {
    this.vaCoachWelcomePhase = false;
  }

  onVaCoachVictoryDismiss(): void {
    this.vaCoachOverlayVisible = false;
    this.vaCoachVictoryPhase = false;
    this.eventDisplay?.hideOuterDetectorPartsAfterAssembly();
  }

  /** Skip collision intro + detector assembly coach and unlock the analysis UI. */
  onSkipDetectorAssembly(): void {
    if (!this.isDetectorAssemblyInProgress) return;
    const video = this.collisionVideoRef?.nativeElement;
    if (video) {
      video.pause();
    }
    this.protonCollisionIntroFinished = true;
    this.vaCoachOverlayVisible = false;
    this.vaCoachWelcomePhase = false;
    this.vaCoachVictoryPhase = false;
    this.vaCoachOpenScheduled = true;
    this.eventDisplay?.skipMultipartDetectorAssembly(this.ALICE_DETECTOR_MODEL);
    this.eventDisplay?.hideOuterDetectorPartsAfterAssembly();
  }

  onDetectorAssemblyPiecePlaced(assetPath: string): void {
    if (!this.vaCoachOverlayVisible || this.vaCoachVictoryPhase || this.vaCoachWelcomePhase) return;
    const steps = this.assemblyCoachSteps;
    const expected = steps[this.vaCoachPieceHintIndex];
    if (assetPath !== expected) return;
    const next = this.vaCoachPieceHintIndex + 1;
    if (next >= steps.length) {
      this.vaCoachVictoryPhase = true;
      return;
    }
    this.vaCoachPieceHintIndex = next;
  }

  onProtonCollisionIntroFinished(): void {
    if (this.protonCollisionIntroFinished) return;
    this.protonCollisionIntroFinished = true;
    this.tryScheduleVaCoach();
  }

  onCollisionVideoReady(): void {
    this.tryPlayCollisionVideo();
  }

  private tryPlayCollisionVideo(): void {
    const video = this.collisionVideoRef?.nativeElement;
    if (!video || this.protonCollisionIntroFinished) return;
    void video.play().catch(() => this.onProtonCollisionIntroFinished());
  }

  private tryScheduleVaCoach(): void {
    if (this.vaCoachOpenScheduled) return;
    if (EventDisplayComponent.isMultipartDetectorStoredComplete(this.ALICE_DETECTOR_MODEL)) return;
    // Detector building starts only after the collision intro (when one is required).
    if (this.isDetectorAssemblyInProgress && !this.protonCollisionIntroFinished) return;
    this.vaCoachOpenScheduled = true;
    this.vaCoachOverlayVisible = true;
    this.vaCoachWelcomePhase = true;
    this.vaCoachVictoryPhase = false;
    this.vaCoachPieceHintIndex = 0;
  }

  ngOnInit(): void {
    this.maxEvents = this.dataService.EVENTS_IN_DEMO_DATASET;
    if (!this.isDetectorAssemblyInProgress) {
      // Returning session: no collision intro before assembly.
      this.protonCollisionIntroFinished = true;
    }
    this.loadEvent().subscribe(
      (data: Event) => {
        this.eventChanged();
        this.eventReadyForProtonIntro = true;
        this.event = data;
        setTimeout(() => this.tryPlayCollisionVideo(), 0);
      },
      (error: HttpErrorResponse) => {
        // Do not block the assembly coach if the first event fails to load.
        this.eventReadyForProtonIntro = true;
        this.onProtonCollisionIntroFinished();
      }
    );
  }

  private loadEvent() {
    let datasetNum;

    if (this.datasetID === DATASET_PICKER_DEMO) {
      datasetNum = this.dataService.DEMO_DATASET_ID;
    } else if (this.datasetID === DATASET_PICKER_FULL_EVENT) {
      datasetNum = this.dataService.FULL_DATASET_ID;
    } else {
      datasetNum = this.datasetID;
    }

    return this.dataService.getEvent(datasetNum, this.eventID);
  }

  onDatasetChange(newDatasetID: number): void {
    if (this.isDetectorAssemblyInProgress) {
      return;
    }
    // Drop in-flight histogram commits so they cannot land on the new dataset.
    this.scrollAfterFlightTimeouts.forEach((id) => window.clearTimeout(id));
    this.scrollAfterFlightTimeouts = [];
    this.pendingFlightEntries.clear();
    this.dataService.clearVisualAnalysisResults();
    this.datasetID = newDatasetID;

    if (this.datasetID === DATASET_PICKER_DEMO) {
      this.maxEvents = this.dataService.EVENTS_IN_DEMO_DATASET;
    } else if (this.datasetID === DATASET_PICKER_FULL_EVENT) {
      this.maxEvents = this.dataService.EVENTS_IN_FULL_DATASET;
    } else {
      this.maxEvents = this.dataService.EVENTS_IN_DATASET;
    }

    this.eventID = 0;
    this.loadEvent().subscribe(
      (data: Event) => {
        this.eventChanged();
        this.event = data;
      },
      (error: HttpErrorResponse) => {
      }
    );
  }

  onPreviousEvent(): void {
    if (this.isDetectorAssemblyInProgress) {
      return;
    }
    this.eventID -= 1;

    this.loadEvent().subscribe(
      (data: Event) => {
        this.eventChanged();
        this.event = data;
      },
      (error: HttpErrorResponse) => {
      }
    );
  }

  onNextEvent(): void {
    if (this.isDetectorAssemblyInProgress) {
      return;
    }
    this.eventID += 1;
    
    this.loadEvent().subscribe(
      (data: Event) => {
        this.eventChanged();
        this.event = data;
      },
      (error: HttpErrorResponse) => {
      }
    );
  }

  private eventChanged(): void {
    this.event = null;
    this.particlePos = null;
    this.particleNeg = null;
    this.particleBac = null;
  }

  onTrackClicked(event: Track): void {
    if (event.type == TrackType.CASCADE_BACHELOR) {
      this.particleBac = event;
    } else if (event.sign > 0) {
      this.particlePos = event;
    } else if (event.sign < 0) {
      this.particleNeg = event;
    }
  }

  onAddToHistogram(event: SubmitHistogramEntry) {
    const value: VisualAnalysisResultsEntry = {particle: event.type, mass: event.mass};
    // Snapshot before flight / clear — tracks may change while the animation runs.
    const trackIds = this.collectSelectedTrackIdsForHistogram();

    // Background has no dedicated mass histogram — commit immediately.
    if (event.type === ParticleType.BACKGROUND) {
      this.commitHistogramEntry(value, trackIds);
      return;
    }

    const renderArea = this.eventDisplayHostRef?.nativeElement.querySelector('#render-area') as HTMLElement | null;
    if (!renderArea) {
      this.commitHistogramEntry(value, trackIds);
      return;
    }

    // Measure at the current scroll position (overlay coords stay valid while we smooth-scroll).
    const target = this.massHistograms?.previewBinTarget(event.type, event.mass) ?? null;
    const renderRect = renderArea.getBoundingClientRect();
    if (!target || renderRect.width <= 0 || renderRect.height <= 0) {
      this.commitHistogramEntry(value, trackIds);
      return;
    }

    const pendingId = ++this.nextPendingFlightId;
    this.pendingFlightEntries.set(pendingId, {
      entry: value,
      trackIds,
      particle: event.type,
      binIndex: target.binIndex,
    });

    void this.flightService
      .fly(
        { x: renderRect.left + renderRect.width / 2, y: renderRect.top + renderRect.height / 2 },
        { x: target.targetX, y: target.targetY },
        { color: FLIGHT_COLORS[event.type] }
      )
      .then(() => {
        const pending = this.pendingFlightEntries.get(pendingId);
        this.pendingFlightEntries.delete(pendingId);
        if (!pending) {
          return;
        }
        this.commitHistogramEntry(pending.entry, pending.trackIds);
        window.setTimeout(() => {
          this.massHistograms?.pulseBin(pending.particle, pending.binIndex);
          this.maybeShowHistogramInfoDialog();
        }, 40);
      });

    // Let the particle leave the detector centre first, then smooth-scroll to the histogram.
    const scrollTimeoutId = window.setTimeout(() => {
      this.scrollAfterFlightTimeouts = this.scrollAfterFlightTimeouts.filter((id) => id !== scrollTimeoutId);
      this.massHistograms?.scrollHistogramIntoView(event.type);
    }, StrangenessVisualAnalysisComponent.SCROLL_AFTER_FLIGHT_START_MS);
    this.scrollAfterFlightTimeouts.push(scrollTimeoutId);
  }

  private commitHistogramEntry(value: VisualAnalysisResultsEntry, trackIds: number[]): void {
    this.dataService.addVisualAnalysisResult(String(this.eventID), value, trackIds);
    // Clear selection so the next V0 / cascade in a multi-decay event can be picked cleanly.
    this.particlePos = null;
    this.particleNeg = null;
    this.particleBac = null;
  }

  /** One-shot tip after the first animated add lands in a histogram bar. */
  private maybeShowHistogramInfoDialog(): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      if (sessionStorage.getItem(StrangenessVisualAnalysisComponent.HISTOGRAM_INFO_STORAGE_KEY) === '1') {
        return;
      }
      sessionStorage.setItem(StrangenessVisualAnalysisComponent.HISTOGRAM_INFO_STORAGE_KEY, '1');
    } catch {
      // Private mode / blocked storage — still show once this session via timeout guard.
      if (this.histogramInfoDialogTimeout != null) {
        return;
      }
    }

    if (this.histogramInfoDialogTimeout != null) {
      return;
    }

    this.histogramInfoDialogTimeout = window.setTimeout(() => {
      this.histogramInfoDialogTimeout = null;
      this.dialog.open(HistogramInfoDialogComponent, {
        width: '520px',
        autoFocus: true,
      });
    }, StrangenessVisualAnalysisComponent.HISTOGRAM_INFO_DIALOG_DELAY_MS);
  }

  onUploadResults() {
    let uploadingTranslation = '', completedTranslation = '';

    forkJoin([ this.translateService.get('PASSWORD.UPLOADING'), this.translateService.get('PASSWORD.COMPLETED') ])
      .subscribe((res) => {
        uploadingTranslation = res[0];
        completedTranslation = res[1];

        this.snackBar.open(uploadingTranslation, null, {duration: this.dataService.DATA_UPLOAD_COMPLETED_DURATION});

        this.dataService.submitVisualAnalysisResults(this.datasetID).subscribe(() => {
          this.snackBar.open(completedTranslation, null, {duration: this.dataService.DATA_UPLOAD_COMPLETED_DURATION});
        });
    });
  }
}
