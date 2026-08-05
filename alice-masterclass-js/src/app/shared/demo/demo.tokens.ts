import { InjectionToken } from '@angular/core';
import { AppConfig } from '../../../environments/environment';

/**
 * True only in the public offline build (`environment.demo.ts`).
 *
 * `AppConfig.demoMode` is read here and nowhere else in the app, so tests can
 * flip demo behaviour by overriding this token instead of patching the
 * environment file.
 */
export const DEMO_MODE = new InjectionToken<boolean>('DEMO_MODE', {
  providedIn: 'root',
  factory: () => AppConfig.demoMode === true,
});
