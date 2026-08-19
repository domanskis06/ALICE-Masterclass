import { Component, OnInit, Type } from '@angular/core';

import {
  ApiService,
  NmfEventClass,
  NmfEventExplorationEntryAPI,
  NmfEventExplorationResultAPI,
  SessionAPI,
} from '../shared/services/api.service';
import { InstructionsProvider } from '../shared/interfaces';
import { NmfInstructionsComponent } from './instructions/instructions.component';
import { StudentSelectedEvent } from './results/results.component';
import { RaaCollectPoint } from './raa-collect-plot/raa-collect-plot.component';

/** One student's part-1 submission, plus the teacher's include/exclude flag. */
export interface NmfStudentResult {
  selected: boolean;
  student: number;
  dataset: number;
  ppEvents: number;
  meanPpMultiplicity: number;
  meanPpMultiplicityMinPt: number;
  byClass: Partial<Record<NmfEventClass, NmfEventExplorationEntryAPI>>;
}

/** The three Pb-Pb classes, in the order the desktop Collect canvas draws them. */
export const NMF_CLASS_ORDER: NmfEventClass[] = [
  NmfEventClass.PBPB_PERIPHERAL,
  NmfEventClass.PBPB_SEMI_CENTRAL,
  NmfEventClass.PBPB_CENTRAL,
];

/** Points of one Collect pad: one centrality class, one of the two pT windows. */
export interface NmfCollectSeries {
  eventClass: NmfEventClass;
  minPt: boolean;
  points: RaaCollectPoint[];
}

@Component({
  selector: 'app-nuclear-modification-event-exploration',
  templateUrl: './nuclear-modification-event-exploration.component.html',
  styleUrls: ['./nuclear-modification-event-exploration.component.scss'],
  standalone: false,
})
export class NuclearModificationEventExplorationComponent
  implements OnInit, InstructionsProvider
{
  instructionsComponent: Type<any> = NmfInstructionsComponent;

  public studentResults: NmfStudentResult[] = [];

  /** Six pads: peripheral / semi-central / central, each for all pT and pT > 1 GeV/c. */
  public collectSeries: NmfCollectSeries[] = [];

  /** Largest student number seen, so all six pads share one x range. */
  public maxStudent = 0;

  public sessionID: number | null = null;
  public sessions: SessionAPI[] = [];

  constructor(private apiService: ApiService) {}

  ngOnInit(): void {
    this.updatePlotData();

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

    this.apiService
      .getNuclearModificationEventExplorationResults(this.sessionID)
      .subscribe((data: NmfEventExplorationResultAPI[]) => {
        this.studentResults = data.map((elm) => ({
          selected: false,
          student: elm.student,
          dataset: elm.dataset,
          ppEvents: elm.ppEvents,
          meanPpMultiplicity: elm.meanPpMultiplicity,
          meanPpMultiplicityMinPt: elm.meanPpMultiplicityMinPt,
          byClass: (elm.entries ?? []).reduce(
            (acc: Partial<Record<NmfEventClass, NmfEventExplorationEntryAPI>>, entry) => {
              acc[entry.eventClass] = entry;
              return acc;
            },
            {},
          ),
        }));

        this.updatePlotData();
      });
  }

  onReload(): void {
    this.reload();
  }

  onStudentSelected(event: StudentSelectedEvent): void {
    for (const elm of this.studentResults) {
      if (elm.student === event.student) {
        elm.selected = event.selected;
      }
    }

    this.updatePlotData();
  }

  onAllSelected(event: boolean): void {
    for (const elm of this.studentResults) {
      elm.selected = event;
    }

    this.updatePlotData();
  }

  private updatePlotData(): void {
    const selected = this.studentResults.filter((elm) => elm.selected);

    this.maxStudent = this.studentResults.reduce(
      (max, elm) => Math.max(max, elm.student),
      0,
    );

    const series: NmfCollectSeries[] = [];

    for (const eventClass of NMF_CLASS_ORDER) {
      for (const minPt of [false, true]) {
        const points: RaaCollectPoint[] = [];

        for (const elm of selected) {
          const entry = elm.byClass[eventClass];
          if (!entry) {
            continue;
          }
          const value = minPt ? entry.raaMinPt : entry.raa;
          if (!Number.isFinite(value)) {
            continue;
          }
          points.push({ student: elm.student, value });
        }

        series.push({ eventClass, minPt, points });
      }
    }

    this.collectSeries = series;
  }
}
