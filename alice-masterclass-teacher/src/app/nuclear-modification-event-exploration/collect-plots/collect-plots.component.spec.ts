import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { AngularModule } from '../../shared/angular.module';
import { SharedModule } from '../../shared/shared.module';
import { NmfEventClass } from '../../shared/services/api.service';
import { NmfCollectSeries } from '../nuclear-modification-event-exploration.component';
import { RaaCollectPlotComponent } from '../raa-collect-plot/raa-collect-plot.component';

import { NmfCollectPlotsComponent } from './collect-plots.component';

const SERIES: NmfCollectSeries[] = [
  { eventClass: NmfEventClass.PBPB_PERIPHERAL, minPt: false, points: [{ student: 0, value: 0.7 }] },
  { eventClass: NmfEventClass.PBPB_PERIPHERAL, minPt: true, points: [] },
  { eventClass: NmfEventClass.PBPB_SEMI_CENTRAL, minPt: false, points: [] },
  { eventClass: NmfEventClass.PBPB_SEMI_CENTRAL, minPt: true, points: [] },
  { eventClass: NmfEventClass.PBPB_CENTRAL, minPt: false, points: [] },
  { eventClass: NmfEventClass.PBPB_CENTRAL, minPt: true, points: [] },
];

describe('NmfCollectPlotsComponent', () => {
  let component: NmfCollectPlotsComponent;
  let fixture: ComponentFixture<NmfCollectPlotsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NmfCollectPlotsComponent, RaaCollectPlotComponent],
      imports: [AngularModule, SharedModule, TranslateModule.forRoot()],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(NmfCollectPlotsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render one pad per series', () => {
    fixture.componentRef.setInput('series', SERIES);
    fixture.componentRef.setInput('maxStudent', 2);
    fixture.detectChanges();

    const pads = fixture.nativeElement.querySelectorAll('app-raa-collect-plot');
    expect(pads.length).toBe(6);
  });

  it('should give each centrality class its own colour and title', () => {
    const colors = SERIES.map((s) => component.colorOf(s));
    expect(colors[0]).toBe(colors[1]);
    expect(colors[0]).not.toBe(colors[2]);
    expect(component.titleKeyOf(SERIES[4])).toBe('EVENT_EXPLORATION.CENTRAL');
  });

  it('should say when nothing is selected', () => {
    component.series = SERIES.map((s) => ({ ...s, points: [] }));
    expect(component.hasData).toBe(false);

    component.series = SERIES;
    expect(component.hasData).toBe(true);
  });

  it('should key pads by class and pT window', () => {
    expect(component.trackBy(0, SERIES[0])).not.toBe(component.trackBy(1, SERIES[1]));
  });
});
