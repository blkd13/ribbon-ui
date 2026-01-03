/**
 * Provider Configuration Service
 * 動的フォーム生成のためのプロバイダー設定管理
 */
import { Injectable, inject } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, AbstractControl } from '@angular/forms';
import { AIProviderType } from '../../../../services/model-manager.service';
import { Utils } from '../../../../utils';

export interface ProviderConfigField {
  key: string;
  type: 'text' | 'password' | 'url' | 'array' | 'json' | 'object_array';
  label: string;
  required: boolean;
  placeholder?: string;
  defaultValue?: any;
  objectFields?: ProviderConfigField[];
}

export interface ProviderConfigDefinition {
  title: string;
  fields: ProviderConfigField[];
}

@Injectable({ providedIn: 'root' })
export class ProviderConfigService {
  readonly fb: FormBuilder = inject(FormBuilder);

  private readonly configs: Record<string, ProviderConfigDefinition> = {
    [AIProviderType.OPENAI]: {
      title: 'OpenAI Configuration',
      fields: [
        {
          key: 'endpoints',
          type: 'object_array',
          label: 'Endpoints',
          required: true,
          objectFields: [
            { key: 'apiKey', type: 'password', label: 'API Key', required: true },
            { key: 'organization', type: 'text', label: 'Organization', required: false, placeholder: 'Optional organization ID' },
            { key: 'project', type: 'text', label: 'Project', required: false, placeholder: 'Optional project ID' }
          ]
        }
      ]
    },
    [AIProviderType.AZURE_OPENAI]: {
      title: 'Azure OpenAI Configuration',
      fields: [
        {
          key: 'resources',
          type: 'object_array',
          label: 'Resources',
          required: true,
          objectFields: [
            { key: 'baseURL', type: 'url', label: 'Base URL', required: true, placeholder: 'https://yourresource.openai.azure.com/' },
            { key: 'apiKey', type: 'password', label: 'API Key', required: true },
            { key: 'ipAddress', type: 'text', label: 'IP Address', required: false },
            { key: 'apiVersion', type: 'text', label: 'API Version', required: false, placeholder: '2024-04-01' }
          ]
        }
      ]
    },
    [AIProviderType.VERTEXAI]: {
      title: 'VertexAI Configuration',
      fields: [
        { key: 'project', type: 'text', label: 'Project ID', required: true },
        { key: 'apiEndpoint', type: 'url', label: 'API Endpoint', required: false, placeholder: 'us-central1-aiplatform.googleapis.com' },
        { key: 'locationList', type: 'array', label: 'Locations', required: true, defaultValue: ['us-central1'] }
      ]
    },
    [AIProviderType.ANTHROPIC_VERTEXAI]: {
      title: 'Anthropic VertexAI Configuration',
      fields: [
        { key: 'projectId', type: 'text', label: 'Project ID', required: true },
        { key: 'baseURL', type: 'url', label: 'Base URL', required: false, placeholder: 'https://us-central1-aiplatform.googleapis.com/' },
        { key: 'regionList', type: 'array', label: 'Regions', required: true, defaultValue: ['us-central1'] }
      ]
    },
    [AIProviderType.OPENAI_COMPATIBLE]: {
      title: 'OpenAI Compatible Configuration',
      fields: [
        {
          key: 'endpoints',
          type: 'object_array',
          label: 'Endpoints',
          required: true,
          objectFields: [
            { key: 'baseURL', type: 'url', label: 'Base URL', required: true, placeholder: 'https://api.openai.com/v1/' },
            { key: 'apiKey', type: 'password', label: 'API Key', required: false },
            { key: 'metadata', type: 'json', label: 'Additional Properties', required: false, defaultValue: {} }
          ]
        }
      ]
    }
  };

  getConfigDefinition(providerType: string): ProviderConfigDefinition {
    return this.configs[providerType] || {
      title: `${Utils.toPascalCase(providerType)} Configuration`,
      fields: [
        {
          key: 'endpoints',
          type: 'object_array',
          label: 'Endpoints',
          required: true,
          objectFields: [
            { key: 'apiKey', type: 'password', label: 'API Key', required: true }
          ]
        }
      ]
    };
  }

  createConfigForm(providerType: string): FormGroup {
    const definition = this.getConfigDefinition(providerType);
    const group: Record<string, AbstractControl> = {};

    definition.fields.forEach(field => {
      if (field.type === 'array') {
        const defaultValues = field.defaultValue || [''];
        const arrayControls = defaultValues.map((value: string) =>
          this.fb.control(value, field.required ? [Validators.required] : [])
        );
        group[field.key] = this.fb.array(arrayControls);
      } else if (field.type === 'object_array') {
        const objectForm = this.createObjectForm(field.objectFields || []);
        group[field.key] = this.fb.array([objectForm]);
      } else if (field.type === 'json') {
        const defaultValue = field.defaultValue || {};
        group[field.key] = this.fb.control(defaultValue);
      } else {
        const validators = field.required ? [Validators.required] : [];
        const defaultValue = field.defaultValue || '';
        group[field.key] = this.fb.control(defaultValue, validators);
      }
    });

    return this.fb.group(group);
  }

  private createObjectForm(objectFields: ProviderConfigField[]): FormGroup {
    const group: Record<string, AbstractControl> = {};

    objectFields.forEach(field => {
      if (field.type === 'json') {
        const defaultValue = field.defaultValue || {};
        group[field.key] = this.fb.control(defaultValue);
      } else {
        const validators = field.required ? [Validators.required] : [];
        const defaultValue = field.defaultValue || '';
        group[field.key] = this.fb.control(defaultValue, validators);
      }
    });

    return this.fb.group(group);
  }

  patchConfigForm(configForm: FormGroup, config: any, providerType: string): void {
    const definition = this.getConfigDefinition(providerType);

    definition.fields.forEach(field => {
      const control = configForm.get(field.key);
      const value = config[field.key];

      if (!control || value === undefined) return;

      if (field.type === 'array' && control instanceof FormArray) {
        this.updateFormArray(control, value || []);
      } else if (field.type === 'object_array' && control instanceof FormArray) {
        this.updateObjectFormArray(control, value || [], field.objectFields || []);
      } else if (field.type === 'json') {
        control.setValue(value || {});
      } else {
        control.setValue(value);
      }
    });
  }

  private updateFormArray(formArray: FormArray, values: string[]): void {
    while (formArray.length !== 0) {
      formArray.removeAt(0);
    }

    values.forEach(value => {
      formArray.push(this.fb.control(value, [Validators.required]));
    });

    if (formArray.length === 0) {
      formArray.push(this.fb.control('', [Validators.required]));
    }
  }

  private updateObjectFormArray(formArray: FormArray, values: any[], objectFields: ProviderConfigField[]): void {
    while (formArray.length !== 0) {
      formArray.removeAt(0);
    }

    if (values.length > 0) {
      values.forEach(value => {
        const objectForm = this.createObjectForm(objectFields);
        objectForm.patchValue(value);
        formArray.push(objectForm);
      });
    } else {
      formArray.push(this.createObjectForm(objectFields));
    }
  }

  addArrayItem(configForm: FormGroup, fieldKey: string): void {
    const formArray = configForm.get(fieldKey) as FormArray;
    if (formArray) {
      formArray.push(this.fb.control('', [Validators.required]));
    }
  }

  addObjectArrayItem(configForm: FormGroup, fieldKey: string, objectFields: ProviderConfigField[]): void {
    const formArray = configForm.get(fieldKey) as FormArray;
    if (formArray) {
      const objectForm = this.createObjectForm(objectFields);
      formArray.push(objectForm);
    }
  }

  removeArrayItem(configForm: FormGroup, fieldKey: string, index: number): void {
    const formArray = configForm.get(fieldKey) as FormArray;
    if (formArray && formArray.length > 1) {
      formArray.removeAt(index);
    }
  }

  getObjectArrayFields(providerType: string, arrayFieldKey: string): ProviderConfigField[] {
    const definition = this.getConfigDefinition(providerType);
    const field = definition.fields.find(f => f.key === arrayFieldKey);
    return field?.objectFields || [];
  }

  getConfigValue(configForm: FormGroup): any {
    const value = configForm.value;
    const cleanedValue: any = {};

    Object.keys(value).forEach(key => {
      const val = value[key];
      if (Array.isArray(val)) {
        if (val.length > 0 && typeof val[0] === 'object') {
          const filtered = val.filter(item => this.isValidObject(item));
          if (filtered.length > 0) {
            cleanedValue[key] = filtered;
          }
        } else {
          const filtered = val.filter(item => item && item.trim());
          if (filtered.length > 0) {
            cleanedValue[key] = filtered;
          }
        }
      } else if (val !== null && val !== undefined && val !== '') {
        if (typeof val === 'object' && Object.keys(val).length === 0) {
          cleanedValue[key] = val;
        } else {
          cleanedValue[key] = val;
        }
      }
    });

    return cleanedValue;
  }

  private isValidObject(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;

    const hasRequiredValues = Object.keys(obj).some(key => {
      const value = obj[key];
      return value !== null && value !== undefined && value !== '';
    });

    return hasRequiredValues;
  }

  validateConfigForm(configForm: FormGroup, providerType: string): { isValid: boolean; errors: string[] } {
    const definition = this.getConfigDefinition(providerType);
    const errors: string[] = [];

    definition.fields.forEach(field => {
      const control = configForm.get(field.key);

      if (field.required && control) {
        if (field.type === 'array') {
          const formArray = control as FormArray;
          if (!formArray.length || formArray.controls.every(c => !c.value?.trim())) {
            errors.push(`${field.label} is required`);
          }
        } else if (field.type === 'object_array') {
          const formArray = control as FormArray;
          if (!formArray.length || formArray.controls.every(c => !this.isValidObject(c.value))) {
            errors.push(`${field.label} is required`);
          }
        } else if (field.type === 'json') {
          // JSON field allows empty objects
        } else {
          if (!control.value?.trim()) {
            errors.push(`${field.label} is required`);
          }
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
