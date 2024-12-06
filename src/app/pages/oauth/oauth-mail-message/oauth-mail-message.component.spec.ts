import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OAuthMailMessageComponent } from './oauth-mail-message.component';

describe('OAuthMailMessageComponent', () => {
  let component: OAuthMailMessageComponent;
  let fixture: ComponentFixture<OAuthMailMessageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OAuthMailMessageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OAuthMailMessageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
