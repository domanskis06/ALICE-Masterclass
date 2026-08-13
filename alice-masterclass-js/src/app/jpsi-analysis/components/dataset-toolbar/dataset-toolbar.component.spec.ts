import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { Observable, Subject } from 'rxjs';

import { AngularModule } from '../../../shared/angular.module';
import { SharedModule } from '../../../shared/shared.module';

import { DatasetToolbarComponent } from './dataset-toolbar.component';

/**
 * Never emits — same stall as production while en.json is still in flight. Numeric preset
 * labels must not go through the translate pipe, or MatSelect's OnPush trigger stays blank
 * until the student opens the dropdown.
 */
class PendingTranslateLoader implements TranslateLoader {
  getTranslation(): Observable<Record<string, unknown>> {
    return new Subject<Record<string, unknown>>().asObservable();
  }
}

describe('DatasetToolbarComponent', () => {
  let fixture: ComponentFixture<DatasetToolbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DatasetToolbarComponent],
      imports: [
        AngularModule,
        SharedModule,
        MatProgressBarModule,
        TranslateModule.forRoot({
          loader: { provide: TranslateLoader, useClass: PendingTranslateLoader },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DatasetToolbarComponent);
    fixture.detectChanges();
    // MatSelect applies the bound value in a microtask (_initializeSelection).
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('shows 100 in the events dropdown before translations have loaded', () => {
    const trigger = fixture.debugElement.query(By.css('[data-testid="jpsi-preset"]'));
    expect(trigger.nativeElement.textContent).toContain('100');
    expect(fixture.componentInstance.selectedPreset).toBe(100);
  });
});
