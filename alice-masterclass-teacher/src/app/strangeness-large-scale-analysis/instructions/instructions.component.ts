import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import katex from 'katex';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-instructions',
    templateUrl: './instructions.component.html',
    styleUrls: ['./instructions.component.scss'],
    standalone: false
})
export class InstructionsComponent implements AfterViewInit, OnDestroy {

  @ViewChild('enhancementFormula')
  private enhancementFormula?: ElementRef<HTMLElement>;

  private langSub?: Subscription;

  constructor(private readonly translate: TranslateService) {}

  ngAfterViewInit(): void {
    this.renderFormula();
    this.langSub = this.translate.onLangChange.subscribe(() => this.renderFormula());
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
  }

  private renderFormula(): void {
    if (!this.enhancementFormula) {
      return;
    }

    const enhancement = this.translate.instant('LARGE_SCALE_ANALYSIS.INSTRUCTIONS.FORMULA_ENHANCEMENT');
    const yieldLabel = this.translate.instant('LARGE_SCALE_ANALYSIS.INSTRUCTIONS.FORMULA_YIELD');
    const nParticipants = this.translate.instant('LARGE_SCALE_ANALYSIS.NO_PARTICIPANTS');
    const formula =
      String.raw`\text{${enhancement}} = \dfrac{\text{${yieldLabel}}/\text{${nParticipants}}}{Y_{\mathrm{pp}}/2}`;

    katex.render(formula, this.enhancementFormula.nativeElement, {
      displayMode: true,
      throwOnError: false,
      output: 'html'
    });
  }
}
