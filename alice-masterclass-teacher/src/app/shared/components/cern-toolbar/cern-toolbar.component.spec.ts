import { waitForAsync, ComponentFixture, TestBed } from '@angular/core/testing';

import { CernToolbarComponent } from './cern-toolbar.component';

describe('CernToolbarComponent', () => {
  let component: CernToolbarComponent;
  let fixture: ComponentFixture<CernToolbarComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ CernToolbarComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CernToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
