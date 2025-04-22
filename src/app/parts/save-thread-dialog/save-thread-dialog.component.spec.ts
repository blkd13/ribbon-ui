import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaveThreadDialogComponent } from './save-thread-dialog.component';

describe('SaveThreadDialogComponent', () => {
  let component: SaveThreadDialogComponent;
  let fixture: ComponentFixture<SaveThreadDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaveThreadDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SaveThreadDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
