import { Component } from '@angular/core';
import { ExtApiProviderTemplateFormComponent } from "../ext-api-provider-template-form/ext-api-provider-template-form.component";
import { ExtApiProviderFormComponent } from "../ext-api-provider-form/ext-api-provider-form.component";
import { AIModelManagementComponent } from "../ai-model-management/ai-model-management/ai-model-management.component";
import { AIProviderManagementComponent } from "../ai-model-management/ai-provider-management/ai-provider-management.component";
import { AIProviderTemplateManagementComponent } from "../ai-model-management/ai-provider-template-management/ai-provider-template-management.component";

@Component({
  selector: 'app-ext-api-provider',
  imports: [ExtApiProviderTemplateFormComponent, ExtApiProviderFormComponent, AIModelManagementComponent, AIProviderManagementComponent, AIProviderTemplateManagementComponent],
  templateUrl: './ext-api-provider.component.html',
  styleUrl: './ext-api-provider.component.scss'
})
export class ExtApiProviderComponent {

}
