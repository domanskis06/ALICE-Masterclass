import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';

import { NmfRaaPlotsComponent } from './raa-plots.component';
import { RaaHeatmap, RaaHistogram, RaaSeries } from '../../shared/models/raa/spectrum';
import { centralityColor } from '../../shared/utils/raa-centrality';

function series(centrality: string, unit?: string): RaaSeries {
  return {
    id: `raa_${centrality}`,
    label: centrality,
    centrality,
    color: centralityColor(centrality),
    points: [{ x: 5.75, xLow: 5.5, xHigh: 6, y: 0.3, yErr: 0.05 }],
    unit,
  };
}

const multiplicity: RaaHistogram = {
  edges: [0, 500, 1000],
  counts: [10, 20],
  label: '0–5%',
  color: '#fff',
  centrality: '0-5',
  entries: 30,
};

const map: RaaHeatmap = {
  xEdges: [0, 1000],
  yEdges: [0, 100],
  cells: [{ ix: 0, iy: 0, count: 5 }],
  maxCount: 5,
  highlight: { from: 0, to: 5, centrality: '0-5' },
};

describe('NmfRaaPlotsComponent', () => {
  let fixture: ComponentFixture<NmfRaaPlotsComponent>;
  let component: NmfRaaPlotsComponent;
  let opened: unknown[];

  beforeEach(async () => {
    opened = [];
    await TestBed.configureTestingModule({
      declarations: [NmfRaaPlotsComponent],
      imports: [TranslateModule.forRoot()],
      providers: [
        {
          provide: MatDialog,
          useValue: { open: (_: unknown, config: unknown) => opened.push(config) },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(NmfRaaPlotsComponent);
    component = fixture.componentInstance;
  });

  /** Inputs are set on the instance here, so the change hook has to be called. */
  function render(): void {
    component.ngOnChanges();
    fixture.detectChanges();
  }

  it('draws nothing before the first run', () => {
    fixture.detectChanges();
    expect(component.cards).toEqual([]);
    expect(
      fixture.nativeElement.querySelector('[data-testid="nmf-sa-mission"]'),
    ).toBeTruthy();
  });

  it('hides the mission brief once a plot appears', () => {
    component.raa = [series('0-5')];
    render();
    expect(
      fixture.nativeElement.querySelector('[data-testid="nmf-sa-mission"]'),
    ).toBeNull();
  });

  it('orders the cards the way the analysis is built: events first, then the spectrum', () => {
    component.multiplicity = multiplicity;
    component.multVsCentrality = map;
    component.ptSpectra = [series('0-5', 'counts / event / GeV/c')];
    component.raa = [series('0-5')];
    render();

    expect(component.cards.map((card) => card.key)).toEqual([
      'multiplicity',
      'mult-vs-centrality',
      'pt-spectrum',
      'raa',
    ]);
  });

  it('the R_AA card has no reference line until a series asks for it', () => {
    component.raa = [series('0-5')];
    render();
    expect(component.cards[0].referenceLine).toBeNull();
  });

  it('the R_AA card draws the line at one when the series carries it', () => {
    component.raa = [{ ...series('0-5'), referenceLine: 1 }];
    render();
    expect(component.cards[0].referenceLine).toBe(1);
    expect(component.cards[0].yDomain).toEqual([0, 1.6]);
    expect(component.cards[0].xLog).toBeTrue();
    expect(component.cards[0].yLog).toBeFalse();
  });

  it('the spectrum card names the unit the student actually reached', () => {
    component.ptSpectra = [series('0-5', 'counts / event / GeV/c')];
    render();

    expect(component.cards[0].yLabel).toBe('counts / event / GeV/c');
    expect(component.cards[0].yLog).toBeTrue();
  });

  it('the multiplicity card is a step histogram of the selected class', () => {
    component.multiplicity = multiplicity;
    render();

    const card = component.cards[0];
    expect(card.mode).toBe('steps');
    expect(card.centrality).toBe('0-5');
    expect(card.meta[0].value).toBe('30');
  });

  it('accents each card with its centrality colour and tilts the collision icon', () => {
    component.raa = [series('0-5')];
    render();
    const central = component.cards[0];

    // Only rebuild the cards: re-checking the template after swapping an input
    // by hand trips Angular's dev-mode double check, which is a test artefact.
    component.raa = [series('70-80')];
    component.ngOnChanges();
    const peripheral = component.cards[0];

    expect(component.accent(central)).not.toBe(component.accent(peripheral));
    expect(component.impactOffset(peripheral)).toBeGreaterThan(
      component.impactOffset(central),
    );
  });

  it('clicking a card opens it enlarged', () => {
    component.raa = [series('0-5')];
    render();

    component.openPlot(component.cards[0]);

    expect(opened.length).toBe(1);
  });
});
