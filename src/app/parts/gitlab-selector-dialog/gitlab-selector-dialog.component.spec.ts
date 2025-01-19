import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GitlabSelectorDialogComponent } from './gitlab-selector-dialog.component';

describe('GitlabSelectorDialogComponent', () => {
  let component: GitlabSelectorDialogComponent;
  let fixture: ComponentFixture<GitlabSelectorDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GitlabSelectorDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GitlabSelectorDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
