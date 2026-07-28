import { Injectable, OnDestroy } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

@Injectable()
export class TranslatedPaginatorIntl extends MatPaginatorIntl implements OnDestroy {
  private readonly langSub: Subscription;

  constructor(private readonly translate: TranslateService) {
    super();
    this.langSub = this.translate.onLangChange.subscribe(() => this.reloadLabels());
    this.reloadLabels();
  }

  ngOnDestroy(): void {
    this.langSub.unsubscribe();
  }

  private reloadLabels(): void {
    this.itemsPerPageLabel = this.translate.instant('PAGINATOR.ITEMS_PER_PAGE');
    this.nextPageLabel = this.translate.instant('PAGINATOR.NEXT_PAGE');
    this.previousPageLabel = this.translate.instant('PAGINATOR.PREVIOUS_PAGE');
    this.firstPageLabel = this.translate.instant('PAGINATOR.FIRST_PAGE');
    this.lastPageLabel = this.translate.instant('PAGINATOR.LAST_PAGE');
    this.getRangeLabel = (page: number, pageSize: number, length: number): string => {
      if (length === 0 || pageSize === 0) {
        return `0 ${this.translate.instant('PAGINATOR.OF_LABEL')} ${length}`;
      }
      const startIndex = page * pageSize;
      const endIndex = Math.min(startIndex + pageSize, length);
      return `${startIndex + 1} – ${endIndex} ${this.translate.instant('PAGINATOR.OF_LABEL')} ${length}`;
    };
    this.changes.next();
  }
}
