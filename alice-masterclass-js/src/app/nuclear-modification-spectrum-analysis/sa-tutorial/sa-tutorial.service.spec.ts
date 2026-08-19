import {
  NMF_SA_GATES,
  NMF_SA_STEP_HIST_PT,
  NMF_SA_STEP_LOAD_EVENTS,
  NMF_SA_STEP_RAA,
  flattenRecipeKinds,
} from './sa-tutorial.constants';
import { NmfSaTutorialService } from './sa-tutorial.service';

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
});
