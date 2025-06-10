import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TagManagementDialogComponent } from './tag-management-dialog.component';

describe('TagManagementDialogComponent', () => {
  let component: TagManagementDialogComponent;
  let fixture: ComponentFixture<TagManagementDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TagManagementDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TagManagementDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
