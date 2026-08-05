import { Injectable, inject } from '@angular/core';
import { DEMO_MODE } from './demo.tokens';

/**
 * Read-only view of the demo flag for components and services.
 *
 * When `enabled` is true the app runs as a public standalone demo: no session
 * login, no upload to Django, results persisted in the browser and the extra
 * large-scale-analysis summary. Everything else behaves like the workshop app.
 */
@Injectable({ providedIn: 'root' })
export class DemoConfig {
  readonly enabled: boolean = inject(DEMO_MODE);
}
