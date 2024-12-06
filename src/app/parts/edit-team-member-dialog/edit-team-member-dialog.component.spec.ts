import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditTeamMemberDialogComponent } from './edit-team-member-dialog.component';

describe('EditTeamMemberDialogComponent', () => {
  let component: EditTeamMemberDialogComponent;
  let fixture: ComponentFixture<EditTeamMemberDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditTeamMemberDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditTeamMemberDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
