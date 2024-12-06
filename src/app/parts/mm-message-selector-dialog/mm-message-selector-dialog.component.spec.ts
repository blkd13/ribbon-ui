import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MmMessageSelectorDialogComponent } from './mm-message-selector-dialog.component';

describe('MmMessageSelectorDialogComponent', () => {
  let component: MmMessageSelectorDialogComponent;
  let fixture: ComponentFixture<MmMessageSelectorDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MmMessageSelectorDialogComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(MmMessageSelectorDialogComponent);
    component = fixture.componentInstance; MmMessageSelectorDialogComponent
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
