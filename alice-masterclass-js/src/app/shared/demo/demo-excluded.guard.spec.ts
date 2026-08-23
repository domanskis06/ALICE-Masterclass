import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router, UrlTree } from '@angular/router';

import { DEMO_MODE } from './demo.tokens';
import { demoExcludedGuard } from './demo-excluded.guard';

describe('demoExcludedGuard', () => {
  function run(demoMode: boolean): boolean | UrlTree {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule.withRoutes([])],
      providers: [{ provide: DEMO_MODE, useValue: demoMode }],
    });
    return TestBed.runInInjectionContext(() =>
      demoExcludedGuard(null as never, null as never),
    ) as boolean | UrlTree;
  }

  it('lets the route through in the workshop build', () => {
    expect(run(false)).toBeTrue();
  });

  it('redirects to home in the demo build', () => {
    const result = run(true);
    expect(result instanceof UrlTree).toBeTrue();
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(result as UrlTree)).toBe('/home');
  });
});
