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
  antiXiHistogramColor,
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
  [ParticleType.ANTI_XI]: antiXiHistogramColor,
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
  set collisionVideo(ref: ElementRef<HTMLVideoElement> | undefined) {
    this.collisionVideoRef = ref;
    if (!ref || this.protonCollisionIntroFinished) {
      return;
    }
    this.collisionVideoPlaybackStarted = false;
    const video = ref.nativeElement;
    video.muted = true;
    // @if + <source> children: browsers often need an explicit load() after mount.
    video.load();
  }
  private collisionVideoRef?: ElementRef<HTMLVideoElement>;

  @ViewChild('massHistograms')
  private massHistograms?: MassHistogramsComponent;

  instructionsComponent: Type<any> = InstructionsComponent;

  /** Guided coach while multipart detector assembly is still required this page load. */
  vaCoachOverlayVisible = false;
  vaCoachWelcomePhase = true;
  vaCoachVictoryPhase = false;
  vaCoachPieceHintIndex = 0;
  private vaCoachScheduleSub: Subscription | null = null;
  private vaCoachOpenScheduled = false;
  /** First real event loaded — avoids running the collision intro on the empty stub event. */
  private eventReadyForProtonIntro = false;
  /** Collision intro finished (or skipped) for this component instance. */
  private protonCollisionIntroFinished = false;
  /**
   * Intro already played/skipped during this browser page load.
   * Survives SPA module navigation; cleared on full refresh.
   */
  private static collisionIntroSeenThisPageLoad = false;

  /**
   * Proton–proton collision intro: template lists WebM then MP4 sources for codec coverage.
   */
  /** Ignore spurious `ended`/`error` before the video has actually progressed. */
  private static readonly COLLISION_INTRO_MIN_PLAYED_S = 0.4;
  private collisionVideoErrorRetries = 0;
  /** Hide the frozen first frame until playback actually starts. */
  collisionVideoPlaybackStarted = false;

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

  /** CDK overlay lives outside the host; dark class must be applied via panelClass. */
  get datasetSelectPanelClass(): string | string[] {
    return this.visualDarkMode
      ? ['va-dataset-select-panel', 'va-dataset-select-panel--dark']
      : 'va-dataset-select-panel';
  }

  uploadDisabledDatasets: Array<Number> = [DATASET_PICKER_DEMO];
  
  isLandscape$: Observable<boolean>;

  private readonly flightService = inject(FlightService);
  private readonly dialog = inject(MatDialog);
  /** Entries waiting for the global flying-ball animation to finish before commit. */
  private pendingFlightEntries = new Map<number, {
    entry: VisualAnalysisResultsEntry;
    trackKeys: string[];
    particle: ParticleType;
    binIndex: number;
  }>();
  private nextPendingFlightId = 0;
  /** Delay so students see the particle leave the detector before the page scrolls. */
  private static readonly SCROLL_AFTER_FLIGHT_START_MS = 500;
  private scrollAfterFlightTimeouts: number[] = [];
  /** Shown once per page load after the first mass-to-histogram flight finishes. */
  private histogramInfoDialogShownThisLoad = false;
  /** Brief pause after the bin pulse so the landing is visible before the dialog. */
  private static readonly HISTOGRAM_INFO_DIALOG_DELAY_MS = 480;
  private histogramInfoDialogTimeout: number | null = null;

  /**
   * Event is complete once every decay-daughter track has been used in a histogram add.
   * Cross-decay mixes are allowed (wrong V0 association); each physical track only once.
   */
  get isCurrentEventDone(): boolean {
    const required = this.collectRequiredTrackKeys();
    if (required.size === 0) {
      return false;
    }
    return this.dataService.areAllTracksAnalyzed(String(this.eventID), required);
  }

  /** Stable id for a decay daughter: `{decayIndex}:+` / `:-` / `:b`. */
  private trackKeyFor(track: Track, decayIndex: number): string | null {
    if (track.type === TrackType.CASCADE_BACHELOR) {
      return `${decayIndex}:b`;
    }
    if (track.sign > 0) {
      return `${decayIndex}:+`;
    }
    if (track.sign < 0) {
      return `${decayIndex}:-`;
    }
    return null;
  }

  /** Decay-group index attached by the event display when a daughter track is clicked. */
  private getDecayIndex(track: Track | null): number | null {
    if (track == null) {
      return null;
    }
    const index = (track as Track & { decayIndex?: number }).decayIndex;
    return typeof index === 'number' && Number.isFinite(index) ? index : null;
  }

  private trackKeyFromClicked(track: Track): string | null {
    const decayIndex = this.getDecayIndex(track);
    if (decayIndex === null) {
      return null;
    }
    return this.trackKeyFor(track, decayIndex);
  }

  /** All daughter track keys present in this event's decays. */
  private collectRequiredTrackKeys(): Set<string> {
    const keys = new Set<string>();
    const decays = this.event?.decays ?? [];
    for (let decayIndex = 0; decayIndex < decays.length; decayIndex++) {
      for (const track of decays[decayIndex] ?? []) {
        if (track == null) {
          continue;
        }
        const key = this.trackKeyFor(track, decayIndex);
        if (key != null) {
          keys.add(key);
        }
      }
    }
    return keys;
  }

  /**
   * Track keys for the current calculator selection — same daughter rules as the mass calc
   * (V0 → pos+neg; cascade → pos+neg+bachelor). Cross-decay mixes are allowed.
   */
  private collectSelectedTrackKeysForHistogram(): string[] | null {
    const particles = [this.particlePos, this.particleNeg, this.particleBac];
    const keys: string[] = [];
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      if (particle === null) {
        break;
      }
      const key = this.trackKeyFromClicked(particle);
      if (key == null) {
        return null;
      }
      keys.push(key);
      if (i === 1 && particle.type === TrackType.V0) {
        break;
      }
    }
    return keys.length > 0 ? keys : null;
  }

  private clearCalculatorSelection(): void {
    this.particlePos = null;
    this.particleNeg = null;
    this.particleBac = null;
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
      this.commitHistogramEntry(pending.entry, pending.trackKeys);
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

  /** True until the multipart detector has been fully assembled this page load. */
  get isDetectorAssemblyInProgress(): boolean {
    return !EventDisplayComponent.isMultipartDetectorStoredComplete(this.ALICE_DETECTOR_MODEL);
  }

  /**
   * Proton–proton collision intro before the detector assembly coach.
   * Replays after a full page refresh; skipped when returning via SPA module navigation
   * after the intro (or assembly) already ran this page load.
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

  /** Skip only the collision intro video; detector assembly continues. */
  onSkipCollisionIntro(): void {
    if (this.protonCollisionIntroFinished) {
      return;
    }
    const video = this.collisionVideoRef?.nativeElement;
    if (video) {
      video.pause();
    }
    this.onProtonCollisionIntroFinished();
  }

  /** Skip detector assembly coach and unlock the analysis UI (intro must already be done). */
  onSkipDetectorAssembly(): void {
    if (!this.isDetectorAssemblyInProgress) return;
    if (this.showCollisionVideoIntro) {
      // Assembly skip is only available after the intro layer is gone.
      return;
    }
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
    StrangenessVisualAnalysisComponent.collisionIntroSeenThisPageLoad = true;
    this.tryScheduleVaCoach();
  }

  /** Real end of playback — ignore early/spurious `ended` (incl. NaN currentTime after load()). */
  onCollisionVideoEnded(): void {
    const video = this.collisionVideoRef?.nativeElement;
    const played = video?.currentTime;
    const duration = video?.duration;
    if (
      !Number.isFinite(played) ||
      !Number.isFinite(duration) ||
      duration < 1 ||
      (played as number) < StrangenessVisualAnalysisComponent.COLLISION_INTRO_MIN_PLAYED_S
    ) {
      return;
    }
    this.onProtonCollisionIntroFinished();
  }

  /**
   * Media error after both source elements failed (or transient decode). Retry load once;
   * keep the green frame + Skip — do not auto-dismiss.
   */
  onCollisionVideoError(): void {
    if (this.protonCollisionIntroFinished) return;
    const video = this.collisionVideoRef?.nativeElement;
    if (video && this.collisionVideoErrorRetries < 1) {
      this.collisionVideoErrorRetries += 1;
      video.load();
      window.setTimeout(() => this.tryPlayCollisionVideo(), 0);
    }
  }

  onCollisionVideoReady(): void {
    this.tryPlayCollisionVideo();
  }

  onCollisionVideoPlaying(): void {
    this.collisionVideoPlaybackStarted = true;
  }

  /**
   * Start intro only once the video element has current data. An early play() (right after
   * the event loads, before canplay) rejects with AbortError and used to close the overlay —
   * black framed box flashes then vanishes on fast machines / cached events.
   */
  private tryPlayCollisionVideo(): void {
    const video = this.collisionVideoRef?.nativeElement;
    if (!video || this.protonCollisionIntroFinished) return;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    video.muted = true;
    void video.play().then(() => {
      this.collisionVideoPlaybackStarted = true;
    }).catch((err: unknown) => {
      // A newer load/play aborts the previous play() promise — do not end the intro.
      const name = err && typeof err === 'object' && 'name' in err ? String((err as {name: unknown}).name) : '';
      if (name === 'AbortError') return;
      // Autoplay blocked: leave the green frame up; student can use Skip.
    });
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
    this.maxEvents = this.dataService.getEventsInDataset(this.dataService.DEMO_DATASET_ID);
    if (
      !this.isDetectorAssemblyInProgress ||
      StrangenessVisualAnalysisComponent.collisionIntroSeenThisPageLoad
    ) {
      // Assembly already done this page load, or intro already seen (SPA remount).
      this.protonCollisionIntroFinished = true;
    }
    this.loadEvent().subscribe(
      (data: Event) => {
        this.eventChanged();
        this.eventReadyForProtonIntro = true;
        this.event = data;
        // Playback starts from (canplay) / onCollisionVideoReady — not here.
        // Early play() races the video mount and closes the intro on AbortError.
      },
      (error: HttpErrorResponse) => {
        // Do not block the assembly coach if the first event fails to load.
        this.eventReadyForProtonIntro = true;
        this.onProtonCollisionIntroFinished();
      }
    );
  }

  private loadEvent() {
    const datasetNum = this.dataService.resolveDatasetNum(this.datasetID);
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
    this.maxEvents = this.dataService.getEventsInDataset(
      this.dataService.resolveDatasetNum(this.datasetID)
    );

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
    this.clearCalculatorSelection();
  }

  onTrackClicked(event: Track): void {
    const trackKey = this.trackKeyFromClicked(event);
    // Each physical daughter may enter the calculator / histogram only once.
    if (
      trackKey != null &&
      this.dataService.isTrackAnalyzed(String(this.eventID), trackKey)
    ) {
      return;
    }

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
    // Snapshot before flight / clear — selection may change while the animation runs.
    const trackKeys = this.collectSelectedTrackKeysForHistogram();
    if (trackKeys == null) {
      return;
    }

    // Claim immediately so a second submit (or re-select during flight) cannot duplicate.
    // Cross-decay mixes are fine — we claim the concrete daughters, not whole V0 groups.
    if (!this.dataService.claimTracksForHistogram(String(this.eventID), trackKeys)) {
      this.clearCalculatorSelection();
      return;
    }
    this.clearCalculatorSelection();

    // Background has no dedicated mass histogram — commit immediately.
    if (event.type === ParticleType.BACKGROUND) {
      this.commitHistogramEntry(value, trackKeys);
      return;
    }

    const renderArea = this.eventDisplayHostRef?.nativeElement.querySelector('#render-area') as HTMLElement | null;
    if (!renderArea) {
      this.commitHistogramEntry(value, trackKeys);
      return;
    }

    // Measure at the current scroll position (overlay coords stay valid while we smooth-scroll).
    const target = this.massHistograms?.previewBinTarget(event.type, event.mass) ?? null;
    const renderRect = renderArea.getBoundingClientRect();
    if (!target || renderRect.width <= 0 || renderRect.height <= 0) {
      this.commitHistogramEntry(value, trackKeys);
      return;
    }

    const pendingId = ++this.nextPendingFlightId;
    this.pendingFlightEntries.set(pendingId, {
      entry: value,
      trackKeys,
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
        this.commitHistogramEntry(pending.entry, pending.trackKeys);
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

  private commitHistogramEntry(value: VisualAnalysisResultsEntry, trackKeys: string[]): void {
    // Tracks were already claimed in onAddToHistogram; this only appends the histogram entry.
    this.dataService.addVisualAnalysisResult(String(this.eventID), value, trackKeys);
  }

  /** One-shot tip after the first animated add lands in a histogram bar (resets on refresh). */
  private maybeShowHistogramInfoDialog(): void {
    if (typeof window === 'undefined') {
      return;
    }
    if (this.histogramInfoDialogShownThisLoad || this.histogramInfoDialogTimeout != null) {
      return;
    }
    this.histogramInfoDialogShownThisLoad = true;

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
