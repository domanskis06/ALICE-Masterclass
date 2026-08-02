import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RaaQuickRaaEntry } from '../../shared/models/raa/raa';

@Component({
  selector: 'app-nmf-quick-raa',
  templateUrl: './quick-raa.component.html',
  styleUrls: ['./quick-raa.component.scss'],
  standalone: false,
})
export class NmfQuickRaaComponent {
  @Input() entries: RaaQuickRaaEntry[] = [];
  @Input() checkpointDone = false;
  @Output() goSpectrum = new EventEmitter<void>();
}
