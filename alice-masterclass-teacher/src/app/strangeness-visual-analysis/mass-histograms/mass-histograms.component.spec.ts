import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { AngularModule } from 'src/app/shared/angular.module';
import { SharedModule } from 'src/app/shared/shared.module';

import { MassHistogramsComponent } from './mass-histograms.component';

describe('MassHistogramsComponent', () => {
  let component: MassHistogramsComponent;
  let fixture: ComponentFixture<MassHistogramsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MassHistogramsComponent ],
      imports: [ AngularModule, SharedModule, TranslateModule.forRoot() ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MassHistogramsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
