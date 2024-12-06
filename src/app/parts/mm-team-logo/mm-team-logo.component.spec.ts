import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MmTeamLogoComponent } from './mm-team-logo.component';

describe('MmTeamLogoComponent', () => {
  let component: MmTeamLogoComponent;
  let fixture: ComponentFixture<MmTeamLogoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MmTeamLogoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MmTeamLogoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
