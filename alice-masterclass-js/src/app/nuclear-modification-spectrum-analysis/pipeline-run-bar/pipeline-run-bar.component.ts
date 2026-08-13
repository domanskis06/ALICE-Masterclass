import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-nmf-pipeline-run-bar',
  templateUrl: './pipeline-run-bar.component.html',
  styleUrls: ['./pipeline-run-bar.component.scss'],
  standalone: false,
})
export class NmfPipelineRunBarComponent {
  @Input() running = false;
  @Input() valid: boolean | null = null;
  @Input() warnings: string[] = [];
  @Output() run = new EventEmitter<void>();
  @Output() clear = new EventEmitter<void>();
}
