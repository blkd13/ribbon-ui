import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatPanelBaseComponent } from './chat-panel-base.component';

describe('ChatPanelBaseComponent', () => {
  let component: ChatPanelBaseComponent;
  let fixture: ComponentFixture<ChatPanelBaseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatPanelBaseComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatPanelBaseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
