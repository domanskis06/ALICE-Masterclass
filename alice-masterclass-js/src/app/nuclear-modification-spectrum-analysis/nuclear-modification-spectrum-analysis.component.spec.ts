import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { NuclearModificationSpectrumAnalysisComponent } from './nuclear-modification-spectrum-analysis.component';
import { NmfSaTutorialService } from './sa-tutorial/sa-tutorial.service';
import { RaaAnalysisService } from '../services/raa-analysis.service';
import { RaaHistogram, RaaRunResult, RaaSeries } from '../shared/models/raa/spectrum';
import { centralityColor } from '../shared/utils/raa-centrality';

function series(centrality: string, y: number): RaaSeries {
  return {
    id: `raa_${centrality}`,
    label: centrality,
    centrality,
    color: centralityColor(centrality),
    points: [{ x: 5.75, xLow: 5.5, xHigh: 6, y, yErr: 0.1 }],
    unit: 'ratio',
  };
}

function histogram(centrality: string, entries: number): RaaHistogram {
  return {
    edges: [0, 10, 20],
    counts: [entries, 0],
    label: centrality,
    color: centralityColor(centrality),
    centrality,
    entries,
  };
}

function result(overrides: Partial<RaaRunResult> = {}): RaaRunResult {
  return {
    ok: true,
    problems: [],
    ptSpectra: [],
    raa: [],
    rcp: [],
    multiplicity: null,
    multiplicities: [],
    multVsCentrality: null,
    readouts: [],
    reported: [],
    ppReference: null,
    nEvents: null,
    centrality: null,
    ...overrides,
  };
}

describe('NuclearModificationSpectrumAnalysisComponent', () => {
  let fixture: ComponentFixture<NuclearModificationSpectrumAnalysisComponent>;
  let component: NuclearModificationSpectrumAnalysisComponent;
  let next: RaaRunResult;

  beforeEach(async () => {
    next = result();
    const analysis = { run: () => of(next) };
    const tutorial = jasmine.createSpyObj('NmfSaTutorialService', [
      'registerHost',
      'shouldShow',
      'dismiss',
      'clearDismissFlag',
      'startMainTour',
      'startBlockHelpTour',
      'startPlotHelpTour',
      'destroyDriver',
      'notifyRecipeChanged',
      'notifyRunCompleted',
    ]);
    tutorial.shouldShow.and.returnValue(false);

    await TestBed.configureTestingModule({
      declarations: [NuclearModificationSpectrumAnalysisComponent],
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: RaaAnalysisService, useValue: analysis },
        { provide: NmfSaTutorialService, useValue: tutorial },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(false) }) } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(NuclearModificationSpectrumAnalysisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('keeps the classes of earlier runs so they can be compared', () => {
    next = result({ raa: [series('0-5', 0.3)] });
    component.onRun();
    next = result({ raa: [series('40-50', 0.8)] });
    component.onRun();

    expect(component.raa.length).toBe(2);
    expect(component.raa.map((s) => s.centrality)).toEqual(['0-5', '40-50']);
  });

  it('re-running the same class replaces it instead of drawing it twice', () => {
    next = result({ raa: [series('0-5', 0.3)] });
    component.onRun();
    next = result({ raa: [series('0-5', 0.45)] });
    component.onRun();

    expect(component.raa.length).toBe(1);
    expect(component.raa[0].points[0].y).toBe(0.45);
  });

  it('orders the classes from central to peripheral, as the published figure does', () => {
    next = result({ raa: [series('40-50', 0.8)] });
    component.onRun();
    next = result({ raa: [series('0-5', 0.3)] });
    component.onRun();

    expect(component.raa.map((s) => s.centrality)).toEqual(['0-5', '40-50']);
  });

  it('tells the tutorial how many classes are collected', () => {
    const tutorial = TestBed.inject(NmfSaTutorialService) as jasmine.SpyObj<NmfSaTutorialService>;
    next = result({ raa: [series('0-5', 0.3)] });
    component.onRun();
    next = result({ raa: [series('10-20', 0.4)] });
    component.onRun();

    expect(tutorial.notifyRunCompleted).toHaveBeenCalledWith(2, []);
  });

  it('Clear empties the workspace status but keeps the accumulated plots', () => {
    next = result({ raa: [series('0-5', 0.3)], readouts: [] });
    component.onRun();
    component.onClear();

    // The next centrality class starts from a clean canvas and a clean status
    // chip — but a student who already plotted a class must not lose it the
    // moment they clear the workspace to build the next one.
    expect(component.raa).toEqual([series('0-5', 0.3)]);
    expect(component.ok).toBeNull();
    expect(component.problems).toEqual([]);
  });

  it('a failed run reports it instead of leaving the old status', () => {
    const analysis = TestBed.inject(RaaAnalysisService) as unknown as {
      run: () => unknown;
    };
    analysis.run = () => ({ subscribe: (o: { error: () => void }) => o.error() });

    component.onRun();

    expect(component.ok).toBeFalse();
    expect(component.problems.map((p) => p.key)).toEqual(['RUN_FAILED']);
  });

  it('keeps a multiplicity histogram per class so they can be compared', () => {
    // A for-each run fills one per class; a later run for another class must
    // add to them, not replace the lot.
    next = result({ multiplicities: [histogram('0-5', 100), histogram('30-40', 80)] });
    component.onRun();
    next = result({ multiplicities: [histogram('70-80', 60)] });
    component.onRun();

    expect(component.multiplicities.map((h) => h.centrality)).toEqual([
      '0-5',
      '30-40',
      '70-80',
    ]);
  });

  it('re-measuring a class replaces its multiplicity histogram', () => {
    next = result({ multiplicities: [histogram('0-5', 100)] });
    component.onRun();
    next = result({ multiplicities: [histogram('0-5', 250)] });
    component.onRun();

    expect(component.multiplicities.length).toBe(1);
    expect(component.multiplicities[0].entries).toBe(250);
  });
});