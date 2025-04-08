import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatPanelZoomDialogComponent } from './chat-panel-zoom-dialog.component';

describe('ChatPanelZoomDialogComponent', () => {
  let component: ChatPanelZoomDialogComponent;
  let fixture: ComponentFixture<ChatPanelZoomDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatPanelZoomDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatPanelZoomDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
