import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ToolCallCallResultDialogComponent } from './tool-call-call-result-dialog.component';

describe('ToolCallCallResultDialogComponent', () => {
  let component: ToolCallCallResultDialogComponent;
  let fixture: ComponentFixture<ToolCallCallResultDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolCallCallResultDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ToolCallCallResultDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
