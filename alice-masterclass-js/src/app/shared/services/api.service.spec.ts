import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';

import { ApiService, ExerciseKind } from './api.service';

describe('ApiService', () => {
  let service: ApiService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ApiService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('matchesSessionKind', () => {
    it('fails open (matches everything) before the session kind is known', () => {
      expect(service.matchesSessionKind(ExerciseKind.STRANGENESS)).toBeTrue();
      expect(service.matchesSessionKind(ExerciseKind.JPSI)).toBeTrue();
      expect(service.matchesSessionKind(ExerciseKind.RAA)).toBeTrue();
    });

    it('stores the kind returned by check_session on successful authentication, so VA/LSA/JPSI can gate uploads client-side', () => {
      service.authenticate('pw', 0).subscribe();

      const req = httpTestingController.expectOne('check_session/');
      req.flush({ error: false, name: 'SESSION', maxStudents: 15, kind: ExerciseKind.JPSI });

      expect(service.sessionKind).toBe(ExerciseKind.JPSI);
      expect(service.matchesSessionKind(ExerciseKind.JPSI)).toBeTrue();
      expect(service.matchesSessionKind(ExerciseKind.STRANGENESS)).toBeFalse();
    });
  });
});
