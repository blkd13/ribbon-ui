import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParameterSettingDialogComponent } from './parameter-setting-dialog.component';

describe('ParameterSettingDialogComponent', () => {
  let component: ParameterSettingDialogComponent;
  let fixture: ComponentFixture<ParameterSettingDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParameterSettingDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParameterSettingDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
