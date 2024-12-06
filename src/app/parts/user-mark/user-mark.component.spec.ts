import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserMarkComponent } from './user-mark.component';

describe('UserMarkComponent', () => {
  let component: UserMarkComponent;
  let fixture: ComponentFixture<UserMarkComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserMarkComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserMarkComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
