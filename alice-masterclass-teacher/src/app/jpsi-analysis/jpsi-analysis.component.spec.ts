import { of } from 'rxjs';

import { ApiService } from '../shared/services/api.service';
import { JpsiAnalysisComponent } from './jpsi-analysis.component';
import { JpsiRaaService } from './jpsi-raa.service';
import { isPbPbCentrality } from './jpsi-raa.models';

describe('JpsiAnalysisComponent', () => {
  let component: JpsiAnalysisComponent;

  beforeEach(() => {
    const fakeApiService = { getEvents: () => of([]) } as unknown as ApiService;
    component = new JpsiAnalysisComponent(fakeApiService, new JpsiRaaService());
    component.ngOnInit();
  });

  it('only shows Pb-Pb centrality rows in the teacher Results table', () => {
    expect(component.rows.length).toBeGreaterThan(0);
    expect(component.rows.every((row) => isPbPbCentrality(row.system))).toBe(true);
  });

  it('drops the sample pp and p-Pb signals from the displayed rows', () => {
    const systems = component.rows.map((row) => row.system);
    expect(systems).not.toContain('pp');
    expect(systems).not.toContain('pPb');
  });

  it('still gives every displayed row an R_AA, since only Pb-Pb rows remain', () => {
    expect(component.rows.every((row) => row.raa !== null)).toBe(true);
  });

  it('keeps producing Pb-Pb-only rows after an event change reshuffles the sample signals', () => {
    component.eventID = 3;
    component.onEventChange();

    expect(component.rows.length).toBeGreaterThan(0);
    expect(component.rows.every((row) => isPbPbCentrality(row.system))).toBe(true);
  });
});
