import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AIModelManagementComponent } from './ai-model-management.component';

describe('AIModelManagementComponent', () => {
  let component: AIModelManagementComponent;
  let fixture: ComponentFixture<AIModelManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AIModelManagementComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(AIModelManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
