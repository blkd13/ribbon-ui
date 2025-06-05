import { Component, ElementRef, inject, input, model, output, QueryList, signal, TemplateRef, viewChild, ViewChild, ViewChildren, ViewContainerRef } from '@angular/core';
import { MatMenu, MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';
import { AIModelEntityForView, AIModelManagerService } from '../../services/model-manager.service';
import { ChatCompletionCreateParamsBase } from 'openai/resources/chat/completions.mjs';
import { ChatCompletionCreateParamsWithoutMessages } from '../../models/models';

// -----------------------------------------------------------------------------
// Large sample data set for the cascade Mat‑Menu example
// -----------------------------------------------------------------------------
// Category → Model → Detail (string[])
// -----------------------------------------------------------------------------

export interface Model {
  key: string;           // short unique id (for id attributes)
  name: string;          // display name
  desc: string;          // short description (one‑liner)
  details: string[];     // bullet list for the right‑most card
  preview?: boolean;     // optional preview badge
  disabled?: boolean;  // optional disabled state
  object: AIModelEntityForView; // optional object reference for further details
}

export interface Category {
  label: string;         // e.g. "最新", "Gemini", …
  models: Model[];
}

export const MODEL_CATEGORIES: Category[] = [];


@Component({
  selector: 'app-model-selector',
  imports: [
    MatMenuModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
  ],
  templateUrl: './model-selector.component.html',
  styleUrl: './model-selector.component.scss'
})
export class ModelSelectorComponent {
  data = MODEL_CATEGORIES;

  readonly args = input.required<ChatCompletionCreateParamsWithoutMessages>();
  readonly argsChangeEmitter = output<ChatCompletionCreateParamsWithoutMessages>({ alias: 'argsChange' });

  readonly aiModelService: AIModelManagerService = inject(AIModelManagerService);

  constructor() {
    this.aiModelService.getAIModels().subscribe((models: AIModelEntityForView[]) => {
      models.forEach(model => {
        model.uiOrder = model.uiOrder || 0; model.tags = model.tags || []; model.details = model.details || []; model.description = model.description || ''; model.name = model.name || ''; model.providerModelId = model.providerModelId || '';
      });
      models.sort((a, b) => {
        if (a.uiOrder !== b.uiOrder) {
          return a.uiOrder - b.uiOrder;
        }
        return a.providerModelId.localeCompare(b.providerModelId);
      });
      this.data = models.reduce((acc: Category[], model: AIModelEntityForView) => {
        const obj = {
          key: model.providerModelId,
          name: model.name,
          desc: model.description || '',
          details: model.details || [],
          preview: false,
          disabled: false,
          object: model,
        };

        if (model.capabilities) {
          if (model.capabilities['tool']) {
            obj.details.push(`tool: ${model.providerModelId}`);
          } else { }
        }
        if (model.modalities) {
          obj.details.push(`modality: ${model.modalities.join(', ')}`);
        }
        if (model.documentationUrl) {
          obj.details.push(`Document: ${model.documentationUrl}`);
        }
        if (model.licenseUrl) {
          obj.details.push(`License: ${model.licenseUrl}`);
        }
        if (model.knowledgeCutoff) {
          obj.details.push(`Knowledge Cutoff: ${model.knowledgeCutoff}`);
        }
        if (model.releaseDate) {
          obj.details.push(`Release Date: ${model.releaseDate}`);
        }
        if (model.deprecationDate) {
          obj.details.push(`Deprecation Date: ${model.deprecationDate}`);
        }
        if (model.licenseType) {
          obj.details.push(`License Type: ${model.licenseType}`);
        }
        // if (model.aliases && model.aliases.length > 0) {
        //   obj.details.push(`エイリアス: ${model.aliases.join(', ')}`);
        // }
        if (model.tags && model.tags.length > 0) {
          obj.details.push(`Tags: ${model.tags.join(', ')}`);
        }
        if (model.tags && model.tags.length > 0) {
          model.tags.forEach(tag => {
            const category = acc.find(cat => cat.label === tag);
            if (!category) {
              acc.push({
                label: tag,
                models: [obj]
              });
            } else {
              category.models.push(obj);
            }
          });
        } else {
          const category = acc.find(cat => cat.label === 'その他');
          if (!category) {
            acc.push({
              label: 'その他',
              models: [obj]
            });
          } else {
            category.models.push(obj);
          }
        }
        return acc;
      }, [] as Category[]);
    });
  }

  selectModel(model: Model) {
    this.argsChangeEmitter.emit({
      ...this.args(),
      model: model.key,
      providerName: model.object.providerName,
    });
  }
}
