import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { DemoConfig } from '../../shared/demo/demo-config.service';
import { VaTutorialService } from './va-tutorial.service';

describe('VaTutorialService', () => {
  let service: VaTutorialService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        VaTutorialService,
        { provide: DemoConfig, useValue: { enabled: true } },
      ],
    });
    service = TestBed.inject(VaTutorialService);
  });

  it('shouldShow is true by default in demo', () => {
    expect(service.shouldShow()).toBeTrue();
  });

  it('shouldShow is false when demo is disabled (no auto welcome)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        VaTutorialService,
        { provide: DemoConfig, useValue: { enabled: false } },
      ],
    });
    const workshopService = TestBed.inject(VaTutorialService);
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

  it('destroyDriver leaves shouldShow unchanged when suppressDismissOnDestroy is true', () => {
    service.startMainTour();
    service.destroyDriver(true);
    expect(service.shouldShow()).toBeTrue();
    expect(service.isActive()).toBeFalse();
  });
});
