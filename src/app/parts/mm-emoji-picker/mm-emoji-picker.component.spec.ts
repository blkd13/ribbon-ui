import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MmEmojiPickerComponent } from './mm-emoji-picker.component';

describe('MmEmojiPickerComponent', () => {
  let component: MmEmojiPickerComponent;
  let fixture: ComponentFixture<MmEmojiPickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MmEmojiPickerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MmEmojiPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
