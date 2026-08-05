import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { AngularModule } from '../../shared/angular.module';
import { SharedModule } from '../../shared/shared.module';

import { DemoConfig } from '../../shared/demo/demo-config.service';
import { VaTutorialService } from '../va-tutorial/va-tutorial.service';
import { InstructionsComponent } from './instructions.component';

describe('InstructionsComponent', () => {
  let component: InstructionsComponent;
  let fixture: ComponentFixture<InstructionsComponent>;
  let tutorialSpy: jasmine.SpyObj<VaTutorialService>;

  beforeEach(async () => {
    tutorialSpy = jasmine.createSpyObj('VaTutorialService', ['isActive', 'startMainTour']);
    tutorialSpy.isActive.and.returnValue(false);

    await TestBed.configureTestingModule({
      declarations: [InstructionsComponent],
      imports: [
        AngularModule,
        SharedModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        { provide: VaTutorialService, useValue: tutorialSpy },
        { provide: DemoConfig, useValue: { enabled: true } },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(InstructionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('disables replay while the tutorial is active', () => {
    tutorialSpy.isActive.and.returnValue(true);
    expect(component.replayDisabled).toBeTrue();
    component.replayTutorial();
    expect(tutorialSpy.startMainTour).not.toHaveBeenCalled();
  });

  it('replays the tutorial when inactive', () => {
    tutorialSpy.isActive.and.returnValue(false);
    component.replayTutorial();
    expect(TestBed.inject(MatDialogRef).close).toHaveBeenCalled();
  });
});
