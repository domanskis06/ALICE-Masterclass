import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { DemoConfig } from './demo-config.service';

/**
 * Blocks a route in the public demo build (not ready to show there yet), and
 * lets it through unchanged in the workshop app. Sends demo visitors back to
 * the home page instead of a 404 — most likely a stale bookmark or a typed
 * URL, not intentional exploration of what's missing.
 */
export const demoExcludedGuard: CanActivateFn = () => {
  if (!inject(DemoConfig).enabled) {
    return true;
  }
  return inject(Router).createUrlTree(['/home']);
};
