import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { AngularModule } from '../../shared/angular.module';
import { SharedModule } from '../../shared/shared.module';

import { ApiService } from '../../shared/services/api.service';

import { MassHistogramsComponent } from './mass-histograms.component';

describe('MassHistogramsComponent', () => {
  let component: MassHistogramsComponent;
  let fixture: ComponentFixture<MassHistogramsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [MassHistogramsComponent],
    imports: [AngularModule,
        SharedModule,
        TranslateModule.forRoot()],
    providers: [ApiService, provideHttpClient(withInterceptorsFromDi())]
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

  it('should default all histograms to 10 bins', () => {
    expect(component.bins).toBe(10);
  });

  it('should clamp typed bin counts to 1–25', () => {
    component.onBinsInput(0);
    expect(component.bins).toBe(1);
    component.onBinsInput(999);
    expect(component.bins).toBe(25);
    component.onBinsInput(12.6);
    expect(component.bins).toBe(13);
  });
});
