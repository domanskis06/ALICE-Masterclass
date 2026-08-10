import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { DatasetId, SummaryRow } from '../../models/jpsi.models';
import { JpsiAnalysisModule } from '../../jpsi-analysis.module';
import { ComparePanelComponent } from './compare-panel.component';

function makeRow(datasetId: DatasetId, signalToBackground: number | null): SummaryRow {
  return {
    datasetId,
    nEvents: 100,
    windowMin: 2.9,
    windowMax: 3.3,
    unlikeSum: 20,
    likeSum: 10,
    signal: 10,
    signalError: Math.sqrt(30),
    signalToBackground,
    significance: 2,
  };
}

describe('ComparePanelComponent', () => {
  let component: ComparePanelComponent;
  let fixture: ComponentFixture<ComparePanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JpsiAnalysisModule, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(ComparePanelComponent);
    component = fixture.componentInstance;
  });

  it('shows the locked message with fewer than two rows', () => {
    component.rows = [makeRow('pp', 2)];
    fixture.detectChanges();

    const locked = fixture.nativeElement.querySelector('[data-testid="jpsi-compare-locked"]');
    const grid = fixture.nativeElement.querySelector('[data-testid="jpsi-compare-grid"]');
    expect(locked).toBeTruthy();
    expect(grid).toBeFalsy();
  });

  it('renders one column per row when three datasets have results', () => {
    component.rows = [makeRow('pp', 2), makeRow('pPb', 1), makeRow('pbPb', 0.5)];
    fixture.detectChanges();

    const columns = fixture.nativeElement.querySelectorAll('.compare-panel__column');
    expect(columns.length).toBe(3);
  });

  it('flags a strictly decreasing S/B chain as growing background with multiplicity', () => {
    component.rows = [makeRow('pp', 2), makeRow('pPb', 1), makeRow('pbPb', 0.5)];

    expect(component.backgroundGrowsWithMultiplicity).toBeTrue();
  });

  it('rejects the claim when the middle dataset breaks monotonicity', () => {
    component.rows = [makeRow('pp', 2), makeRow('pPb', 3), makeRow('pbPb', 0.5)];

    expect(component.backgroundGrowsWithMultiplicity).toBeFalse();
  });

  it('rejects the claim when a ratio is undefined', () => {
    component.rows = [makeRow('pp', 2), makeRow('pPb', null), makeRow('pbPb', 0.5)];

    expect(component.backgroundGrowsWithMultiplicity).toBeFalse();
  });
});
