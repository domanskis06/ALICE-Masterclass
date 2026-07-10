import { AfterViewInit, ApplicationRef, Component, ElementRef, OnDestroy, OnInit, Type, ViewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { InstructionsProvider } from '../shared/interfaces';
import { BreakpointObserver } from '@angular/cdk/layout';
import { forkJoin, Observable } from 'rxjs';
import { map, shareReplay, filter, take } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { SelectDatasetDialogComponent } from '../select-dataset-dialog/select-dataset-dialog.component';
import { Event, Track, TrackType } from '../shared/models';

import { StrangenessDataService } from '../services/strangeness-data.service';
import { ParticleType, VisualAnalysisResultsEntry } from '../shared/services/api.service';
import { InstructionsComponent } from './instructions/instructions.component';
import { TranslateService } from '@ngx-translate/core';
import { DetectorPartToggleModel, EventDisplayComponent } from '../shared/components/event-display/event-display.component';
import { MassHistogramBinIncrementedEvent } from './mass-histograms/mass-histograms.component';

export interface SubmitHistogramEntry {
  type: ParticleType,
  mass: number
}

interface HistogramFlightParticle {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

@Component({
    selector: 'app-strangeness-visual-analysis',
    templateUrl: './strangeness-visual-analysis.component.html',
    styleUrls: ['./strangeness-visual-analysis.component.scss'],
    standalone: false
})
export class StrangenessVisualAnalysisComponent implements OnInit, AfterViewInit, OnDestroy, InstructionsProvider {
  @ViewChild('visualAnalysisContainer')
  private visualAnalysisContainerRef!: ElementRef<HTMLElement>;

  @ViewChild('eventDisplayHost', {read: ElementRef})
  private eventDisplayHostRef!: ElementRef<HTMLElement>;


  instructionsComponent: Type<any> = InstructionsComponent;

  /** Guided coach while multipart detector assembly is still required this session. */
  vaCoachOverlayVisible = false;
  vaCoachWelcomePhase = true;
  vaCoachVictoryPhase = false;
  vaCoachPieceHintIndex = 0;
  private vaCoachScheduleSub: Subscription | null = null;
  private vaCoachOpenScheduled = false;

  readonly ALICE_DETECTOR_MODEL = [
    'assets/models/alice components/its.glb',
    'assets/models/alice components/tpc.glb',
    'assets/models/alice components/TRD.glb',
    'assets/models/alice components/TOF.glb',
    'assets/models/alice components/EMCal_Dcal.glb',
    'assets/models/alice components/DCAL.glb',
    'assets/models/alice components/PHOS.glb',
    'assets/models/alice components/L3.glb',
  ];

  datasetID: number = SelectDatasetDialogComponent.DEMO;
  eventID: number = 0;
  maxEvents: number = 0;
  event: Event = {tracks: [], decays: [], clusters: []};

  particlePos: Track = null;
  particleNeg: Track = null;
  particleBac: Track = null;

  visualDarkMode = false;
  readonly visualLightBackgroundColor = 0xFFFFFF;
  readonly visualDarkBackgroundColor = 0x0a1832;
  flightParticles: HistogramFlightParticle[] = [];
  private nextFlightParticleId = 0;
  private flightParticleTimeouts: number[] = [];

  uploadDisabledDatasets: Array<Number> = [SelectDatasetDialogComponent.DEMO];
  
  isLandscape$: Observable<boolean>;

  get isCurrentEventDone(): boolean {
    return this.dataService.visualAnalysisResults.has(String(this.eventID));
  }

  constructor(
    private breakpointObserver: BreakpointObserver,
    private snackBar: MatSnackBar,
    public dataService: StrangenessDataService,
    private translateService: TranslateService,
    private appRef: ApplicationRef
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
    this.flightParticleTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    this.flightParticleTimeouts = [];
  }

  get assemblyCoachHighlightPath(): string | null {
    if (!this.vaCoachOverlayVisible || this.vaCoachWelcomePhase || this.vaCoachVictoryPhase) return null;
    return this.ALICE_DETECTOR_MODEL[this.vaCoachPieceHintIndex];
  }

  get vaCoachCurrentPiecePresentation(): Pick<DetectorPartToggleModel, 'labelKey' | 'labelParams'> {
    const path = this.ALICE_DETECTOR_MODEL[this.vaCoachPieceHintIndex];
    return EventDisplayComponent.detectorPartPresentation(path);
  }

  onVaCoachWelcomeContinue(): void {
    this.vaCoachWelcomePhase = false;
  }

  onVaCoachVictoryDismiss(): void {
    this.vaCoachOverlayVisible = false;
    this.vaCoachVictoryPhase = false;
  }

  onDetectorAssemblyPiecePlaced(assetPath: string): void {
    if (!this.vaCoachOverlayVisible || this.vaCoachVictoryPhase || this.vaCoachWelcomePhase) return;
    const expected = this.ALICE_DETECTOR_MODEL[this.vaCoachPieceHintIndex];
    if (assetPath !== expected) return;
    const next = this.vaCoachPieceHintIndex + 1;
    if (next >= this.ALICE_DETECTOR_MODEL.length) {
      this.vaCoachVictoryPhase = true;
      return;
    }
    this.vaCoachPieceHintIndex = next;
  }

  private tryScheduleVaCoach(): void {
    if (this.vaCoachOpenScheduled) return;
    if (EventDisplayComponent.isMultipartDetectorStoredComplete(this.ALICE_DETECTOR_MODEL)) return;
    this.vaCoachOpenScheduled = true;
    this.vaCoachOverlayVisible = true;
    this.vaCoachWelcomePhase = true;
    this.vaCoachVictoryPhase = false;
    this.vaCoachPieceHintIndex = 0;
  }

  ngOnInit(): void {
    this.maxEvents = this.dataService.EVENTS_IN_DEMO_DATASET;
    this.loadEvent().subscribe(
      (data: Event) => {
        this.eventChanged();
        this.event = data;
      },
      (error: HttpErrorResponse) => {
      }
    );
  }

  private loadEvent() {
    let datasetNum;

    if (this.datasetID === SelectDatasetDialogComponent.DEMO) {
      datasetNum = this.dataService.DEMO_DATASET_ID;
    } else if (this.datasetID === SelectDatasetDialogComponent.FULL_EVENT) {
      datasetNum = this.dataService.FULL_DATASET_ID;
    } else {
      datasetNum = this.datasetID;
    }

    return this.dataService.getEvent(datasetNum, this.eventID);
  }

  onDatasetChange(newDatasetID: number): void {
    this.dataService.clearVisualAnalysisResults();
    this.datasetID = newDatasetID;

    if (this.datasetID === SelectDatasetDialogComponent.DEMO) {
      this.maxEvents = this.dataService.EVENTS_IN_DEMO_DATASET;
    } else if (this.datasetID === SelectDatasetDialogComponent.FULL_EVENT) {
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

    this.dataService.addVisualAnalysisResult(String(this.eventID), value);
  }

  onHistogramBinIncremented(event: MassHistogramBinIncrementedEvent): void {
    this.spawnParticleFlight(event.targetX, event.targetY);
  }

  private spawnParticleFlight(targetX: number, targetY: number): void {
    const container = this.visualAnalysisContainerRef?.nativeElement;
    const renderArea = this.eventDisplayHostRef?.nativeElement.querySelector('#render-area') as HTMLElement | null;
    if (!container || !renderArea) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const renderRect = renderArea.getBoundingClientRect();
    const particle: HistogramFlightParticle = {
      id: this.nextFlightParticleId++,
      startX: renderRect.left + renderRect.width / 2 - containerRect.left,
      startY: renderRect.top + renderRect.height / 2 - containerRect.top,
      endX: targetX - containerRect.left,
      endY: targetY - containerRect.top,
    };

    this.flightParticles = [...this.flightParticles, particle];
    const timeoutId = window.setTimeout(() => {
      this.flightParticles = this.flightParticles.filter((item) => item.id !== particle.id);
      this.flightParticleTimeouts = this.flightParticleTimeouts.filter((item) => item !== timeoutId);
    }, 850);
    this.flightParticleTimeouts.push(timeoutId);
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
