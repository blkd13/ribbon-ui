import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExtApiProviderTemplateFormComponent } from './ext-api-provider-template-form.component';

describe('OauthProviderTemplateFormComponent', () => {
  let component: ExtApiProviderTemplateFormComponent;
  let fixture: ComponentFixture<ExtApiProviderTemplateFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExtApiProviderTemplateFormComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(ExtApiProviderTemplateFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
