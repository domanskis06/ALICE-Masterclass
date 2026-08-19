import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  histogramAsSeries,
  NmfSeriesPlotComponent,
} from './series-plot.component';
import { RaaSeries } from '../../shared/models/raa/spectrum';

function series(id: string, ys: number[], color = '#38bdf8'): RaaSeries {
  return {
    id,
    label: id,
    centrality: '0-5',
    color,
    points: ys.map((y, i) => ({
      x: i + 1.5,
      xLow: i + 1,
      xHigh: i + 2,
      y,
      yErr: y * 0.1,
    })),
  };
}

describe('NmfSeriesPlotComponent', () => {
  let fixture: ComponentFixture<NmfSeriesPlotComponent>;
  let component: NmfSeriesPlotComponent;

  const svg = () => fixture.nativeElement.querySelector('svg') as SVGSVGElement;
  const all = (selector: string) => Array.from(svg().querySelectorAll(selector));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NmfSeriesPlotComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(NmfSeriesPlotComponent);
    component = fixture.componentInstance;
  });

  it('shows the empty label instead of empty axes', () => {
    component.series = [];
    component.emptyLabel = 'nothing yet';
    fixture.detectChanges();

    expect(all('.nmf-plot-empty').length).toBe(1);
    expect(svg().textContent).toContain('nothing yet');
    expect(all('circle').length).toBe(0);
  });

  it('draws one marker per point with a vertical and a horizontal error bar', () => {
    component.series = [series('raa_0-5', [0.3, 0.4, 0.5])];
    component.yLog = false;
    fixture.detectChanges();

    expect(all('circle').length).toBe(3);
    // Two bars per point: sqrt(N) vertically, the bin width horizontally.
    expect(all('line.nmf-plot-error').length).toBe(6);
  });

  it('leaves out non-positive points on a logarithmic axis rather than dropping the series', () => {
    component.series = [series('pt_0-5', [10, 0, 5])];
    component.yLog = true;
    fixture.detectChanges();

    expect(all('circle').length).toBe(2);
  });

  it('draws the reference line at one with a label', () => {
    component.series = [series('raa_0-5', [0.3, 1.2])];
    component.yLog = false;
    component.referenceLine = 1;
    fixture.detectChanges();

    const line = all('line.nmf-plot-reference');
    expect(line.length).toBe(1);
    expect(line[0].getAttribute('y1')).toBe(line[0].getAttribute('y2'));
    expect(svg().textContent).toContain('1');
  });

  it('keeps every series and gives each a legend row of its own colour', () => {
    component.series = [
      series('raa_0-5', [0.3, 0.35], '#ff0000'),
      series('raa_40-50', [0.7, 0.75], '#00ff00'),
    ];
    component.yLog = false;
    fixture.detectChanges();

    expect(all('g.nmf-plot-series').length).toBe(2);
    const swatches = all('.nmf-plot-legend rect').map((r) => r.getAttribute('fill'));
    expect(swatches).toEqual(['#ff0000', '#00ff00']);
  });

  it('a fixed y domain is respected, so R_AA plots stay comparable between runs', () => {
    component.series = [series('raa_0-5', [0.3])];
    component.yLog = false;
    component.yDomain = [0, 1.6];
    component.referenceLine = 1;
    fixture.detectChanges();

    const reference = all('line.nmf-plot-reference')[0];
    const marker = all('circle')[0];
    // R_AA = 0.3 must sit below the line at one.
    expect(Number(marker.getAttribute('cy'))).toBeGreaterThan(
      Number(reference.getAttribute('y1')),
    );
  });

  it('step mode outlines the bins instead of drawing markers', () => {
    component.series = [series('mult_0-5', [5, 9, 3])];
    component.mode = 'steps';
    component.yLog = false;
    fixture.detectChanges();

    expect(all('circle').length).toBe(0);
    const path = all('path.nmf-plot-steps');
    expect(path.length).toBe(1);
    // Two vertices per bin.
    expect((path[0].getAttribute('d') ?? '').split('L').length).toBe(6);
  });

  it('labels both axes', () => {
    component.series = [series('raa_0-5', [0.3])];
    component.yLog = false;
    component.xLabel = 'pT (GeV/c)';
    component.yLabel = 'R_AA';
    fixture.detectChanges();

    // `drawLabel` turns `_AA` into a lowered tspan, so the underscore is spent on
    // the markup and never reaches textContent.
    const labels = all('.nmf-plot-axis-label').map((t) => t.textContent);
    expect(labels).toEqual(['pT (GeV/c)', 'RAA']);
    expect(all('.nmf-plot-axis-label .nmf-plot-sub').map((t) => t.textContent)).toEqual(['AA']);
  });

  it('histogramAsSeries turns bin counts into points with sqrt(N) bars', () => {
    const converted = histogramAsSeries({
      edges: [0, 10, 20],
      counts: [4, 9],
      label: '0–5%',
      color: '#fff',
      centrality: '0-5',
      entries: 13,
    });

    expect(converted.points.length).toBe(2);
    expect(converted.points[0]).toEqual({ x: 5, xLow: 0, xHigh: 10, y: 4, yErr: 2 });
    expect(converted.points[1].yErr).toBe(3);
  });
});
