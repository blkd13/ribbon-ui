import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatPanelSystemComponent } from './chat-panel-system.component';

describe('ChatPanelSystemComponent', () => {
  let component: ChatPanelSystemComponent;
  let fixture: ComponentFixture<ChatPanelSystemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatPanelSystemComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatPanelSystemComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
