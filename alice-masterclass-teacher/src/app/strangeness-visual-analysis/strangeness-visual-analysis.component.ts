import { Component, OnInit, Type } from '@angular/core';
import { ApiService, SessionAPI, VisualAnalysisResultAPI } from '../shared/services/api.service';
import { InstructionsProvider } from '../shared/interfaces';
import { StudentSelectedEvent } from './results/results.component';
import { InstructionsComponent } from './instructions/instructions.component';

export interface StudentResultAPI {
  student: number,
  dataset: number,
  k0: number[],
  lambda: number[],
  antilambda: number[],
  xi: number[],
  antixi: number[]
}

export interface StudentResult {
  selected: boolean,
  student: number,
  dataset: number,
  k0: number[],
  lambda: number[],
  antilambda: number[],
  xi: number[],
  antixi: number[]
}

@Component({
    selector: 'app-strangeness-visual-analysis',
    templateUrl: './strangeness-visual-analysis.component.html',
    styleUrls: ['./strangeness-visual-analysis.component.scss'],
    standalone: false
})
export class StrangenessVisualAnalysisComponent implements OnInit, InstructionsProvider {

  instructionsComponent: Type<any> = InstructionsComponent;

  public studentResults: StudentResult[] = [];

  public kaonMasses: number[] = [];
  public lambdaMasses: number[] = [];
  public antiLambdaMasses: number[] = [];
  public xiMasses: number[] = [];
  public antiXiMasses: number[] = [];

  public sessionID: number | null = null;
  public sessions: SessionAPI[] = [];

  constructor(private apiService: ApiService) { }

  ngOnInit(): void {
    this.apiService.getSessions().subscribe((sessions: SessionAPI[]) => {
      this.sessions = sessions;
    });
  }

  onSessionChange(): void {
    this.reload();
  }

  reload(): void {
    if (this.sessionID === null) {
      return;
    }

    this.apiService.getStrangenessVisualAnalysisResults(this.sessionID).subscribe((data: VisualAnalysisResultAPI[]) => {
      const newData: StudentResult[] = [];
      for (let elm of data) {
        newData.push({
          selected: false,
          student: elm.student,
          dataset: elm.dataset,
          k0: elm.k0,
          lambda: elm.lambda,
          antilambda: elm.antilambda,
          xi: elm.xi,
          antixi: elm.antixi ?? []
        });
      }
      this.studentResults = newData;

      this.updateHistogramData();
    });
  }

  onReload(): void {
    this.reload();
  }

  onStudentSelected(event: StudentSelectedEvent): void {
    for (let elm of this.studentResults) {
      if (elm.student === event.student) {
        elm.selected = event.selected;
      }
    }
    
    this.updateHistogramData();
  }

  onAllSelected(event: boolean): void {
    for (let elm of this.studentResults) {
      elm.selected = event;
    }
    
    this.updateHistogramData();
  }

  private updateHistogramData(): void {
    const kaonMasses = [];
    const lambdaMasses = [];
    const antiLambdaMasses = [];
    const xiMasses = [];
    const antiXiMasses = [];

    for (let elm of this.studentResults) {
      if (elm.selected) {
        kaonMasses.push(...elm.k0);
        lambdaMasses.push(...elm.lambda);
        antiLambdaMasses.push(...elm.antilambda);
        xiMasses.push(...elm.xi);
        antiXiMasses.push(...elm.antixi);
      }
    }

    this.kaonMasses = kaonMasses;
    this.lambdaMasses = lambdaMasses;
    this.antiLambdaMasses = antiLambdaMasses;
    this.xiMasses = xiMasses;
    this.antiXiMasses = antiXiMasses;
  }

}
