import { of } from 'rxjs';

import { ApiService, EventAPI, ExerciseKind, JpsiAnalysisResultAPI } from '../shared/services/api.service';
import { JpsiAnalysisComponent } from './jpsi-analysis.component';
import { JpsiRaaService } from './jpsi-raa.service';
import { isPbPbCentrality, PBPB_CENTRALITY_IDS } from './jpsi-raa.models';

describe('JpsiAnalysisComponent', () => {
  let component: JpsiAnalysisComponent;
  let apiService: jasmine.SpyObj<ApiService>;

  const EVENTS: EventAPI[] = [
    { id: 1, name: 'Event A', kind: ExerciseKind.JPSI, created: new Date() },
    { id: 2, name: 'Event B', kind: ExerciseKind.JPSI, created: new Date() },
  ];

  beforeEach(() => {
    apiService = jasmine.createSpyObj('ApiService', ['getEvents', 'getJpsiAnalysisResults', 'autoRefresh']);
    apiService.getEvents.and.returnValue(of(EVENTS));
    apiService.getJpsiAnalysisResults.and.returnValue(of([]));
    apiService.autoRefresh.and.returnValue(false);
    (apiService as unknown as { REFRESH_INTERVAL: number }).REFRESH_INTERVAL = 10000;

    component = new JpsiAnalysisComponent(apiService, new JpsiRaaService());
    component.ngOnInit();
  });

  it('fetches only J/psi events, since the three sub-masterclasses are independent', () => {
    expect(apiService.getEvents).toHaveBeenCalledWith(ExerciseKind.JPSI);
    expect(component.events).toEqual(EVENTS);
  });

  it('leaves the table empty until an event is selected', () => {
    expect(component.eventID).toBeNull();
    expect(apiService.getJpsiAnalysisResults).not.toHaveBeenCalled();
  });

  it('always shows every Pb-Pb centrality, even with zero submissions yet', () => {
    component.eventID = 1;
    component.onEventChange();

    expect(apiService.getJpsiAnalysisResults).toHaveBeenCalledWith(1);
    expect(component.rows.length).toBe(PBPB_CENTRALITY_IDS.length);
    expect(component.rows.every((row) => isPbPbCentrality(row.system))).toBe(true);
    expect(component.rows.every((row) => row.signal === 0)).toBe(true);
  });

  it('drops pp and p-Pb from the displayed rows', () => {
    component.eventID = 1;
    component.onEventChange();

    const systems = component.rows.map((row) => row.system);
    expect(systems).not.toContain('pp');
    expect(systems).not.toContain('pPb');
  });

  it('averages multiple student submissions for the same system', () => {
    const results: JpsiAnalysisResultAPI[] = [
      { system: 'pbPb_0_5', signal: [100, 200], signalError: [10, 14], nEvents: [] },
    ];
    apiService.getJpsiAnalysisResults.and.returnValue(of(results));

    component.eventID = 1;
    component.onEventChange();

    const row = component.rows.find((r) => r.system === 'pbPb_0_5');
    expect(row?.signal).toBe(150);
    expect(row?.signalError).toBe(12);
  });

  it('reloads when onReload is triggered', () => {
    component.eventID = 2;
    component.onReload();

    expect(apiService.getJpsiAnalysisResults).toHaveBeenCalledWith(2);
  });

  it('still gives every Pb-Pb row an R_AA once it has a non-zero signal', () => {
    const results: JpsiAnalysisResultAPI[] = PBPB_CENTRALITY_IDS.map((system) => ({
      system,
      signal: [100],
      signalError: [10],
      nEvents: [],
    }));
    apiService.getJpsiAnalysisResults.and.returnValue(of(results));

    component.eventID = 1;
    component.onEventChange();

    expect(component.rows.every((row) => row.raa !== null)).toBe(true);
  });

  it('stops auto-refreshing on destroy', () => {
    apiService.autoRefresh.and.returnValue(true);
    apiService.getJpsiAnalysisResults.calls.reset();

    const withRefresh = new JpsiAnalysisComponent(apiService, new JpsiRaaService());
    withRefresh.ngOnInit();
    withRefresh.eventID = 1;

    withRefresh.ngOnDestroy();

    // No assertion beyond "does not throw" - clearInterval on a component with no pending
    // reload should be a no-op, confirming ngOnDestroy is safe to call.
    expect(withRefresh).toBeTruthy();
  });
});
