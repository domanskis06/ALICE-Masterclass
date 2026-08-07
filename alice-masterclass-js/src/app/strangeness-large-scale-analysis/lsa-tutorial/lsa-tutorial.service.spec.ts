import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { DemoConfig } from '../../shared/demo/demo-config.service';
import { FitService } from '../../shared/services/fit.service';
import { LsaTutorialService } from './lsa-tutorial.service';

describe('LsaTutorialService', () => {
  let service: LsaTutorialService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        LsaTutorialService,
        FitService,
        { provide: DemoConfig, useValue: { enabled: true } },
      ],
    });
    service = TestBed.inject(LsaTutorialService);
  });

  it('shouldShow is true by default in demo', () => {
    expect(service.shouldShow()).toBeTrue();
  });

  it('shouldShow is false when demo is disabled (no auto welcome)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        LsaTutorialService,
        FitService,
        { provide: DemoConfig, useValue: { enabled: false } },
      ],
    });
    const workshopService = TestBed.inject(LsaTutorialService);
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
});
