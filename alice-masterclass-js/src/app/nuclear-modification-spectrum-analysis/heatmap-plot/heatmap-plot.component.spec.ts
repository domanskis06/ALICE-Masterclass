import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NmfHeatmapPlotComponent } from './heatmap-plot.component';
import { RaaHeatmap } from '../../shared/models/raa/spectrum';

function heatmap(overrides: Partial<RaaHeatmap> = {}): RaaHeatmap {
  return {
    xEdges: [0, 500, 1000, 1500, 2000],
    yEdges: [0, 25, 50, 75, 100],
    cells: [
      { ix: 3, iy: 0, count: 120 },
      { ix: 1, iy: 2, count: 40 },
      { ix: 0, iy: 3, count: 1 },
    ],
    maxCount: 120,
    ...overrides,
  };
}

describe('NmfHeatmapPlotComponent', () => {
  let fixture: ComponentFixture<NmfHeatmapPlotComponent>;
  let component: NmfHeatmapPlotComponent;

  const svg = () => fixture.nativeElement.querySelector('svg') as SVGSVGElement;
  const all = (selector: string) => Array.from(svg().querySelectorAll(selector));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NmfHeatmapPlotComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(NmfHeatmapPlotComponent);
    component = fixture.componentInstance;
  });

  it('shows the empty label when there is no map yet', () => {
    component.heatmap = null;
    component.emptyLabel = 'nothing yet';
    fixture.detectChanges();

    expect(svg().textContent).toContain('nothing yet');
  });

  it('draws one rectangle per filled cell plus the colour bar', () => {
    component.heatmap = heatmap();
    fixture.detectChanges();

    expect(all('rect.nmf-heatmap-cell').length).toBe(3);
    expect(all('.nmf-heatmap-colorbar rect').length).toBeGreaterThan(1);
  });

  it('a denser cell is drawn in a different colour than a sparse one', () => {
    component.heatmap = heatmap();
    fixture.detectChanges();

    const fills = all('rect.nmf-heatmap-cell').map((rect) => rect.getAttribute('fill'));
    expect(new Set(fills).size).toBe(3);
  });

  it('marks the selected centrality class as a band with its label', () => {
    component.heatmap = heatmap({
      highlight: { from: 0, to: 5, centrality: '0-5' },
    });
    fixture.detectChanges();

    const band = all('rect.nmf-heatmap-highlight');
    expect(band.length).toBe(1);
    expect(Number(band[0].getAttribute('height'))).toBeGreaterThan(0);
    expect(svg().textContent).toContain('0–5%');
  });

  it('labels both axes', () => {
    component.heatmap = heatmap();
    component.xLabel = 'multiplicity';
    component.yLabel = 'centrality (%)';
    fixture.detectChanges();

    expect(all('.nmf-plot-axis-label').map((t) => t.textContent)).toEqual([
      'multiplicity',
      'centrality (%)',
    ]);
  });
});
