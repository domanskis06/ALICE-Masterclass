import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { AngularModule } from '../shared/angular.module';
import { EventDisplayComponent } from '../shared/components/event-display/event-display.component';
import { FitService } from '../shared/services/fit.service';
import { SharedModule } from '../shared/shared.module';

import { ParticleMassComponent } from './particle-mass/particle-mass.component';
import { CalculatorComponent } from './calculator/calculator.component';
import { MassHistogramsComponent } from './mass-histograms/mass-histograms.component';
import { InstructionsComponent } from './instructions/instructions.component';

import { StrangenessVisualAnalysisComponent } from './strangeness-visual-analysis.component';

describe('StrangenessVisualAnalysisComponent', () => {
  let component: StrangenessVisualAnalysisComponent;
  let fixture: ComponentFixture<StrangenessVisualAnalysisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        StrangenessVisualAnalysisComponent,
        ParticleMassComponent,
        CalculatorComponent,
        MassHistogramsComponent,
        InstructionsComponent,
      ],
      imports: [AngularModule, SharedModule, TranslateModule.forRoot()],
      providers: [FitService, provideHttpClient(withInterceptorsFromDi())],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(StrangenessVisualAnalysisComponent);
    component = fixture.componentInstance;
    sessionStorage.clear();
    const assemblySig = component.ALICE_DETECTOR_MODEL.join('\u0000');
    sessionStorage.setItem(EventDisplayComponent.DETECTOR_ASSEMBLY_DONE_STORAGE_KEY, assemblySig);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
