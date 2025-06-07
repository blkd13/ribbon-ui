import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AiProviderTemplateManagementComponent } from './ai-provider-template-management.component';

describe('AiProviderTemplateManagementComponent', () => {
  let component: AiProviderTemplateManagementComponent;
  let fixture: ComponentFixture<AiProviderTemplateManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiProviderTemplateManagementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AiProviderTemplateManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
