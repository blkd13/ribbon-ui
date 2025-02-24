import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApiKeyManagerDialogComponent } from './api-key-manager-dialog.component';

describe('ApiKeyManagerDialogComponent', () => {
  let component: ApiKeyManagerDialogComponent;
  let fixture: ComponentFixture<ApiKeyManagerDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApiKeyManagerDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ApiKeyManagerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
