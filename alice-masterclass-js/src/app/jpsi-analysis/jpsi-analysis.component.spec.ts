import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';

import { CompactEvent, JpsiManifest } from './models/jpsi.models';
import { JpsiAnalysisComponent } from './jpsi-analysis.component';
import { JpsiAnalysisModule } from './jpsi-analysis.module';
import { JpsiAnalysisStateService } from './services/jpsi-analysis-state.service';
import { JpsiDataService } from './services/jpsi-data.service';
import { JpsiTutorialService } from './services/jpsi-tutorial.service';

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

    // The welcome dialog is opened once per tab; specs must not depend on that order.
    sessionStorage.setItem('alice_mc_jpsi_welcomeSeen_v1', '1');

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

  afterEach(() => {
    sessionStorage.removeItem('alice_mc_jpsi_welcomeSeen_v1');
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

  it('shows the welcome dialog only on the first visit of a tab', () => {
    const dialog = TestBed.inject(MatDialog);
    const open = spyOn(dialog, 'open').and.callThrough();

    // The flag set in beforeEach is still there, so a second component must stay quiet.
    const second = TestBed.createComponent(JpsiAnalysisComponent);
    second.detectChanges();

    expect(open).not.toHaveBeenCalled();
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
