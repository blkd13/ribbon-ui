import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BulkRunSettingComponent } from './bulk-run-setting.component';

describe('BulkRunSettingComponent', () => {
  let component: BulkRunSettingComponent;
  let fixture: ComponentFixture<BulkRunSettingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BulkRunSettingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BulkRunSettingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
