import { Component, Input, OnInit } from '@angular/core';

@Component({
    selector: 'app-mass-histograms',
    templateUrl: './mass-histograms.component.html',
    styleUrls: ['./mass-histograms.component.scss'],
    standalone: false
})
export class MassHistogramsComponent implements OnInit {

  @Input()
  kaonMasses: number[] = [];

  @Input()
  lambdaMasses: number[] = [];

  @Input()
  antiLambdaMasses: number[] = [];

  @Input()
  xiMasses: number[] = [];

  @Input()
  antiXiMasses: number[] = [];

  constructor() { }

  ngOnInit(): void {
  }

}
