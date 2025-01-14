import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserSettingDialogComponent } from './user-setting-dialog.component';

describe('UserSettingDialogComponent', () => {
  let component: UserSettingDialogComponent;
  let fixture: ComponentFixture<UserSettingDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserSettingDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserSettingDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
