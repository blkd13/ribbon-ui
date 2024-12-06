import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatPanelMessageComponent } from './chat-panel-message.component';

describe('ChatPanelMessageComponent', () => {
  let component: ChatPanelMessageComponent;
  let fixture: ComponentFixture<ChatPanelMessageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatPanelMessageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatPanelMessageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
