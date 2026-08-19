import { AfterViewInit, Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';

import { NmfEventClass } from '../../shared/services/api.service';
import { NmfStudentResult } from '../nuclear-modification-event-exploration.component';

export interface StudentSelectedEvent {
  student: number;
  selected: boolean;
}

@Component({
  selector: 'app-nmf-results',
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss'],
  standalone: false,
})
export class NmfResultsComponent implements AfterViewInit {
  protected readonly NmfEventClass = NmfEventClass;

  public readonly displayedColumns: string[] = [
    'select',
    'student',
    'dataset',
    'meanPp',
    'peripheral',
    'semiCentral',
    'central',
  ];

  @Input()
  get resultsData(): NmfStudentResult[] {
    return this._studentResults;
  }
  set resultsData(studentResults: NmfStudentResult[]) {
    this._studentResults = studentResults;
    this.tableRows.data = this._studentResults;
  }
  private _studentResults: NmfStudentResult[] = [];

  @Output() reloadClickedEvent = new EventEmitter<void>();
  @Output() studentSelectedEvent = new EventEmitter<StudentSelectedEvent>();
  @Output() allSelectedEvent = new EventEmitter<boolean>();

  public tableRows: MatTableDataSource<NmfStudentResult> =
    new MatTableDataSource<NmfStudentResult>();

  @ViewChild(MatPaginator) private paginator?: MatPaginator;

  ngAfterViewInit(): void {
    if (this.paginator) {
      this.tableRows.paginator = this.paginator;
    }
  }

  someSelected(): boolean {
    return (
      this._studentResults.some((elm) => elm.selected) &&
      !this._studentResults.every((elm) => elm.selected)
    );
  }

  allSelected(): boolean {
    return (
      this._studentResults.every((elm) => elm.selected) &&
      this._studentResults.length !== 0
    );
  }

  reloadButtonClicked(): void {
    this.reloadClickedEvent.emit();
  }

  selectCheckboxClicked(elm: NmfStudentResult, checked: boolean): void {
    this.studentSelectedEvent.emit({ student: elm.student, selected: checked });
  }

  allCheckboxClicked(checked: boolean): void {
    this.allSelectedEvent.emit(checked);
  }

  raa(elm: NmfStudentResult, eventClass: NmfEventClass): number | null {
    const value = elm.byClass[eventClass]?.raa;
    return value === undefined ? null : value;
  }

  raaMinPt(elm: NmfStudentResult, eventClass: NmfEventClass): number | null {
    const value = elm.byClass[eventClass]?.raaMinPt;
    return value === undefined ? null : value;
  }
}
