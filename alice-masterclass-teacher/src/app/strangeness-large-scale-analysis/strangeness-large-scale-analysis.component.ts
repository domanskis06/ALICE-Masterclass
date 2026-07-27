import { Component, OnDestroy, OnInit } from '@angular/core';
import { Pipe, PipeTransform } from '@angular/core';
import { ParticleType, CentralityType, CollisionType, EventAPI, StrangenesLargeScaleAnalysisResultAPI, ApiService } from '../shared/services/api.service';

export interface StrangenessEnhancementEntry {
  centrality: string;
  nParticipants: number;
  nEvents: number;

  nKaons: number;
  effKaons: number;
  yieldKaons: number;
  enhKaons: number;

  nLambdas: number;
  effLambdas: number;
  yieldLambdas: number;
  enhLambdas: number;

  nAntiLambdas: number;
  effAntiLambdas: number;
  yieldAntiLambdas: number;
  enhAntiLambdas: number;
}

export interface StrangenessEnhancementPlotEntry {
  particle: ParticleType;
  nParticipants: number;
  enhancement: number;
}

@Pipe({
    name: 'centralityName',
    standalone: false
})
export class CentralityNamePipe implements PipeTransform {
  transform(key: string): string {
    switch(key) {
      case CentralityType.C000_010:
        return '0 - 10%';
      case CentralityType.C010_020:
        return '10 - 20%';
      case CentralityType.C020_030:
        return '20 - 30%';
      case CentralityType.C030_040:
        return '30 - 40%';
      case CentralityType.C040_050:
        return '40 - 50%';
      case CentralityType.C050_060:
        return '50 - 60%';
      case CentralityType.C060_070:
        return '60 - 70%';
      case CentralityType.C070_080:
        return '70 - 80%';
      default:
        return 'unknown';
    }
  }
}

export const KAON_COLOR: string = "#1F78B4";
export const LAMBDA_COLOR: string = '#33A02C';
export const ANTILAMBDA_COLOR: string = '#E31A1C';

@Component({
    selector: 'app-strangeness-large-scale-analysis',
    templateUrl: './strangeness-large-scale-analysis.component.html',
    styleUrls: ['./strangeness-large-scale-analysis.component.scss'],
    standalone: false
})
export class StrangenessLargeScaleAnalysisComponent implements OnInit, OnDestroy {

  public eventID: number | null = null;
  public events: EventAPI[] = [];

  public entries: StrangenessEnhancementEntry[] = [
    {centrality: CentralityType.C000_010, nParticipants: 360, nEvents: 213, nKaons: 0, effKaons: 0.26, yieldKaons: 0, enhKaons: 0, nLambdas: 0, effLambdas: 0.2,  yieldLambdas: 0, enhLambdas: 0, nAntiLambdas: 0, effAntiLambdas: 0.2,  yieldAntiLambdas: 0, enhAntiLambdas: 0},
    {centrality: CentralityType.C010_020, nParticipants: 260, nEvents: 290, nKaons: 0, effKaons: 0.26, yieldKaons: 0, enhKaons: 0, nLambdas: 0, effLambdas: 0.21, yieldLambdas: 0, enhLambdas: 0, nAntiLambdas: 0, effAntiLambdas: 0.21, yieldAntiLambdas: 0, enhAntiLambdas: 0},
    {centrality: CentralityType.C020_030, nParticipants: 186, nEvents: 302, nKaons: 0, effKaons: 0.29, yieldKaons: 0, enhKaons: 0, nLambdas: 0, effLambdas: 0.22, yieldLambdas: 0, enhLambdas: 0, nAntiLambdas: 0, effAntiLambdas: 0.22, yieldAntiLambdas: 0, enhAntiLambdas: 0},
    {centrality: CentralityType.C030_040, nParticipants: 129, nEvents: 310, nKaons: 0, effKaons: 0.29, yieldKaons: 0, enhKaons: 0, nLambdas: 0, effLambdas: 0.22, yieldLambdas: 0, enhLambdas: 0, nAntiLambdas: 0, effAntiLambdas: 0.22, yieldAntiLambdas: 0, enhAntiLambdas: 0},
    {centrality: CentralityType.C040_050, nParticipants: 85,  nEvents: 302, nKaons: 0, effKaons: 0.29, yieldKaons: 0, enhKaons: 0, nLambdas: 0, effLambdas: 0.22, yieldLambdas: 0, enhLambdas: 0, nAntiLambdas: 0, effAntiLambdas: 0.22, yieldAntiLambdas: 0, enhAntiLambdas: 0},
    {centrality: CentralityType.C050_060, nParticipants: 52,  nEvents: 300, nKaons: 0, effKaons: 0.29, yieldKaons: 0, enhKaons: 0, nLambdas: 0, effLambdas: 0.2,  yieldLambdas: 0, enhLambdas: 0, nAntiLambdas: 0, effAntiLambdas: 0.2,  yieldAntiLambdas: 0, enhAntiLambdas: 0},
    {centrality: CentralityType.C060_070, nParticipants: 30,  nEvents: 315, nKaons: 0, effKaons: 0.35, yieldKaons: 0, enhKaons: 0, nLambdas: 0, effLambdas: 0.2,  yieldLambdas: 0, enhLambdas: 0, nAntiLambdas: 0, effAntiLambdas: 0.2,  yieldAntiLambdas: 0, enhAntiLambdas: 0},
    {centrality: CentralityType.C070_080, nParticipants: 16,  nEvents: 350, nKaons: 0, effKaons: 0.26, yieldKaons: 0, enhKaons: 0, nLambdas: 0, effLambdas: 0.2,  yieldLambdas: 0, enhLambdas: 0, nAntiLambdas: 0, effAntiLambdas: 0.2,  yieldAntiLambdas: 0, enhAntiLambdas: 0},
  ];

  public plotData: StrangenessEnhancementPlotEntry[] = [];

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private apiService: ApiService) { }

  ngOnInit(): void {
    this.apiService.getEvents().subscribe((events: EventAPI[]) => {
      this.events = events;
      if (events.length > 0 && this.eventID === null) {
        this.eventID = events[0].id;
        this.reload();
      }
    });

    if (this.apiService.autoRefresh()) {
      this.refreshTimer = setInterval(() => {
        if (this.eventID !== null) {
          this.reload();
        }
      }, this.apiService.REFRESH_INTERVAL);
    }
  }

  ngOnDestroy(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  onEventChange(): void {
    this.reload();
  }

  onReload(): void {
    this.reload();
  }

  reload(): void {
    if (this.eventID === null) {
      return;
    }

    this.apiService.getStrangenessLargeScaleAnalysisResults(this.eventID).subscribe((res: StrangenesLargeScaleAnalysisResultAPI[]) => {
      const average = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce( (p: number, c: number) => p + c, 0 ) / arr.length;

      this.resetParticleCounts();

      for (let elm of res) {
        if (elm.collision === CollisionType.PBPB) {
          for (let entry of this.entries) {
            if (entry.centrality === elm.centrality) {
              const signalAvg = average(elm.signal);

              switch (elm.particle) {
                case ParticleType.KAON:
                  entry.nKaons = signalAvg;
                  break;
                case ParticleType.LAMBDA:
                  entry.nLambdas = signalAvg;
                  break;
                case ParticleType.ANTI_LAMBDA:
                  entry.nAntiLambdas = signalAvg;
                  break;
                default:
                  break;
              }
            }
          }
        }
      }
      this.calculateFields();
    });
  }

  calculateFields(): void {
    const plotData = [];

    for (let elm of this.entries) {
      elm.yieldKaons = elm.nKaons / (elm.nEvents * elm.effKaons);
      elm.enhKaons = elm.yieldKaons / elm.nParticipants / (0.25 / 2);

      elm.yieldLambdas = elm.nLambdas / (elm.nEvents * elm.effLambdas);
      elm.enhLambdas = elm.yieldLambdas / elm.nParticipants / (0.0617 / 2);

      elm.yieldAntiLambdas = elm.nAntiLambdas / (elm.nEvents * elm.effAntiLambdas);
      elm.enhAntiLambdas = elm.yieldAntiLambdas / elm.nParticipants / (0.0617 / 2);

      plotData.push({ particle: ParticleType.KAON, nParticipants: elm.nParticipants, enhancement:  elm.enhKaons });
      plotData.push({ particle: ParticleType.LAMBDA, nParticipants: elm.nParticipants, enhancement: elm.enhLambdas });
      plotData.push({ particle: ParticleType.ANTI_LAMBDA, nParticipants: elm.nParticipants, enhancement: elm.enhAntiLambdas });
    }

    this.plotData = plotData;
  }

  private resetParticleCounts(): void {
    for (const entry of this.entries) {
      entry.nKaons = 0;
      entry.nLambdas = 0;
      entry.nAntiLambdas = 0;
    }
  }

}
