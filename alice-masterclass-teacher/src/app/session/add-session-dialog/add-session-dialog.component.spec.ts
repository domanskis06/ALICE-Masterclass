import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';

import { AngularModule } from '../../shared/angular.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { ApiService } from '../../shared/services/api.service';

import { AddSessionDialogComponent } from './add-session-dialog.component';

import { of } from 'rxjs';

describe('AddSessionDialogComponent', () => {
  let component: AddSessionDialogComponent;
  let fixture: ComponentFixture<AddSessionDialogComponent>;
  let service: ApiService;

  let spy: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [AddSessionDialogComponent],
    imports: [AngularModule, SharedModule, TranslateModule.forRoot()],
    providers: [
        { provide: MAT_DIALOG_DATA, useValue: {} },
        { provide: MatDialogRef, useFactory: () => jasmine.createSpyObj('MatDialogRef', ['close']) },
        ApiService,
        provideHttpClient(withInterceptorsFromDi())
    ]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AddSessionDialogComponent);
    component = fixture.componentInstance;
    service = fixture.debugElement.injector.get(ApiService);

    spy = spyOn(service, 'getEvents').and.returnValue(of([]));

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
