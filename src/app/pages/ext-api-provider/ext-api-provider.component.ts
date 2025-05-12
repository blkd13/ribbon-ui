import { Component } from '@angular/core';
import { ExtApiProviderTemplateFormComponent } from "../../parts/ext-api-provider-template-form/ext-api-provider-template-form.component";
import { ExtApiProviderFormComponent } from "../../parts/ext-api-provider-form/ext-api-provider-form.component";
import { AIModelManagementComponent } from "../../parts/ai-model-management/ai-model-management/ai-model-management.component";

@Component({
  selector: 'app-ext-api-provider',
  imports: [ExtApiProviderTemplateFormComponent, ExtApiProviderFormComponent, AIModelManagementComponent],
  templateUrl: './ext-api-provider.component.html',
  styleUrl: './ext-api-provider.component.scss'
})
export class ExtApiProviderComponent {

}
