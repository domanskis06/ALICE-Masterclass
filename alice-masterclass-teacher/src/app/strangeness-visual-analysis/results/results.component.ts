import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';

import { StudentResult } from '../strangeness-visual-analysis.component';

export interface StudentSelectedEvent {
  student: number,
  selected: boolean
}

@Component({
    selector: 'app-results',
    templateUrl: './results.component.html',
    styleUrls: ['./results.component.scss'],
    standalone: false
})
export class ResultsComponent implements OnInit {
  public readonly displayedColumns: string[] = ['select', 'student', 'dataset', 'kaonMasses', 'lambdaMasses', 'antiLambdaMasses', 'xiMasses', 'antiXiMasses'];
  
  @Input()
  get resultsData(): StudentResult[] { return this._studentResults; }
  set resultsData(studentResults: StudentResult[]) {
    this._studentResults = studentResults;

    this.tableRows.data = this._studentResults;
  }
  private _studentResults: StudentResult[] = [];

  @Output()
  reloadClickedEvent = new EventEmitter<any>();

  @Output()
  studentSelectedEvent = new EventEmitter<StudentSelectedEvent>();

  @Output()
  allSelectedEvent = new EventEmitter<boolean>();

  public tableRows: MatTableDataSource<StudentResult> = new MatTableDataSource<StudentResult>();

  constructor() { }

  ngOnInit(): void {
  }

  someSelected(): boolean {
    return this._studentResults.some((elm: StudentResult) => elm.selected) && !this._studentResults.every((elm: StudentResult) => elm.selected);
  }

  allSeletected(): boolean {
    return this._studentResults.every((elm: StudentResult) => elm.selected) && this._studentResults.length !== 0;
  }

  reloadButtonClicked(): void {
    this.reloadClickedEvent.emit();
  }

  selectCheckboxClicked(elm: StudentResult, checked: boolean): void {
    this.studentSelectedEvent.emit({student: elm.student, selected: checked});
  }

  allCheckboxClicked(checked: boolean): void {
    this.allSelectedEvent.emit(checked);
  }

}
