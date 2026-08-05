import { Component, HostBinding, Input } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';

import {
  ENHANCEMENT_ANTILAMBDA_COLOR,
  ENHANCEMENT_KAON_COLOR,
  ENHANCEMENT_LAMBDA_COLOR,
  StrangenessEnhancementEntry,
} from '../../services/lsa-enhancement.service';

/** Yields and strangeness enhancement per centrality bin (demo layout only). */
@Component({
    selector: 'app-enhancement-results',
    templateUrl: './enhancement-results.component.html',
    styleUrls: ['./enhancement-results.component.scss'],
    standalone: false
})
export class EnhancementResultsComponent {
  @HostBinding('style.--kaon-color')
  readonly kaonColor: string = ENHANCEMENT_KAON_COLOR;

  @HostBinding('style.--lambda-color')
  readonly lambdaColor: string = ENHANCEMENT_LAMBDA_COLOR;

  @HostBinding('style.--antilambda-color')
  readonly antilambdaColor: string = ENHANCEMENT_ANTILAMBDA_COLOR;

  @Input()
  get rows(): StrangenessEnhancementEntry[] { return this._rows; }
  set rows(rows: StrangenessEnhancementEntry[]) {
    this._rows = rows ?? [];
    this.tableRows.data = this._rows;
  }
  private _rows: StrangenessEnhancementEntry[] = [];

  readonly displayedColumns: string[] = [
    'centrality', 'nParticipants', 'nEvents',
    'nKaons', 'effKaons', 'yieldKaons', 'enhKaons',
    'nLambdas', 'effLambdas', 'yieldLambdas', 'enhLambdas',
    'nAntiLambdas', 'effAntiLambdas', 'yieldAntiLambdas', 'enhAntiLambdas'
  ];

  readonly tableRows: MatTableDataSource<StrangenessEnhancementEntry> =
    new MatTableDataSource<StrangenessEnhancementEntry>();
}
