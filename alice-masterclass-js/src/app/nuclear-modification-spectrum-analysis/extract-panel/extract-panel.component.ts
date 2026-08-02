import { Component, Input, OnChanges } from '@angular/core';

@Component({
  selector: 'app-nmf-extract-panel',
  templateUrl: './extract-panel.component.html',
  styleUrls: ['./extract-panel.component.scss'],
  standalone: false,
})
export class NmfExtractPanelComponent implements OnChanges {
  @Input() centralityBins: string[] = [];
  @Input() binCount = 0;
  @Input() extract: Record<string, { value: number; error: number }> = {};

  centrality = '0-5';
  binIndex = 0;
  value: number | null = null;
  error: number | null = null;

  ngOnChanges(): void {
    if (this.centralityBins.length && !this.centralityBins.includes(this.centrality)) {
      this.centrality = this.centralityBins[0];
    }
    this.refresh();
  }

  onChange(): void {
    this.refresh();
  }

  private refresh(): void {
    const key = `${this.centrality}|${this.binIndex}`;
    const hit = this.extract[key];
    this.value = hit?.value ?? null;
    this.error = hit?.error ?? null;
  }

  get binIndexes(): number[] {
    return Array.from({ length: Math.max(this.binCount, 0) }, (_, i) => i);
  }
}
