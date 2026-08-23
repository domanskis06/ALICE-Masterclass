import {
  MISSION_GROUPS,
  NMF_SA_GATES,
  NMF_SA_STEP_HIST_PT,
  NMF_SA_STEP_LOAD_EVENTS,
  NMF_SA_STEP_RAA,
  flattenRecipeKinds,
} from './sa-tutorial.constants';
import { NmfSaTutorialService } from './sa-tutorial.service';

const missionStep = (labelKey: string) =>
  MISSION_GROUPS.flatMap((group) => group.steps).find((step) => step.labelKey === labelKey)!;

/** Just enough of driver.js's `Driver` surface for `evaluateGate` to call. */
function fakeDriver(activeIndex: number) {
  const state = { index: activeIndex };
  const moveNext = jasmine.createSpy('moveNext').and.callFake(() => {
    state.index += 1;
  });
  return {
    isActive: () => true,
    getActiveIndex: () => state.index,
    refresh: () => undefined,
    moveNext,
  };
}

describe('NmfSaTutorialService', () => {
  let service: NmfSaTutorialService;
  let seeded: unknown[];
  let category: string | null;

  beforeEach(() => {
    seeded = [];
    category = null;
    service = new NmfSaTutorialService();
    service.registerHost({
      clearWorkspace: () => undefined,
      openToolboxCategory: (name) => {
        category = name;
      },
      setRunLocked: () => undefined,
      refreshHost: () => undefined,
    });
  });

  it('shows until dismissed for this session', () => {
    expect(service.shouldShow()).toBeTrue();
    service.dismiss();
    expect(service.shouldShow()).toBeFalse();
  });

  it('flattens for-each bodies when remembering recipe kinds', () => {
    const kinds = flattenRecipeKinds([
      { kind: 'load_tracks' },
      {
        kind: 'for_each_centrality',
        centralityPreset: 'three',
        body: [{ kind: 'fill_hist' }, { kind: 'plot', plotAs: 'raa' }],
      },
    ]);
    expect(kinds).toEqual(['load_tracks', 'for_each_centrality', 'fill_hist', 'plot']);
  });

  it('gates the early tour steps on the new kinds', () => {
    expect(NMF_SA_GATES[NMF_SA_STEP_LOAD_EVENTS].kinds).toEqual([
      'load_events',
      'if_centrality',
      'count_events',
    ]);
    expect(NMF_SA_GATES[NMF_SA_STEP_HIST_PT].kinds).toContain('fill_hist');
    expect(NMF_SA_GATES[NMF_SA_STEP_RAA].kinds).toContain('draw_line_at_one');
  });

  it('advances a gated step only after the blocks are present and Run completed', () => {
    // Without a live driver the evaluateGate is a no-op; still verify notify plumbing.
    service.notifyRecipeChanged([
      { kind: 'load_events' },
      { kind: 'if_centrality', centrality: '0-5' },
      { kind: 'count_events' },
    ]);
    service.notifyRunCompleted(1);
    expect(category).toBeNull();
  });

  it('mission step checkmarks stay checked even after the recipe changes again', () => {
    const step = missionStep('NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.MISSION_STEP_1');
    service.notifyRecipeChanged([
      { kind: 'load_events' },
      { kind: 'if_centrality', centrality: '0-5' },
    ]);
    service.notifyRunCompleted(0);
    expect(service.isMissionStepDone(step)).toBeTrue();

    // Blocks removed, nothing re-run — a live kind/run check would flip this
    // back to false; the sticky checklist must not.
    service.notifyRecipeChanged([]);
    expect(service.isMissionStepDone(step)).toBeTrue();
  });

  it('does not check off multiplicity vs centrality when the run warned it needs all events', () => {
    const step = missionStep('NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.MISSION_STEP_4');
    service.notifyRecipeChanged([
      { kind: 'load_events' },
      { kind: 'if_centrality', centrality: '0-5' },
      { kind: 'plot_mult_vs_centrality' },
    ]);
    service.notifyRunCompleted(0, [
      { key: 'MULT_VS_CENTRALITY_NEEDS_ALL_EVENTS', severity: 'warning' },
    ]);
    expect(service.isMissionStepDone(step)).toBeFalse();

    // Fixed (filter removed) and re-run clean: now it may check off, and stays checked.
    service.notifyRecipeChanged([
      { kind: 'load_events' },
      { kind: 'plot_mult_vs_centrality' },
    ]);
    service.notifyRunCompleted(0);
    expect(service.isMissionStepDone(step)).toBeTrue();
  });

  it('walks through every gate a single Build-it-for-me satisfies at once', (done) => {
    // The whole recipe appears in one go, so the gates of several consecutive
    // steps come true together; the tour has to follow them, not stop after
    // the first. It should stop at the first gate needing a Run.
    const driver = fakeDriver(NMF_SA_STEP_LOAD_EVENTS);
    (service as unknown as { driverInstance: unknown }).driverInstance = driver;

    service.notifyRecipeChanged([
      { kind: 'load_events' },
      { kind: 'if_centrality', centrality: '0-5' },
      { kind: 'count_events' },
      { kind: 'fill_multiplicity' },
    ] as never);

    setTimeout(() => {
      // Advanced off LOAD_EVENTS, then stopped: HIST_MULTIPLICITY needs a Run.
      expect(driver.getActiveIndex()).toBe(NMF_SA_STEP_LOAD_EVENTS + 1);
      done();
    }, 30);
  });

  it('advances exactly one step even when Blockly fires several change events for one drag', (done) => {
    // A single drag-and-drop in Blockly fires BLOCK_CREATE, one or more
    // BLOCK_MOVE, SELECTED, CLICK… — every one of them used to reach
    // notifyRecipeChanged and independently queue its own moveNext(), so a
    // drag that satisfied a gate could fire moveNext three or four times in a
    // row and blow straight through the next gated step's requirements.
    const driver = fakeDriver(NMF_SA_STEP_LOAD_EVENTS);
    (service as unknown as { driverInstance: unknown }).driverInstance = driver;

    const recipe = [
      { kind: 'load_events' },
      { kind: 'if_centrality', centrality: '0-5' },
      { kind: 'count_events' },
    ];
    // Same recipe, notified four times — as Blockly would for one drag.
    service.notifyRecipeChanged(recipe as never);
    service.notifyRecipeChanged(recipe as never);
    service.notifyRecipeChanged(recipe as never);
    service.notifyRecipeChanged(recipe as never);

    setTimeout(() => {
      expect(driver.moveNext).toHaveBeenCalledTimes(1);
      done();
    }, 10);
  });
});
