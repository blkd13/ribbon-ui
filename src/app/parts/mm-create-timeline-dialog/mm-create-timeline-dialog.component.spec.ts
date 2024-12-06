import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MmCreateTimelineDialogComponent } from './mm-create-timeline-dialog.component';

describe('MmCreateTimelineDialogComponent', () => {
  let component: MmCreateTimelineDialogComponent;
  let fixture: ComponentFixture<MmCreateTimelineDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MmCreateTimelineDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MmCreateTimelineDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
