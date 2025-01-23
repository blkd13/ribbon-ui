import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GitSelectorDialogComponent } from './git-selector-dialog.component';

describe('GitSelectorDialogComponent', () => {
  let component: GitSelectorDialogComponent;
  let fixture: ComponentFixture<GitSelectorDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GitSelectorDialogComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(GitSelectorDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
