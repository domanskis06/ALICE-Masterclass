import { AfterViewInit, ApplicationRef, Component, ElementRef, NgZone, OnDestroy, OnInit, Type, ViewChild, inject } from '@angular/core';
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
import { InstructionsDialogComponent } from '../instructions-dialog/instructions-dialog.component';

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

  @ViewChild('detectorSection')
  private detectorSectionRef?: ElementRef<HTMLElement>;

  @ViewChild('analysisSection')
  private analysisSectionRef?: ElementRef<HTMLElement>;

  instructionsComponent: Type<any> = InstructionsComponent;

  /** True when calculator strip is sufficiently visible — hides the scroll-down FAB. */
  private analysisSectionInView = false;
  private analysisSectionObserver: IntersectionObserver | null = null;

  /** Fixed red scroll cue until the calculator strip is scrolled into place. */
  get showScrollToAnalysisButton(): boolean {
    return !this.showCollisionVideoIntro && !this.analysisSectionInView;
  }

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
   * sessionStorage: intro already played/skipped in this browser tab.
   * Survives refresh and SPA navigation; cleared when the tab is closed
   * (a new tab shows the intro again).
   */
  private static readonly COLLISION_INTRO_SEEN_STORAGE_KEY =
    'alice_mc_visualAnalysis_collisionIntroSeen_v1';

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
  /** 0-based index into the dataset; UI shows `displayEventNumber` (1-based). */
  eventID: number = 0;
  maxEvents: number = 0;
  event: Event = {tracks: [], decays: [], clusters: []};

  particlePos: Track = null;
  particleNeg: Track = null;
  particleBac: Track = null;

  /** 1-based event number shown in the sidebar / completion UI. */
  get displayEventNumber(): number {
    return this.eventID + 1;
  }

  /** Histogram entries already added for the current event (for undo / remove UI). */
  get currentEventResults(): VisualAnalysisResultsEntry[] {
    return this.dataService.getVisualAnalysisResultsForEvent(String(this.eventID));
  }

  /** True while a mass-to-histogram flight for this event has claimed tracks but not committed yet. */
  get hasPendingAddForCurrentEvent(): boolean {
    return this.pendingFlightEntries.size > 0;
  }

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
    /** Event id at Add time — commit/cancel must not use a later navigated eventID. */
    eventKey: string;
  }>();
  private nextPendingFlightId = 0;
  /** Delay so students see the particle leave the detector before the page scrolls. */
  private static readonly SCROLL_AFTER_FLIGHT_START_MS = 250;
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

  /**
   * Stable id for a decay daughter from charge role + kinematics.
   * Kinematics (not decayIndex) collapse duplicate V0s that some demo ROOT
   * exports list twice — otherwise required keys never become fully claimed.
   */
  private trackKeyFor(track: Track): string | null {
    let role: string;
    if (track.type === TrackType.CASCADE_BACHELOR) {
      role = 'b';
    } else if (track.sign > 0) {
      role = '+';
    } else if (track.sign < 0) {
      role = '-';
    } else {
      return null;
    }
    return `${role}:${track.type}:${track.px}:${track.py}:${track.pz}:${track.E}`;
  }

  private trackKeyFromClicked(track: Track): string | null {
    return this.trackKeyFor(track);
  }

  /** Unique daughter track keys present in this event's decays. */
  private collectRequiredTrackKeys(): Set<string> {
    const keys = new Set<string>();
    const decays = this.event?.decays ?? [];
    for (const decay of decays) {
      for (const track of decay ?? []) {
        if (track == null) {
          continue;
        }
        const key = this.trackKeyFor(track);
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
    private ngZone: NgZone,
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

    this.setupAnalysisScrollObserver();

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
    this.analysisSectionObserver?.disconnect();
    this.analysisSectionObserver = null;
    this.scrollAfterFlightTimeouts.forEach((id) => window.clearTimeout(id));
    this.scrollAfterFlightTimeouts = [];
    if (this.histogramInfoDialogTimeout != null) {
      window.clearTimeout(this.histogramInfoDialogTimeout);
      this.histogramInfoDialogTimeout = null;
    }
    // Commit entries still in flight so a mid-animation destroy does not drop them.
    for (const pending of this.pendingFlightEntries.values()) {
      this.commitHistogramEntry(pending.entry, pending.trackKeys, pending.eventKey);
    }
    this.pendingFlightEntries.clear();
  }

  /**
   * Smooth-scroll to the analysis strip without pinning it under the toolbar.
   * Leaves a detector peek above and keeps the three histograms in frame so
   * the calculator / particle table sit roughly mid-viewport.
   */
  scrollToAnalysis(): void {
    const analysis = this.analysisSectionRef?.nativeElement;
    if (!analysis) {
      return;
    }
    // ~22vh below the top (min clears sticky CERN/app bars; max avoids overshoot on tall screens).
    const topPaddingPx = Math.min(260, Math.max(168, window.innerHeight * 0.22));
    const sidenav = document.querySelector('mat-sidenav-content') as HTMLElement | null;
    const currentScroll = sidenav ? sidenav.scrollTop : window.scrollY;
    const targetScroll = Math.max(0, currentScroll + analysis.getBoundingClientRect().top - topPaddingPx);
    if (sidenav) {
      sidenav.scrollTo({ top: targetScroll, behavior: 'smooth' });
      return;
    }
    window.scrollTo({ top: targetScroll, behavior: 'smooth' });
  }

  /**
   * Smooth-scroll to the absolute top of the page scroll container.
   * Prefer sidenav scrollTop=0 over scrollIntoView — sticky CERN/app toolbars
   * otherwise cover the top edge of the detector.
   */
  scrollToDetector(): void {
    const sidenav = document.querySelector('mat-sidenav-content') as HTMLElement | null;
    if (sidenav) {
      sidenav.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private setupAnalysisScrollObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.analysisSectionInView = false;
      return;
    }
    const target = this.analysisSectionRef?.nativeElement;
    if (!target) {
      return;
    }
    this.analysisSectionObserver?.disconnect();
    this.analysisSectionObserver = new IntersectionObserver(
      ([entry]) => {
        // A sliver of the calculator under a tall detector must NOT hide the FAB.
        // Hide only once the strip has been scrolled up near the top of the viewport.
        const top = entry?.boundingClientRect?.top ?? Number.POSITIVE_INFINITY;
        const reachedAnalysis = top < window.innerHeight * 0.55;
        this.ngZone.run(() => {
          this.analysisSectionInView = reachedAnalysis;
        });
      },
      { threshold: [0, 0.05, 0.1, 0.25, 0.5, 0.75, 1], rootMargin: '0px' }
    );
    this.analysisSectionObserver.observe(target);
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
   * Plays once per browser tab (sessionStorage); skipped on refresh and SPA remounts
   * after it has been seen. A new tab starts a fresh session and shows the intro again.
   */
  get showCollisionVideoIntro(): boolean {
    return (
      this.isDetectorAssemblyInProgress &&
      this.eventReadyForProtonIntro &&
      !this.protonCollisionIntroFinished
    );
  }

  private static isCollisionIntroSeenInSession(): boolean {
    try {
      return (
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(StrangenessVisualAnalysisComponent.COLLISION_INTRO_SEEN_STORAGE_KEY) ===
          '1'
      );
    } catch {
      return false;
    }
  }

  private static markCollisionIntroSeenInSession(): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(
          StrangenessVisualAnalysisComponent.COLLISION_INTRO_SEEN_STORAGE_KEY,
          '1'
        );
      }
    } catch {
      // Private browsing / quota — ignore.
    }
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
    StrangenessVisualAnalysisComponent.markCollisionIntroSeenInSession();
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
      StrangenessVisualAnalysisComponent.isCollisionIntroSeenInSession()
    ) {
      // Assembly already done this page load, or intro already seen in this tab.
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
    // Dataset wipe — discard in-flight adds (do not commit into a dataset about to be cleared).
    this.discardInFlightHistogramAdds();
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
    // Flush before eventID changes so an in-flight Add stays on the event it was claimed for.
    this.flushInFlightHistogramAdds();
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
    // Flush before eventID changes so an in-flight Add stays on the event it was claimed for.
    this.flushInFlightHistogramAdds();
    this.eventID += 1;
    this.scrollToDetector();

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
    if (event?.type == null || (event.type as unknown as string) === '') {
      return;
    }
    const value: VisualAnalysisResultsEntry = {particle: event.type, mass: event.mass};
    // Snapshot before flight / clear — selection may change while the animation runs.
    const trackKeys = this.collectSelectedTrackKeysForHistogram();
    if (trackKeys == null) {
      return;
    }
    const eventKey = String(this.eventID);

    // Claim immediately so a second submit (or re-select during flight) cannot duplicate.
    // Cross-decay mixes are fine — we claim the concrete daughters, not whole V0 groups.
    if (!this.dataService.claimTracksForHistogram(eventKey, trackKeys)) {
      this.clearCalculatorSelection();
      return;
    }
    this.clearCalculatorSelection();

    // Background has no dedicated mass histogram — commit immediately.
    if (event.type === ParticleType.BACKGROUND) {
      this.commitHistogramEntry(value, trackKeys, eventKey);
      return;
    }

    const renderArea = this.eventDisplayHostRef?.nativeElement.querySelector('#render-area') as HTMLElement | null;
    if (!renderArea) {
      this.commitHistogramEntry(value, trackKeys, eventKey);
      return;
    }

    // Measure at the current scroll position (overlay coords stay valid while we smooth-scroll).
    const target = this.massHistograms?.previewBinTarget(event.type, event.mass) ?? null;
    const renderRect = renderArea.getBoundingClientRect();
    if (!target || renderRect.width <= 0 || renderRect.height <= 0) {
      this.commitHistogramEntry(value, trackKeys, eventKey);
      return;
    }

    const pendingId = ++this.nextPendingFlightId;
    this.pendingFlightEntries.set(pendingId, {
      entry: value,
      trackKeys,
      particle: event.type,
      binIndex: target.binIndex,
      eventKey,
    });

    void this.flightService
      .fly(
        { x: renderRect.left + renderRect.width / 2, y: renderRect.top + renderRect.height / 2 },
        { x: target.targetX, y: target.targetY },
        { color: FLIGHT_COLORS[event.type] }
      )
      .then(() => {
        this.ngZone.run(() => {
          const pending = this.pendingFlightEntries.get(pendingId);
          this.pendingFlightEntries.delete(pendingId);
          if (!pending) {
            // Already flushed/discarded (e.g. Next during animation) — do not double-commit.
            return;
          }
          // fly() resolves at landing (not fade-out end) so the bar grows as the ball arrives.
          this.commitHistogramEntry(pending.entry, pending.trackKeys, pending.eventKey);
          requestAnimationFrame(() => {
            this.massHistograms?.pulseBin(pending.particle, pending.binIndex);
            this.maybeShowHistogramInfoDialog();
          });
        });
      });

    // Let the particle leave the detector centre first, then smooth-scroll to the histogram.
    const scrollTimeoutId = window.setTimeout(() => {
      this.scrollAfterFlightTimeouts = this.scrollAfterFlightTimeouts.filter((id) => id !== scrollTimeoutId);
      this.massHistograms?.scrollHistogramIntoView(event.type);
    }, StrangenessVisualAnalysisComponent.SCROLL_AFTER_FLIGHT_START_MS);
    this.scrollAfterFlightTimeouts.push(scrollTimeoutId);
  }

  private commitHistogramEntry(
    value: VisualAnalysisResultsEntry,
    trackKeys: string[],
    eventKey: string = String(this.eventID),
  ): void {
    // Tracks were already claimed in onAddToHistogram; this only appends the histogram entry.
    this.dataService.addVisualAnalysisResult(eventKey, value, trackKeys);
  }

  onRemoveIdentified(index: number): void {
    this.dataService.removeVisualAnalysisResultAt(String(this.eventID), index);
  }

  /**
   * Undo stack: clear calculator tracks first; else cancel the newest in-flight add;
   * else remove the last committed histogram entry (unlocks those decay tracks).
   */
  onUndo(kind: 'selection' | 'histogram' = 'histogram'): void {
    if (kind === 'selection') {
      this.clearCalculatorSelection();
      return;
    }
    if (this.cancelLatestPendingFlight()) {
      return;
    }
    this.dataService.undoLastVisualAnalysisResult(String(this.eventID));
  }

  /** Wipe all identification for the current event and reopen the calculator. */
  onResetEvent(): void {
    this.cancelAllPendingFlights();
    this.dataService.clearVisualAnalysisResultsForEvent(String(this.eventID));
    this.clearCalculatorSelection();
  }

  /** Same dialog config as the toolbar "?" button (`NavComponent`). */
  onOpenInstructions(): void {
    this.dialog.open(InstructionsDialogComponent, {
      data: { component: this.instructionsComponent },
    });
  }

  /** Drop the newest pending flight and release its claimed tracks. */
  private cancelLatestPendingFlight(): boolean {
    if (this.pendingFlightEntries.size === 0) {
      return false;
    }
    let latestId = -1;
    for (const id of this.pendingFlightEntries.keys()) {
      if (id > latestId) {
        latestId = id;
      }
    }
    const pending = this.pendingFlightEntries.get(latestId);
    if (!pending) {
      return false;
    }
    this.pendingFlightEntries.delete(latestId);
    this.dataService.releaseTracksForHistogram(pending.eventKey, pending.trackKeys);
    // Drop delayed histogram scroll — the add will not land.
    this.clearScrollAfterFlightTimeouts();
    return true;
  }

  private cancelAllPendingFlights(): void {
    for (const pending of this.pendingFlightEntries.values()) {
      this.dataService.releaseTracksForHistogram(pending.eventKey, pending.trackKeys);
    }
    this.pendingFlightEntries.clear();
    this.clearScrollAfterFlightTimeouts();
  }

  /**
   * Commit in-flight Adds to the event they were claimed for, then drop animation
   * side-effects (histogram auto-scroll / info dialog). Used on Next/Previous so
   * navigating mid-flight neither loses the particle nor writes into the new event.
   */
  private flushInFlightHistogramAdds(): void {
    for (const pending of this.pendingFlightEntries.values()) {
      this.commitHistogramEntry(pending.entry, pending.trackKeys, pending.eventKey);
    }
    this.pendingFlightEntries.clear();
    this.clearScrollAfterFlightTimeouts();
    if (this.histogramInfoDialogTimeout != null) {
      window.clearTimeout(this.histogramInfoDialogTimeout);
      this.histogramInfoDialogTimeout = null;
    }
  }

  /**
   * Drop in-flight Adds and release their claims (dataset change / full reset paths).
   */
  private discardInFlightHistogramAdds(): void {
    this.cancelAllPendingFlights();
    if (this.histogramInfoDialogTimeout != null) {
      window.clearTimeout(this.histogramInfoDialogTimeout);
      this.histogramInfoDialogTimeout = null;
      this.histogramInfoDialogShownThisLoad = false;
    }
  }

  private clearScrollAfterFlightTimeouts(): void {
    this.scrollAfterFlightTimeouts.forEach((id) => window.clearTimeout(id));
    this.scrollAfterFlightTimeouts = [];
  }

  /** One-shot tip after the first animated add lands in a histogram bar (resets on refresh). */
  private maybeShowHistogramInfoDialog(): void {
    if (typeof window === 'undefined') {
      return;
    }
    if (this.histogramInfoDialogShownThisLoad || this.histogramInfoDialogTimeout != null) {
      return;
    }

    this.histogramInfoDialogTimeout = window.setTimeout(() => {
      this.histogramInfoDialogTimeout = null;
      this.histogramInfoDialogShownThisLoad = true;
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
