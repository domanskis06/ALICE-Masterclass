import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';

import { DemoConfig } from '../../shared/demo/demo-config.service';
import { InstructionsComponent } from './instructions.component';
import { LsaTutorialService } from '../lsa-tutorial/lsa-tutorial.service';

describe('InstructionsComponent', () => {
  let component: InstructionsComponent;
  let fixture: ComponentFixture<InstructionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ InstructionsComponent ],
      imports: [
        TranslateModule.forRoot()
      ],
      providers: [
        { provide: LsaTutorialService, useValue: jasmine.createSpyObj('LsaTutorialService', ['startMainTour']) },
        { provide: DemoConfig, useValue: { enabled: true } },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } }
      ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(InstructionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
