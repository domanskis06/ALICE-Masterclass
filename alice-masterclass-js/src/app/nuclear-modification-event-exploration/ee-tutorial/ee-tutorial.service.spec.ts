import { TestBed } from '@angular/core/testing';

import { NmfEeTutorialService } from './ee-tutorial.service';

describe('NmfEeTutorialService', () => {
  let service: NmfEeTutorialService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NmfEeTutorialService],
    });
    service = TestBed.inject(NmfEeTutorialService);
    service.registerHost({
      setTourShowAnalyze: () => undefined,
      setFilterBuilderOpen: () => undefined,
      setMarqueeMode: () => undefined,
      ensureCharPanelOpen: () => undefined,
      setPrimaryPickChallenge: () => undefined,
      setNextEventLocked: () => undefined,
      ensureFirstEvent: () => undefined,
    });
  });

  afterEach(() => {
    service.destroyDriver(true);
  });

  it('shouldShow is true by default', () => {
    expect(service.shouldShow()).toBeTrue();
  });

  it('Enter advances the active tour to the next step', async () => {
    service.startMainTour();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.isActive()).toBeTrue();
    const driver = (service as unknown as { driverInstance: { getActiveIndex: () => number; moveNext: () => void } })
      .driverInstance;
    expect(driver.getActiveIndex()).toBe(0);

    const moveNext = spyOn(driver, 'moveNext').and.callThrough();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(moveNext).toHaveBeenCalled();
    expect(driver.getActiveIndex()).toBe(1);
  });

  it('Enter does not advance while focus is in an input', async () => {
    service.startMainTour();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const driver = (service as unknown as { driverInstance: { getActiveIndex: () => number; moveNext: () => void } })
      .driverInstance;
    const moveNext = spyOn(driver, 'moveNext').and.callThrough();

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(moveNext).not.toHaveBeenCalled();
    expect(driver.getActiveIndex()).toBe(0);
    input.remove();
  });

  it('Enter does not advance during the primary-pick challenge', async () => {
    service.startMainTour();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const internal = service as unknown as {
      driverInstance: { getActiveIndex: () => number; moveNext: () => void };
      awaitingPrimaryPicks: boolean;
    };
    internal.awaitingPrimaryPicks = true;
    const moveNext = spyOn(internal.driverInstance, 'moveNext').and.callThrough();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(moveNext).not.toHaveBeenCalled();
  });

  it('Enter does not advance while awaiting filter submit', async () => {
    service.startMainTour();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const internal = service as unknown as {
      driverInstance: { getActiveIndex: () => number; moveNext: () => void };
      awaitingFilterSubmit: boolean;
    };
    internal.awaitingFilterSubmit = true;
    const moveNext = spyOn(internal.driverInstance, 'moveNext').and.callThrough();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(moveNext).not.toHaveBeenCalled();
  });
});
