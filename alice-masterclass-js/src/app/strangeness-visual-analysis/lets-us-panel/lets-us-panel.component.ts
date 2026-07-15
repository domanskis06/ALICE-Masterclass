import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-lets-us-panel',
  templateUrl: './lets-us-panel.component.html',
  styleUrls: ['./lets-us-panel.component.scss'],
  standalone: false,
})
export class LetsUsPanelComponent {
  /** PART_DESC id, e.g. ITS / TPC. */
  @Input() partDescId: string | null = null;
  /** Bullet keys under PART_DESC (B1, B2, …). */
  @Input() bulletKeys: string[] = [];
}
