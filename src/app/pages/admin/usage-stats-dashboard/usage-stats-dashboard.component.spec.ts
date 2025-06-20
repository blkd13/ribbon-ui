import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UsageStatsDashboardComponent } from './usage-stats-dashboard.component';

describe('UsageStatsDashboardComponent', () => {
  let component: UsageStatsDashboardComponent;
  let fixture: ComponentFixture<UsageStatsDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsageStatsDashboardComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(UsageStatsDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
