import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import katex from 'katex';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-jpsi-instructions',
    templateUrl: './instructions.component.html',
    styleUrls: ['./instructions.component.scss'],
    standalone: false
})
export class InstructionsComponent implements AfterViewInit, OnDestroy {

  @ViewChild('yieldFormula')
  private yieldFormula?: ElementRef<HTMLElement>;

  @ViewChild('raaFormula')
  private raaFormula?: ElementRef<HTMLElement>;

  private langSub?: Subscription;

  constructor(private readonly translate: TranslateService) {}

  ngAfterViewInit(): void {
    this.renderFormulas();
    this.langSub = this.translate.onLangChange.subscribe(() => this.renderFormulas());
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
  }

  private renderFormulas(): void {
    if (this.yieldFormula) {
      katex.render(
        String.raw`Y = \dfrac{N_{\mathrm{J/\psi}}}{(A\times\varepsilon)\, N_{\mathrm{ev}}}`,
        this.yieldFormula.nativeElement,
        { displayMode: true, throwOnError: false, output: 'html' }
      );
    }

    if (this.raaFormula) {
      katex.render(
        String.raw`R_{AA} = \dfrac{Y_{\mathrm{Pb-Pb}}}{N_{\mathrm{coll}} \cdot Y_{\mathrm{pp}}^{\mathrm{ref}}},\quad Y_{\mathrm{pp}}^{\mathrm{ref}} = Y_{\mathrm{pp}}^{(7\,\mathrm{TeV})}\cdot f_{7\to 5.02}`,
        this.raaFormula.nativeElement,
        { displayMode: true, throwOnError: false, output: 'html' }
      );
    }
  }
}
