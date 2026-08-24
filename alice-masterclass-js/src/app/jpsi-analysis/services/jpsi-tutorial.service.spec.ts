import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { DemoConfig } from '../../shared/demo/demo-config.service';
import { JpsiTutorialService } from './jpsi-tutorial.service';

describe('JpsiTutorialService', () => {
  let service: JpsiTutorialService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        JpsiTutorialService,
        { provide: DemoConfig, useValue: { enabled: true } },
      ],
    });
    service = TestBed.inject(JpsiTutorialService);
  });

  it('shouldShow is true by default in demo', () => {
    expect(service.shouldShow()).toBeTrue();
  });

  it('shouldShow is false when demo is disabled (no auto welcome)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        JpsiTutorialService,
        { provide: DemoConfig, useValue: { enabled: false } },
      ],
    });
    const workshopService = TestBed.inject(JpsiTutorialService);
    expect(workshopService.shouldShow()).toBeFalse();
  });

  it('dismiss hides welcome for this page load only', () => {
    service.dismiss();
    expect(service.shouldShow()).toBeFalse();
  });

  it('clearDismissFlag restores shouldShow', () => {
    service.dismiss();
    service.clearDismissFlag();
    expect(service.shouldShow()).toBeTrue();
  });

  it('isActive is false before startMainTour', () => {
    expect(service.isActive()).toBeFalse();
  });

  it('builds a demo-build tour (ending on the R_AA table/plot) without throwing', () => {
    expect(() => service.startMainTour()).not.toThrow();
    service.destroyDriver(true);
    expect(service.isActive()).toBeFalse();
  });

  it('builds a workshop-build tour (ending on the results table) without throwing', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        JpsiTutorialService,
        { provide: DemoConfig, useValue: { enabled: false } },
      ],
    });
    const workshopService = TestBed.inject(JpsiTutorialService);

    expect(() => workshopService.startMainTour()).not.toThrow();
    workshopService.destroyDriver(true);
    expect(workshopService.isActive()).toBeFalse();
  });
});
