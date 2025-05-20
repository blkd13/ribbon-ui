import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AiProviderManagementComponent } from './ai-provider-management.component';

describe('AiProviderManagementComponent', () => {
  let component: AiProviderManagementComponent;
  let fixture: ComponentFixture<AiProviderManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiProviderManagementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AiProviderManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
