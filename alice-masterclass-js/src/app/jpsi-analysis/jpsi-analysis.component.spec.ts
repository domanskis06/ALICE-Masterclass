import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';

import { DemoConfig } from '../shared/demo/demo-config.service';
import { CompactEvent, JpsiManifest } from './models/jpsi.models';
import { PbPbYieldRow } from './models/pbpb-minv.models';
import { JpsiAnalysisComponent } from './jpsi-analysis.component';
import { JpsiAnalysisModule } from './jpsi-analysis.module';
import { JpsiAnalysisStateService } from './services/jpsi-analysis-state.service';
import { JpsiDataService } from './services/jpsi-data.service';
import { JpsiTutorialService } from './services/jpsi-tutorial.service';
import { PbPbMinvStateService } from './services/pbpb-minv-state.service';

const MANIFEST: JpsiManifest = {
  batchSize: 100,
  datasets: [
    { id: 'pp', labelKey: 'JPSI.DATASET.PP', nEvents: 3800, batches: 38 },
    { id: 'pPb', labelKey: 'JPSI.DATASET.PPB', nEvents: 2300, batches: 23 },
  ],
};

class StubDataService {
  getManifest(): Observable<JpsiManifest> {
    return of(MANIFEST);
  }

  getBatch(): Observable<CompactEvent[]> {
    return of([]);
  }
}

describe('JpsiAnalysisComponent', () => {
  let component: JpsiAnalysisComponent;
  let fixture: ComponentFixture<JpsiAnalysisComponent>;
  let state: JpsiAnalysisStateService;
  let tutorial: jasmine.SpyObj<JpsiTutorialService>;

  beforeEach(async () => {
    tutorial = jasmine.createSpyObj('JpsiTutorialService', [
      'shouldShow',
      'dismiss',
      'startMainTour',
      'destroyDriver',
      'notifyDatasetSwitched',
      'notifyRunStarted',
      'notifyCutsChanged',
      'notifySubtracted',
      'notifyAccepted',
      'setActiveCollisionSystem',
      'registerViewSwitcher',
    ]);
    // Auto welcome only offers itself in the demo build; specs must not depend on that order.
    tutorial.shouldShow.and.returnValue(false);

    await TestBed.configureTestingModule({
      imports: [JpsiAnalysisModule, TranslateModule.forRoot()],
      providers: [
        { provide: JpsiDataService, useClass: StubDataService },
        { provide: JpsiTutorialService, useValue: tutorial },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(JpsiAnalysisComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(JpsiAnalysisStateService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reads the event counts of the active dataset from the manifest', () => {
    expect(component.totalEvents).toBe(3800);
    expect(component.eventsLeft).toBe(3800);

    component.onDatasetChange('pPb');

    expect(component.totalEvents).toBe(2300);
  });

  it('does not offer the welcome dialog outside the demo build', () => {
    const dialog = TestBed.inject(MatDialog);
    const open = spyOn(dialog, 'open').and.callThrough();

    const second = TestBed.createComponent(JpsiAnalysisComponent);
    second.detectChanges();

    expect(open).not.toHaveBeenCalled();
    second.destroy();
  });

  it('offers the welcome dialog once per session in the demo build', () => {
    tutorial.shouldShow.and.returnValue(true);
    const dialog = TestBed.inject(MatDialog);
    const open = spyOn(dialog, 'open').and.callThrough();

    const second = TestBed.createComponent(JpsiAnalysisComponent);
    second.detectChanges();

    expect(open).toHaveBeenCalled();
    second.destroy();
  });

  it('redraws the residual whenever the state changes', () => {
    const before = component.revision;

    state.appendEvents([
      {
        px: Float32Array.from([1.5, -1.5]),
        py: Float32Array.from([0, 0]),
        pz: Float32Array.from([0, 0]),
        p: Float32Array.from([1.5, 1.5]),
        dedx: Float32Array.from([80, 80]),
        sign: Int8Array.from([1, -1]),
      },
    ]);
    component.onAcceptSelectedRange({
      pMin: 0.1,
      pMax: 10,
      dedxMin: 20,
      dedxMax: 140,
    });

    expect(component.revision).toBeGreaterThan(before);
    expect(component.residual.reduce((sum, v) => sum + v, 0)).toBe(1);
  });

  it('tells the tour about the steps the student completes', () => {
    component.onAcceptSelectedRange({ pMin: 0.6, pMax: 10, dedxMin: 70, dedxMax: 90 });
    expect(tutorial.notifyCutsChanged).toHaveBeenCalled();

    component.onDatasetChange('pPb');
    expect(tutorial.notifyDatasetSwitched).toHaveBeenCalled();
  });

  it('does not switch datasets while an analysis run is in flight', () => {
    spyOnProperty(component.quickAnalysis, 'isRunning').and.returnValue(true);

    component.onDatasetChange('pPb');

    expect(component.activeDataset).toBe('pp');
    expect(tutorial.notifyDatasetSwitched).not.toHaveBeenCalled();
  });

  it('resets in-progress work but keeps accepted rows when the route is left', () => {
    state.appendEvents([
      {
        px: Float32Array.from([1.5, -1.5]),
        py: Float32Array.from([0, 0]),
        pz: Float32Array.from([0, 0]),
        p: Float32Array.from([1.5, 1.5]),
        dedx: Float32Array.from([80, 80]),
        sign: Int8Array.from([1, -1]),
      },
    ]);
    state.acceptSelectedRange({ pMin: 0.1, pMax: 10, dedxMin: 70, dedxMax: 90 });
    state.subtractBackground();
    state.setMassWindow([2.9, 3.1]);
    state.runFit();
    state.acceptResult();
    expect(state.state.tableRow).not.toBeNull();

    fixture.destroy();

    expect(state.state.tableRow).not.toBeNull();
    expect(state.state.processedCount).toBe(0);
    expect(state.state.appliedCut).toBeNull();
    expect(state.state.cut.dedxMin).toBe(20);
    expect(state.state.panelMode).toBe('explore');
  });
});

describe('JpsiAnalysisComponent (demo build)', () => {
  let component: JpsiAnalysisComponent;
  let fixture: ComponentFixture<JpsiAnalysisComponent>;
  let pbPbState: PbPbMinvStateService;

  const acceptedRow = (centralityId: PbPbYieldRow['centralityId']): PbPbYieldRow => ({
    centralityId,
    centralityLabel: `Pb-Pb ${centralityId}`,
    fit: {
      backgroundFitRange: [0, 1],
      signalWindow: [0, 1],
      pol1: [0, 0],
      total: 1000,
      residualBackground: 0,
      combinatorialBackground: 0,
      background: 0,
      signal: 1000,
      signalError: 32,
      signalToBackground: null,
      significance: 0,
    },
    published: {
      nTotal: 0,
      nTotalErr: 0,
      nBkg: 0,
      nBkgErr: 0,
      nJpsi: 0,
      nJpsiErr: 0,
      sOverB: 0,
      significance: 0,
      significanceNote: '',
    },
    acceptedAt: 0,
  });

  beforeEach(async () => {
    const tutorial = jasmine.createSpyObj('JpsiTutorialService', [
      'shouldShow',
      'dismiss',
      'startMainTour',
      'destroyDriver',
      'notifyDatasetSwitched',
      'notifyRunStarted',
      'notifyCutsChanged',
      'notifySubtracted',
      'notifyAccepted',
      'setActiveCollisionSystem',
      'registerViewSwitcher',
    ]);
    tutorial.shouldShow.and.returnValue(false);

    await TestBed.configureTestingModule({
      imports: [JpsiAnalysisModule, TranslateModule.forRoot()],
      providers: [
        { provide: JpsiDataService, useClass: StubDataService },
        { provide: JpsiTutorialService, useValue: tutorial },
        { provide: DemoConfig, useValue: { enabled: true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(JpsiAnalysisComponent);
    component = fixture.componentInstance;
    pbPbState = TestBed.inject(PbPbMinvStateService);
    fixture.detectChanges();
  });

  it('renders the ported Results table / R_AA plot instead of the workshop upload buttons', () => {
    expect(component.demo).toBeTrue();

    const compiled: HTMLElement = fixture.nativeElement;
    expect(compiled.querySelector('#jpsi-tour-upload-button')).toBeNull();
    expect(compiled.querySelector('#jpsi-tour-pbpb-upload-button')).toBeNull();
    expect(compiled.querySelector('#jpsi-demo-results-table')).not.toBeNull();
    expect(compiled.querySelector('#jpsi-demo-raa-plot')).not.toBeNull();
  });

  it('refreshes the R_AA rows/plot after accepting a Pb-Pb fit', () => {
    expect(component.raaRows.every((row) => !row.measured)).toBeTrue();

    spyOnProperty(pbPbState, 'rows', 'get').and.returnValue([acceptedRow('pbPb_0_5')]);
    component.onAcceptPbPbResult();

    const row = component.raaRows.find((r) => r.centralityId === 'pbPb_0_5');
    expect(row?.measured).toBeTrue();
    expect(row?.signal).toBe(1000);
    expect(component.raaPlotData.some((p) => p.measured)).toBeTrue();
  });
});
