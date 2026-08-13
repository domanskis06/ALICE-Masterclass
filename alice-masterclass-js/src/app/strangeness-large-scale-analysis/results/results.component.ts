import { Component, ViewChild, AfterViewInit, Input, Output, EventEmitter } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { ParticleType, CollisionType, CentralityType, LargeScaleAnalysisResultsEntry } from '../../shared/services/api.service';

import { ApiService, ExerciseKind } from '../../shared/services/api.service';

export interface FitResult {
  particle: ParticleType,
  collision: CollisionType,
  centrality: CentralityType,
  signal: number
}
@Component({
    selector: 'app-results',
    templateUrl: './results.component.html',
    styleUrls: ['./results.component.scss'],
    standalone: false
})
export class ResultsComponent implements AfterViewInit {

  readonly displayedColumns: string[] = ['type', 'collision', 'centrality', 'signal', 'actions'];
  readonly minRows: number = 5;

  @ViewChild(MatPaginator)
  paginator: MatPaginator;

  @Input()
  get data(): Map<string, LargeScaleAnalysisResultsEntry> { return this._data; }
  set data(data: Map<string, LargeScaleAnalysisResultsEntry>) {
    this._data = data;

    const newData: Array<FitResult> = [];

    for (let entry of Array.from(this._data.entries())) {
      const value: LargeScaleAnalysisResultsEntry = entry[1];

      newData.push({particle: value.particle, collision: value.collision, centrality: value.centrality, signal: value.signal});
    }

    this.tableRows.data = newData;
  }
  private _data: Map<string, LargeScaleAnalysisResultsEntry> = new Map<string, LargeScaleAnalysisResultsEntry>();

  tableRows: MatTableDataSource<FitResult> = new MatTableDataSource<FitResult>();

  @Output()
  uploadResultsEvent: EventEmitter<any> = new EventEmitter();

  @Output()
  removeResultEvent: EventEmitter<LargeScaleAnalysisResultsEntry> = new EventEmitter<LargeScaleAnalysisResultsEntry>();

  constructor(public apiService: ApiService) { }

  ngAfterViewInit(): void {
    this.tableRows.paginator = this.paginator;
  }

  /** True once the student is logged into a session whose event is not `strangeness` - LSA
   * submissions to it would be rejected server-side anyway (`Event.kind` guard). */
  get wrongExerciseKind(): boolean {
    return !this.apiService.matchesSessionKind(ExerciseKind.STRANGENESS);
  }

  get uploadButtonDisabled(): boolean {
    return !this.apiService.isAuthenticated || this.wrongExerciseKind;
  }

  onUploadButtonClicked(): void {
    this.uploadResultsEvent.emit();
  }

  onRemoveButtonClicked(element: FitResult): void {
    this.removeResultEvent.emit({
      particle: element.particle,
      collision: element.collision,
      centrality: element.centrality,
      signal: element.signal,
    });
  }

}
