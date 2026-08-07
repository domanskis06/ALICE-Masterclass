import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';

import { BATCH_SIZE, CompactEvent } from '../models/jpsi.models';
import { JpsiAnalysisStateService } from './jpsi-analysis-state.service';
import { JpsiDataService } from './jpsi-data.service';
import { JpsiPairingService } from './jpsi-pairing.service';
import { JpsiQuickAnalysisService } from './jpsi-quick-analysis.service';
import { JpsiSignalService } from './jpsi-signal.service';

/** One positron and one electron, back to back, giving a pair mass close to 3.0. */
function makeEvent(): CompactEvent {
  return {
    px: Float32Array.from([1.5, -1.5]),
    py: Float32Array.from([0, 0]),
    pz: Float32Array.from([0, 0]),
    p: Float32Array.from([1.5, 1.5]),
    dedx: Float32Array.from([80, 80]),
    sign: Int8Array.from([1, -1]),
  };
}

/** Serves full batches without touching HTTP, and records what was asked for. */
class StubDataService {
  readonly requested: number[] = [];

  getBatch(_datasetId: string, batchIndex: number): Observable<CompactEvent[]> {
    this.requested.push(batchIndex);
    return of(Array.from({ length: BATCH_SIZE }, () => makeEvent()));
  }
}

describe('JpsiQuickAnalysisService', () => {
  const TOTAL_EVENTS = 300;

  let service: JpsiQuickAnalysisService;
  let data: StubDataService;
  let state: JpsiAnalysisStateService;

  beforeEach(() => {
    data = new StubDataService();

    TestBed.configureTestingModule({
      providers: [
        JpsiQuickAnalysisService,
        JpsiAnalysisStateService,
        JpsiPairingService,
        JpsiSignalService,
        { provide: JpsiDataService, useValue: data },
      ],
    });

    service = TestBed.inject(JpsiQuickAnalysisService);
    state = TestBed.inject(JpsiAnalysisStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('limits a preset to the events that are left', () => {
    expect(service.eventsToProcess(200, TOTAL_EVENTS)).toBe(200);
    expect(service.eventsToProcess(1000, TOTAL_EVENTS)).toBe(TOTAL_EVENTS);
  });

  it('treats All as everything still unprocessed', async () => {
    expect(service.eventsToProcess('all', TOTAL_EVENTS)).toBe(300);

    await service.run(100, TOTAL_EVENTS);

    expect(service.eventsToProcess('all', TOTAL_EVENTS)).toBe(200);
  });

  it('appends on repeated runs instead of starting over', async () => {
    await service.run(100, TOTAL_EVENTS);
    expect(state.state.processedCount).toBe(100);

    await service.run(200, TOTAL_EVENTS);
    expect(state.state.processedCount).toBe(300);
    expect(state.state.nextEventIndex).toBe(300);
  });

  it('processes nothing once the dataset is exhausted', async () => {
    await service.run('all', TOTAL_EVENTS);
    expect(state.state.processedCount).toBe(300);

    expect(await service.run(100, TOTAL_EVENTS)).toBe(0);
    expect(state.state.processedCount).toBe(300);
  });

  it('walks through consecutive batches when a preset spans several', async () => {
    await service.run(1000, TOTAL_EVENTS);

    expect(state.state.processedEvents.length).toBe(300);
    expect(data.requested).toEqual([0, 1, 2]);
  });

  it('resumes in the middle of a batch after a partial run', async () => {
    await service.run(100, TOTAL_EVENTS);
    await service.run(100, TOTAL_EVENTS);

    // The second run continues at event 100, which is the start of batch 1.
    expect(data.requested).toEqual([0, 1]);
    expect(state.state.processedCount).toBe(200);
  });

  it('refuses to start a second run while one is in flight', async () => {
    const first = service.run(200, TOTAL_EVENTS);
    const second = await service.run(200, TOTAL_EVENTS);

    expect(second).toBe(0);
    expect(await first).toBe(200);
  });

  it('stops early when cancelled', async () => {
    const running = service.run('all', TOTAL_EVENTS);
    service.cancel();

    await running;

    expect(service.isRunning).toBeFalse();
    expect(state.state.processedCount).toBeLessThan(300);
  });

  it('keeps the events appended before a failing batch', async () => {
    spyOn(data, 'getBatch').and.callFake((_datasetId: string, batchIndex: number) => {
      if (batchIndex === 1) {
        return new Observable<CompactEvent[]>((subscriber) =>
          subscriber.error(new Error('network down'))
        );
      }
      return of(Array.from({ length: BATCH_SIZE }, () => makeEvent()));
    });

    await expectAsync(service.run(200, TOTAL_EVENTS)).toBeRejected();

    // The first batch is deliberately kept so the student does not lose the work.
    expect(state.state.processedCount).toBe(100);
    expect(service.isRunning).toBeFalse();
  });
});
