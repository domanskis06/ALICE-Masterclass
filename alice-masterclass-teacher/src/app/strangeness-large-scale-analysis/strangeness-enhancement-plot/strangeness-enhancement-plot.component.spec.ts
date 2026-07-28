import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { AngularModule } from '../../shared/angular.module';
import { SharedModule } from '../../shared/shared.module';

import { StrangenessEnhancementPlotComponent } from './strangeness-enhancement-plot.component';

describe('StrangenessEnhancementPlotComponent', () => {
  let component: StrangenessEnhancementPlotComponent;
  let fixture: ComponentFixture<StrangenessEnhancementPlotComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ StrangenessEnhancementPlotComponent ],
      imports: [ AngularModule, SharedModule, TranslateModule.forRoot() ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(StrangenessEnhancementPlotComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
