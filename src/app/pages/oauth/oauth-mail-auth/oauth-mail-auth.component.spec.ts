import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OAuthMailAuthComponent } from './oauth-mail-auth.component';

describe('OAuthMailAuthComponent', () => {
  let component: OAuthMailAuthComponent;
  let fixture: ComponentFixture<OAuthMailAuthComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OAuthMailAuthComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OAuthMailAuthComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
