import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { FitService } from '../../shared/services/fit.service';
import { LsaTutorialService } from './lsa-tutorial.service';

describe('LsaTutorialService', () => {
  let service: LsaTutorialService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [LsaTutorialService, FitService],
    });
    service = TestBed.inject(LsaTutorialService);
  });

  it('shouldShow is true by default', () => {
    expect(service.shouldShow()).toBeTrue();
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
