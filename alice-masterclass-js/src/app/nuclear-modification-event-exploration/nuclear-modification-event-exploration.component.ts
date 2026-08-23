import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  Type,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { forkJoin, Observable } from 'rxjs';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map, shareReplay } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';

import { Event, Track, TrackType } from '../shared/models';
import { RaaEventRole, RaaEventSummary } from '../shared/models/raa/raa';
import { NmfSystem, systemOfRole } from './event-characteristics/event-characteristics.component';
import { InstructionsProvider } from '../shared/interfaces';
import { RaaDataService } from '../services/raa-data.service';
import { ApiService } from '../shared/services/api.service';
import { DemoConfig } from '../shared/demo/demo-config.service';
import { buildEventExplorationSubmission } from '../shared/utils/raa-calc';
import { EventDisplayComponent } from '../shared/components/event-display/event-display.component';
import { InstructionsComponent } from './instructions/instructions.component';
import { NmfEventCharacteristicsComponent } from './event-characteristics/event-characteristics.component';
import { NmfAnalysisEventRecord } from './analysis-panel/analysis-panel.component';
import { NmfEeTutorialService } from './ee-tutorial/ee-tutorial.service';
import { NmfEeTutorialWelcomeDialogComponent } from './ee-tutorial/ee-tutorial-welcome-dialog.component';

/** Desktop `Utility::IsPrimary` / TrackType.SECONDARY — what "Secondary tracks" toggles. */
function isSecondaryTrack(track: Track): boolean {
  if (track.isPrimary === false) {
    return true;
  }
  return track.type === TrackType.SECONDARY;
}

function isPrimaryTrack(track: Track): boolean {
  if (track.isPrimary === true) {
    return true;
  }
  if (track.isPrimary === false) {
    return false;
  }
  return track.type === TrackType.STANDARD;
}

/** Student filter after Blockly submit: charged AND primary. */
function passesPrimaryFilter(track: Track): boolean {
  return isPrimaryTrack(track) && track.sign !== 0;
}

/**
 * The first event of every pack is the 7 TeV pp collision recorded with the
 * magnet off, so its tracks are straight lines. It is there to be looked at and
 * explained, not measured: it belongs to no centrality class, its multiplicity
 * is not comparable with the others, and counting it would bias the pp
 * reference. Excluded from the histograms and from the upload requirement.
 */
function isDemonstrationEvent(index: number): boolean {
  return index === 0;
}

/**
 * Event the tutorial runs its "click every primary" challenge on: the first
 * real collision, right after the magnet-off demonstration. `metadata.json`
 * puts a deliberately low-multiplicity event here so clicking them all is a
 * short exercise rather than a chore.
 */
const NMF_EE_PICK_EVENT_INDEX = 1;

/** Desktop `Raa::EventDisplay::NewEvent` labels — index → i18n key under EVENT_EXPLORATION. */
const EVENT_ROLE_LABEL_KEYS: Record<RaaEventRole, string> = {
  pp7TeV: 'NUCLEAR_MODIFICATION.EVENT_EXPLORATION.TYPE_PP_7TEV',
  pp276TeV: 'NUCLEAR_MODIFICATION.EVENT_EXPLORATION.TYPE_PP_276TEV',
  pbPbPeripheral: 'NUCLEAR_MODIFICATION.EVENT_EXPLORATION.TYPE_PBPB_PERIPHERAL',
  pbPbSemiCentral: 'NUCLEAR_MODIFICATION.EVENT_EXPLORATION.TYPE_PBPB_SEMI_CENTRAL',
  pbPbCentral: 'NUCLEAR_MODIFICATION.EVENT_EXPLORATION.TYPE_PBPB_CENTRAL',
};

/** Fallback when metadata.eventRoles is missing — same mapping as desktop NewEvent(evNo). */
function roleForIndex(index: number): RaaEventRole {
  if (index <= 0) {
    return 'pp7TeV';
  }
  if (index <= 30) {
    return 'pp276TeV';
  }
  if (index === 31) {
    return 'pbPbPeripheral';
  }
  if (index === 32) {
    return 'pbPbSemiCentral';
  }
  return 'pbPbCentral';
}

@Component({
  selector: 'app-nuclear-modification-event-exploration',
  templateUrl: './nuclear-modification-event-exploration.component.html',
  styleUrls: ['./nuclear-modification-event-exploration.component.scss'],
  standalone: false,
})
export class NuclearModificationEventExplorationComponent
  implements OnInit, AfterViewInit, OnDestroy, InstructionsProvider
{
  instructionsComponent: Type<any> = InstructionsComponent;

  @ViewChild(EventDisplayComponent) eventDisplay?: EventDisplayComponent;
  @ViewChild(NmfEventCharacteristicsComponent)
  characteristics?: NmfEventCharacteristicsComponent;

  /** Same multipart list / order as Visual Analysis — layer index drives opacity + renderOrder. */
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

  /** Forced light mode — same canvas colour as Visual Analysis's light theme. */
  readonly lightBackgroundColor = 0xffffff;

  eventIndex = 0;
  event: Event = { tracks: [], decays: [], clusters: [] };
  displayEvent: Event = { tracks: [], decays: [], clusters: [] };
  loading = false;

  private datasetEvents: Record<string, number[]> = {};
  private eventRoles: RaaEventRole[] = [];

  isLandscape$: Observable<boolean>;

  sideViewsShown = false;
  detectorShown = true;
  clustersShown = true;
  axesShown = false;
  tracksShown = true;
  decaysShown = true;
  secondaryTracksShown = true;
  /** Companion to the secondary toggle: hide the tracks the filter keeps. */
  primaryTracksShown = true;
  /**
   * Set once the student's filter has run on this event: the tracks it keeps
   * are drawn in the selected colour, the rejected ones stay in the plain one.
   * Cleared when moving to another event, so each one is analysed fresh.
   */
  filterHighlightActive = false;
  /** Passed to the event display; null until the filter has run on this event. */
  filterSelectedIndices: ReadonlySet<number> | null = null;
  clusterSize = 0.05;
  trackWidth = 2;
  cameraMode: 'centered' | 'free' = 'centered';

  /** Last track clicked in the 3D view (desktop Counter readout). */
  selectedTrack: Track | null = null;

  charPanelOpen = true;
  charPanelFullscreen = false;

  /** null until the student picks a dataset (blank select by default). */
  datasetID: number | null = null;
  datasetOptions: number[] = [];

  private readonly visitedByIndex = new Set<number>();
  private readonly analyzedByIndex = new Set<number>();
  /** Per-index publish records for the part-1 R_AA Analysis tab. */
  private readonly analysisRecords = new Map<number, NmfAnalysisEventRecord>();
  /** Snapshot for the embedded R_AA panel (new array when records change). */
  analysisRecordsList: NmfAnalysisEventRecord[] = [];
  nCollPart1: Record<string, number> = {
    pbPbPeripheral: 6.32,
    pbPbSemiCentral: 438.8,
    pbPbCentral: 1686.87,
  };

  /** 0 = Event Characteristics, 1 = R_AA Analysis. */
  resultsTabIndex = 0;
  filterBuilderOpen = false;
  filterReady = false;
  /** Skip branch only: shows the filter builder's "Build it for me" escape hatch. */
  tutorialSkipped = false;
  /** Workshop path: the hand-picking sequence has been started for this pack. */
  private workshopPickStarted = false;
  marqueeMode = false;
  /** Tutorial: lock Next until every primary on event 1 is clicked. */
  nextEventLocked = false;
  /** Tutorial: click-every-primary challenge on the first event. */
  primaryPickChallengeActive = false;
  private readonly pickedPrimaryIndices = new Set<number>();
  private welcomeDialogOpened = false;
  private datasetPromptOpened = false;
  /** Start the main tour once a dataset event has loaded (after welcome → Start). */
  private pendingTourStart = false;
  /** Skipped tutorial: open the filter builder once a dataset is in place. */
  private pendingFilterPrompt = false;

  /** Który komplet histogramów pokazuje panel charakterystyk. */
  charSystem: NmfSystem = 'pp';
  /** Układy, dla których student widział już pierwsze zderzenie. */
  private systemsSeen = new Set<NmfSystem>();

  /** True while Shift is held — arms the marquee layer so OrbitControls stay free otherwise. */
  shiftHeld = false;
  marqueeActive = false;
  marqueeStartX = 0;
  marqueeStartY = 0;
  marqueeEndX = 0;
  marqueeEndY = 0;

  get hasDatasetSelected(): boolean {
    return this.datasetID != null;
  }

  onDatasetChange(value: number | null): void {
    this.eeTutorial.endDatasetPrompt();
    this.datasetID = value;
    this.eventIndex = 0;
    this.visitedByIndex.clear();
    this.analyzedByIndex.clear();
    this.emptyByIndex.clear();
    this.workshopPickStarted = false;
    this.analysisRecords.clear();
    this.analysisRecordsList = [];
    this.systemsSeen.clear();
    this.charSystem = 'pp';
    this.resultsTabIndex = 0;
    this.characteristics?.resetSession();
    this.selectedTrack = null;
    if (value == null) {
      this.clearDisplayedEvent();
      return;
    }
    this.loadCurrentEvent();
  }

  /** Hidden entirely in the offline demo build, which never uploads to Django. */
  protected readonly demo = inject(DemoConfig).enabled;

  constructor(
    private readonly raaData: RaaDataService,
    private readonly breakpointObserver: BreakpointObserver,
    private readonly router: Router,
    private readonly dialog: MatDialog,
    private readonly eeTutorial: NmfEeTutorialService,
    private readonly destroyRef: DestroyRef,
    private readonly cdr: ChangeDetectorRef,
    protected readonly apiService: ApiService,
    private readonly snackBar: MatSnackBar,
    private readonly translate: TranslateService,
  ) {
    this.isLandscape$ = this.breakpointObserver.observe('(orientation: landscape)').pipe(
      map((result) => result.matches),
      shareReplay(1),
    );

    this.eeTutorial.registerHost({
      setFilterBuilderOpen: (open) => {
        this.filterBuilderOpen = open;
        this.cdr.detectChanges();
      },
      setMarqueeMode: (on) => {
        this.marqueeMode = on;
        if (on) {
          this.filterReady = true;
        }
        this.cdr.detectChanges();
      },
      ensureCharPanelOpen: () => {
        this.charPanelOpen = true;
        this.cdr.detectChanges();
      },
      setResultsTab: (tab) => {
        this.charPanelOpen = true;
        this.resultsTabIndex = tab === 'raa' ? 1 : 0;
        this.cdr.detectChanges();
      },
      refreshHost: () => {
        this.cdr.detectChanges();
      },
      setPrimaryPickChallenge: (active) => {
        this.primaryPickChallengeActive = active;
        if (active) {
          this.pickedPrimaryIndices.clear();
          this.syncPrimaryPickEmphasis();
          // Popover progress node mounts with the step — refresh after paint.
          setTimeout(() => this.reportPrimaryPickProgress(), 0);
        } else {
          this.pickedPrimaryIndices.clear();
          this.eventDisplay?.setEmphasizedTrackIndices([]);
        }
        this.cdr.detectChanges();
      },
      setNextEventLocked: (locked) => {
        this.nextEventLocked = locked;
        this.cdr.detectChanges();
      },
      ensureFirstEvent: () => {
        if (this.eventIndex === NMF_EE_PICK_EVENT_INDEX) {
          return;
        }
        this.eventIndex = NMF_EE_PICK_EVENT_INDEX;
        this.loadCurrentEvent();
      },
      showDemonstrationEvent: () => {
        if (this.eventIndex === 0) {
          return;
        }
        this.eventIndex = 0;
        this.loadCurrentEvent();
      },
    });
  }

  ngOnInit(): void {
    try {
      sessionStorage.setItem(
        EventDisplayComponent.DETECTOR_ASSEMBLY_DONE_STORAGE_KEY,
        this.ALICE_DETECTOR_MODEL.join('\u0000'),
      );
    } catch {
      /* private browsing / quota */
    }

    this.raaData.getMetadata().subscribe((meta) => {
      this.datasetEvents = meta.datasets;
      this.eventRoles = meta.eventRoles ?? [];
      if (meta.nCollPart1) {
        this.nCollPart1 = { ...meta.nCollPart1 };
      }
      this.datasetOptions = Object.keys(meta.datasets)
        .map(Number)
        .sort((a, b) => a - b);
      // Stay on blank selection until the student picks a dataset — no tracks yet.
      this.clearDisplayedEvent();
    });
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      this.eventDisplay?.skipMultipartDetectorAssembly(this.ALICE_DETECTOR_MODEL);
      this.eventDisplay?.hideOuterDetectorPartsAfterAssembly();
      // Assembly start closes the left rail; NMF keeps dataset/options there (right is hidden).
      if (this.eventDisplay) {
        this.eventDisplay.detectorLayersPanelOpened = true;
      }
      // Welcome first (Start / Skip) — same pattern as LSA; resets on full page reload.
      setTimeout(() => this.tryOpenTutorialWelcome(), 320);
    });
  }

  ngOnDestroy(): void {
    this.eeTutorial.destroyDriver(true);
  }

  get currentEventNumbers(): number[] {
    if (this.datasetID == null) {
      return [];
    }
    return this.datasetEvents[this.datasetID] ?? this.datasetEvents[String(this.datasetID)] ?? [];
  }

  get maxEvents(): number {
    return this.currentEventNumbers.length;
  }

  get eventTypeLabelKey(): string {
    const role = this.eventRoles[this.eventIndex] ?? roleForIndex(this.eventIndex);
    return EVENT_ROLE_LABEL_KEYS[role];
  }

  get hasClusters(): boolean {
    return this.event.clusters.length !== 0;
  }

  get hasSecondaryTracks(): boolean {
    return this.event.tracks.some((t) => isSecondaryTrack(t));
  }

  get isCurrentEventDone(): boolean {
    return this.analyzedByIndex.has(this.eventIndex);
  }

  get selectedTrackCharge(): number {
    return this.selectedTrack?.sign ?? 0;
  }

  onTrackClicked(track: Track): void {
    this.selectedTrack = track;
    if (this.primaryPickChallengeActive) {
      this.handleTutorialPrimaryPick(track);
    }
  }

  get nextEventDisabled(): boolean {
    return (
      !this.hasDatasetSelected ||
      this.eventIndex + 1 >= this.maxEvents ||
      this.nextEventLocked
    );
  }

  onSecondaryTracksShownChange(): void {
    this.syncDisplayEvent();
  }

  onPrimaryTracksShownChange(): void {
    this.syncDisplayEvent();
  }

  get allEventsAnalyzed(): boolean {
    const n = this.maxEvents;
    if (n === 0) {
      return false;
    }
    for (let i = 0; i < n; i++) {
      if (isDemonstrationEvent(i)) {
        continue;
      }
      // A handful of converted events genuinely contain no reconstructed
      // tracks, so they can never be marked analysed; requiring them would
      // make the upload unreachable in most datasets.
      if (!this.analyzedByIndex.has(i) && this.eventHasTracks(i) !== false) {
        return false;
      }
    }
    return true;
  }

  /**
   * Tracks known to be empty, by index. Only filled in as events are visited —
   * an unvisited index reports `undefined`, which `allEventsAnalyzed` treats as
   * "still to do".
   */
  private readonly emptyByIndex = new Map<number, boolean>();

  private eventHasTracks(index: number): boolean | undefined {
    const empty = this.emptyByIndex.get(index);
    return empty === undefined ? undefined : !empty;
  }

  onGoSpectrum(): void {
    void this.router.navigate(['/nuclear-modification-spectrum-analysis']);
  }

  onPreviousEvent(): void {
    if (this.eventIndex <= 0) {
      return;
    }
    this.eventIndex -= 1;
    this.loadCurrentEvent();
  }

  onNextEvent(): void {
    if (this.nextEventDisabled) {
      return;
    }
    this.eventIndex += 1;
    this.loadCurrentEvent();
    this.eeTutorial.notifyNextEventNavigated();
  }

  onCameraModeChange(): void {
    queueMicrotask(() => this.eventDisplay?.onCameraModeChange());
  }

  onToggleCharPanel(): void {
    this.charPanelOpen = !this.charPanelOpen;
    if (!this.charPanelOpen) {
      this.charPanelFullscreen = false;
    }
  }

  onToggleFullscreen(): void {
    this.charPanelFullscreen = !this.charPanelFullscreen;
  }

  onHistogramHelp(): void {
    this.charPanelOpen = true;
    if (this.resultsTabIndex === 1) {
      this.eeTutorial.startRaaAnalysisHelpTour();
      return;
    }
    this.resultsTabIndex = 0;
    this.eeTutorial.startHistogramHelpTour();
  }

  onFilterAccepted(): void {
    this.filterReady = true;
    this.eeTutorial.notifyFilterSubmitted();
  }

  /**
   * The "why we do not click forever" note belongs to the moment right after
   * the workshop student has hand-picked one event's primaries — not to every
   * later visit to the builder.
   */
  get showHandPickingNote(): boolean {
    return this.tutorialSkipped && this.workshopPickStarted && !this.filterReady;
  }

  onFilterBuilderClosed(): void {
    // Krzyżyk pojawia się dopiero po przyjęciu filtra (patrz [dismissible]),
    // ale strażnik zostaje: zamknięcie przed tym krokiem przepuściłoby studenta
    // do ćwiczenia bez narzędzia, którego ono wymaga.
    if (!this.filterReady) {
      return;
    }
    this.filterBuilderOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.charPanelFullscreen) {
      this.charPanelFullscreen = false;
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(ev: KeyboardEvent): void {
    if (ev.key === 'Shift') {
      this.shiftHeld = true;
    }
  }

  @HostListener('document:keyup', ['$event'])
  onDocumentKeyUp(ev: KeyboardEvent): void {
    if (ev.key === 'Shift') {
      this.shiftHeld = false;
    }
  }

  @HostListener('window:blur')
  onWindowBlur(): void {
    this.shiftHeld = false;
    if (this.marqueeActive) {
      this.marqueeActive = false;
    }
  }

  onMarqueePointerDown(ev: PointerEvent): void {
    if (!this.filterReady || !ev.shiftKey) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    this.marqueeActive = true;
    this.marqueeStartX = ev.clientX;
    this.marqueeStartY = ev.clientY;
    this.marqueeEndX = ev.clientX;
    this.marqueeEndY = ev.clientY;
  }

  onMarqueePointerMove(ev: PointerEvent): void {
    if (!this.marqueeActive) {
      return;
    }
    this.marqueeEndX = ev.clientX;
    this.marqueeEndY = ev.clientY;
  }

  onMarqueePointerUp(ev: PointerEvent): void {
    if (!this.marqueeActive) {
      return;
    }
    this.marqueeActive = false;
    this.marqueeEndX = ev.clientX;
    this.marqueeEndY = ev.clientY;
    const left = Math.min(this.marqueeStartX, this.marqueeEndX);
    const right = Math.max(this.marqueeStartX, this.marqueeEndX);
    const top = Math.min(this.marqueeStartY, this.marqueeEndY);
    const bottom = Math.max(this.marqueeStartY, this.marqueeEndY);
    if (right - left < 4 || bottom - top < 4) {
      return;
    }
    this.commitMarqueeSelection({ left, top, right, bottom });
  }

  get marqueeBoxStyle(): Record<string, string> {
    const left = Math.min(this.marqueeStartX, this.marqueeEndX);
    const top = Math.min(this.marqueeStartY, this.marqueeEndY);
    const width = Math.abs(this.marqueeEndX - this.marqueeStartX);
    const height = Math.abs(this.marqueeEndY - this.marqueeStartY);
    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    };
  }

  private commitMarqueeSelection(rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }): void {
    const picked = this.eventDisplay?.collectTracksInClientRect(rect) ?? [];
    if (picked.length === 0) {
      return;
    }
    // Marquee is the analyse gesture only. Histograms use the student filter
    // on the whole event (charged + primary); 3D keeps all primaries.
    const accepted = this.event.tracks.filter(passesPrimaryFilter);
    if (!this.analyzedByIndex.has(this.eventIndex)) {
      // The magnet-off demonstration event is shown, not measured — see
      // `isDemonstrationEvent`. Marking it analysed still lights its tick, so
      // the student sees they are done with it; it just contributes nothing.
      if (!isDemonstrationEvent(this.eventIndex)) {
        const role = this.eventRoles[this.eventIndex] ?? roleForIndex(this.eventIndex);
        this.characteristics?.recordAnalyzedEvent(this.event, accepted, role);
        this.recordAnalysisEvent(accepted);
      }
      this.analyzedByIndex.add(this.eventIndex);
    }
    // 3D view: paint what the filter kept instead of deleting what it rejected.
    // Removing the secondaries hid the very thing the filter is about — the
    // student never saw which tracks the rule threw away, only that the picture
    // got emptier. Colouring shows both halves side by side.
    this.filterHighlightActive = true;
    this.syncDisplayEvent();
    this.eeTutorial.notifyEventAnalyzed();
  }

  onCharSystemChange(system: NmfSystem): void {
    this.charSystem = system;
  }

  /**
   * Pierwsze zderzenie danego układu przełącza panel na jego histogramy.
   * Tylko pierwsze: potem student sam decyduje, na co patrzy, i ręczny wybór
   * nie ma prawa uciekać mu spod palca przy każdej zmianie zderzenia.
   */
  private followSystemOfCurrentEvent(): void {
    const role = this.eventRoles[this.eventIndex] ?? roleForIndex(this.eventIndex);
    const system = systemOfRole(role);
    if (this.systemsSeen.has(system)) {
      return;
    }
    this.systemsSeen.add(system);
    this.charSystem = system;
  }

  private maybeOpenDatasetPrompt(): void {
    if (this.datasetPromptOpened || this.hasDatasetSelected) {
      return;
    }
    this.datasetPromptOpened = true;
    this.eeTutorial.startDatasetPrompt();
  }

  /**
   * Start / Skip tutorial chooser — shown on each page load / refresh (in-memory
   * dismiss only; F5 resets it), before the dataset prompt.
   */
  private tryOpenTutorialWelcome(): void {
    if (this.welcomeDialogOpened || !this.eeTutorial.shouldShow()) {
      this.maybeOpenDatasetPrompt();
      return;
    }
    this.welcomeDialogOpened = true;
    this.dialog
      .open(NmfEeTutorialWelcomeDialogComponent, {
        width: '560px',
        autoFocus: true,
        disableClose: true,
        hasBackdrop: true,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((start: boolean | undefined) => {
        if (start === true) {
          if (this.hasDatasetSelected) {
            this.eeTutorial.startMainTour();
          } else {
            this.pendingTourStart = true;
            this.maybeOpenDatasetPrompt();
          }
        } else if (start === false) {
          // Workshop path: the instructor is talking the group through the
          // events, so nothing is forced — no guided tour, no dataset prompt
          // and no filter builder popping up. The student picks a dataset from
          // the menu when told to, and opens the filter builder themselves.
          this.eeTutorial.dismiss();
          this.tutorialSkipped = true;
        } else {
          this.maybeOpenDatasetPrompt();
        }
      });
  }

  private clearDisplayedEvent(): void {
    this.loading = false;
    this.event = { tracks: [], decays: [], clusters: [] };
    this.displayEvent = { tracks: [], decays: [], clusters: [] };
    this.selectedTrack = null;
    this.pickedPrimaryIndices.clear();
    this.filterHighlightActive = false;
    this.filterSelectedIndices = null;
    this.eventDisplay?.setEmphasizedTrackIndices([]);
  }

  private primaryTrackIndices(): number[] {
    const indices: number[] = [];
    this.event.tracks.forEach((track, index) => {
      if (isPrimaryTrack(track)) {
        indices.push(index);
      }
    });
    return indices;
  }

  private handleTutorialPrimaryPick(track: Track & { trackIndex?: number }): void {
    if (this.eventIndex !== NMF_EE_PICK_EVENT_INDEX) {
      return;
    }
    let index = track.trackIndex;
    if (index == null || index < 0 || index >= this.event.tracks.length) {
      index = this.event.tracks.indexOf(track);
    }
    if (index < 0) {
      // Emitted track is a shallow copy from Three.js userData — match by momentum.
      index = this.event.tracks.findIndex(
        (t) => t.px === track.px && t.py === track.py && t.pz === track.pz && t.sign === track.sign,
      );
    }
    if (index < 0) {
      return;
    }
    const source = this.event.tracks[index];
    if (!isPrimaryTrack(source)) {
      return;
    }
    this.pickedPrimaryIndices.add(index);
    this.syncPrimaryPickEmphasis();
    this.reportPrimaryPickProgress();
  }

  private syncPrimaryPickEmphasis(): void {
    this.eventDisplay?.setEmphasizedTrackIndices(this.pickedPrimaryIndices);
  }

  private reportPrimaryPickProgress(): void {
    const total = this.primaryTrackIndices().length;
    this.eeTutorial.notifyPrimaryPickProgress(this.pickedPrimaryIndices.size, total);
  }

  /**
   * Workshop path: on reaching the hand-picking event, hand over to the
   * tutorial's own steps for that stretch — click every primary, move on, hear
   * why nobody does this by hand, and land in the filter builder. Same steps
   * the guided tour uses, so there is one implementation of them.
   */
  private syncWorkshopPickChallenge(): void {
    if (
      !this.tutorialSkipped ||
      this.workshopPickStarted ||
      this.filterReady ||
      this.eeTutorial.isActive() ||
      this.eventIndex !== NMF_EE_PICK_EVENT_INDEX ||
      this.event.tracks.length === 0
    ) {
      return;
    }
    this.workshopPickStarted = true;
    this.eeTutorial.startHandPickingSequence();
  }

  private loadCurrentEvent(): void {
    if (this.datasetID == null) {
      this.clearDisplayedEvent();
      return;
    }
    const eventNumber = this.currentEventNumbers[this.eventIndex];
    if (eventNumber === undefined) {
      this.clearDisplayedEvent();
      return;
    }
    const datasetId = this.datasetID;
    this.visitedByIndex.add(this.eventIndex);
    this.selectedTrack = null;
    // Each event is filtered on its own — carrying the highlight over would
    // colour the next event's tracks before its filter has run.
    this.filterHighlightActive = this.analyzedByIndex.has(this.eventIndex);
    if (!(this.primaryPickChallengeActive && this.eventIndex === NMF_EE_PICK_EVENT_INDEX)) {
      this.pickedPrimaryIndices.clear();
      this.eventDisplay?.setEmphasizedTrackIndices([]);
    }
    this.loading = true;
    this.raaData.getDatasetEvent(datasetId, eventNumber).subscribe({
      next: (ev) => {
        if (this.datasetID !== datasetId) {
          return;
        }
        this.event = ev;
        this.emptyByIndex.set(this.eventIndex, (ev.tracks?.length ?? 0) === 0);
        this.syncDisplayEvent();
        this.syncWorkshopPickChallenge();
        this.loading = false;
        queueMicrotask(() => {
          this.eventDisplay?.skipMultipartDetectorAssembly(this.ALICE_DETECTOR_MODEL);
          this.eventDisplay?.hideOuterDetectorPartsAfterAssembly();
          if (this.primaryPickChallengeActive && this.eventIndex === NMF_EE_PICK_EVENT_INDEX) {
            this.syncPrimaryPickEmphasis();
            this.reportPrimaryPickProgress();
          }
          if (this.pendingTourStart) {
            this.pendingTourStart = false;
            this.eeTutorial.startMainTour();
          }
          this.followSystemOfCurrentEvent();
          if (this.pendingFilterPrompt) {
            this.pendingFilterPrompt = false;
            this.filterBuilderOpen = true;
          }
        });
      },
      error: () => {
        if (this.datasetID !== datasetId) {
          return;
        }
        this.clearDisplayedEvent();
      },
    });
  }

  private syncDisplayEvent(): void {
    // Before analysis: always show the full event (toggle is hidden).
    // After analysis: respect Secondary tracks toggle (default on — the filter
    // now marks its selection by colour, so hiding the rest is a separate,
    // optional step rather than the way the result is shown).
    const showSecondaries = !this.isCurrentEventDone || this.secondaryTracksShown;
    const keep = (t: Track) =>
      (isSecondaryTrack(t) ? showSecondaries : this.primaryTracksShown);
    this.displayEvent =
      showSecondaries && this.primaryTracksShown
        ? this.event
        : { ...this.event, tracks: this.event.tracks.filter(keep) };
    this.filterSelectedIndices = this.buildFilterSelection(this.displayEvent.tracks);
  }

  /** Indices (into the *displayed* track list) the student's filter keeps. */
  private buildFilterSelection(tracks: Track[]): ReadonlySet<number> | null {
    if (!this.filterHighlightActive) {
      return null;
    }
    const selected = new Set<number>();
    tracks.forEach((track, index) => {
      if (passesPrimaryFilter(track)) {
        selected.add(index);
      }
    });
    return selected;
  }

  /** Snapshot multiplicities / p_T for the R_AA Analysis tab. */
  private recordAnalysisEvent(accepted: Track[]): void {
    const role = this.eventRoles[this.eventIndex] ?? roleForIndex(this.eventIndex);
    const ptsOf = (tracks: Track[]) => tracks.map((t) => Math.hypot(t.px, t.py));
    this.analysisRecords.set(this.eventIndex, {
      role,
      multiplicity: accepted.length,
      pts: ptsOf(accepted),
    });
    this.analysisRecordsList = [...this.analysisRecords.values()];
  }

  /**
   * Sends the part-1 R_AA figures to the teacher's Results table — the same
   * numbers the R_AA Analysis tab is already showing, reduced to the payload
   * `SubmitEventExplorationResultsAPI` expects. Mirrors Visual Analysis's own
   * upload button: fire on click, toast while in flight, toast on success.
   */
  onUploadResults(): void {
    const submission = buildEventExplorationSubmission(this.analysisRecordsList, this.nCollPart1);

    forkJoin([
      this.translate.get('PASSWORD.UPLOADING'),
      this.translate.get('PASSWORD.COMPLETED'),
    ]).subscribe(([uploadingTranslation, completedTranslation]) => {
      this.snackBar.open(uploadingTranslation, null, { duration: 800 });

      this.apiService
        .submitEventExplorationResults(this.datasetID ?? 0, submission)
        .subscribe(() => {
          this.snackBar.open(completedTranslation, null, { duration: 800 });
        });
    });
  }
}

/** Multiplicity / high-pT summary for an event (reused once the analysis panel returns). */
export function summarizeEvent(event: Event): RaaEventSummary {
  const tracks = event.tracks ?? [];
  let highPtCount = 0;
  let sumPt = 0;
  for (const t of tracks) {
    const pt = Math.hypot(t.px, t.py);
    sumPt += pt;
    if (pt > 1) {
      highPtCount += 1;
    }
  }
  const multiplicity = tracks.length;
  return {
    multiplicity,
    highPtCount,
    meanPt: multiplicity > 0 ? sumPt / multiplicity : 0,
  };
}
