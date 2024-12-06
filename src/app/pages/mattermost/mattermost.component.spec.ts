import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MattermostComponent } from './mattermost.component';

describe('MattermostComponent', () => {
  let component: MattermostComponent;
  let fixture: ComponentFixture<MattermostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MattermostComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MattermostComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
