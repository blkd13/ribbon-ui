import { Component, ElementRef, inject, input, model, output, QueryList, signal, TemplateRef, viewChild, ViewChild, ViewChildren, ViewContainerRef } from '@angular/core';
import { MatMenu, MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';
import { AIModelEntityForView, AIModelManagerService, TagService, TagEntity } from '../../services/model-manager.service';
import { ChatCompletionCreateParamsBase } from 'openai/resources/chat/completions.mjs';
import { ChatCompletionCreateParamsWithoutMessages } from '../../models/models';
import { forkJoin } from 'rxjs';
import { CommonModule } from '@angular/common';

// -----------------------------------------------------------------------------
// Updated interfaces for Category -> Tag -> Model structure
// -----------------------------------------------------------------------------

export interface Model {
  key: string;           // short unique id (for id attributes)
  name: string;          // display name
  desc: string;          // short description (one‑liner)
  details: string[];     // bullet list for the right‑most card
  preview?: boolean;     // optional preview badge
  disabled?: boolean;    // optional disabled state
  object: AIModelEntityForView; // optional object reference for further details
}

export interface TagGroup {
  tag?: TagEntity;        // tag information with category, sortOrder, etc.
  models?: Model[];       // models that have this tag
}

export interface Category {
  category: string;      // category name (e.g., "Content", "System", "Uncategorized")
  sortOrder: number;     // category sort order
  tagGroups: TagGroup[]; // tags within this category
}

export const MODEL_CATEGORIES: Category[] = [];

@Component({
  selector: 'app-model-selector',
  imports: [
    CommonModule,
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
  readonly tagService: TagService = inject(TagService);

  constructor() {
    // Load both AI models and tags, then process them together
    forkJoin({
      models: this.aiModelService.getAIModels(),
      tags: this.tagService.getTags()
    }).subscribe(({ models, tags }) => {
      this.processModelsAndTags(models, tags);
    });
  }

  private processModelsAndTags(models: AIModelEntityForView[], tags: TagEntity[]) {
    // Prepare models
    models.forEach(model => {
      model.uiOrder = model.uiOrder || 0;
      model.tags = model.tags || [];
      model.details = model.details || [];
      model.description = model.description || '';
      model.name = model.name || '';
      model.providerModelId = model.providerModelId || '';
    });    // Sort models using the common sort function
    this.aiModelService.sortModels(models);

    // Check for override tags
    const effectiveTags = tags.filter(tag => tag.isActive);

    // Create tag lookup map
    const tagMap = new Map<string, TagEntity>();
    effectiveTags.forEach(tag => {
      tagMap.set(tag.name, tag);
    });

    // Process each model and create the category structure
    const categoryMap = new Map<string, Category>();

    models.forEach(model => {
      const modelObj: Model = {
        key: model.providerModelId,
        name: model.name,
        desc: model.description || '',
        details: this.buildModelDetails(model),
        preview: false,
        disabled: false,
        object: model,
      };

      // Get model's active tags (filtered by effective tags)
      model.tags = model.tags || [];
      const overrideTags = (model.tags as string[]).filter(tagName => tagMap.get(tagName)?.overrideOthers);
      const effectiveTags = overrideTags.length > 0 ? overrideTags : model.tags;

      const modelActiveTags = model.tags?.filter(tagName => effectiveTags.includes(tagName)) || [];

      if (modelActiveTags.length === 0) {
        // Model has no active tags, add to "Uncategorized"
        this.addModelToCategory(categoryMap, 'Uncategorized', null, modelObj, 999);
      } else {
        // Add model to each of its active tag categories
        modelActiveTags.forEach(tagName => {
          const tag = tagMap.get(tagName)!;
          const categoryName = tag.category || 'Uncategorized';
          const categorySortOrder = this.getCategorySortOrder(categoryName, tags);

          this.addModelToCategory(categoryMap, categoryName, tag, modelObj, categorySortOrder);
        });
      }
    });

    // Convert map to sorted array
    this.data = Array.from(categoryMap.values()).sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.category.localeCompare(b.category);
    });

    // Sort tag groups within each category
    this.data.forEach(category => {
      category.tagGroups.sort((a, b) => {
        const orderA = a.tag?.sortOrder || 0;
        const orderB = b.tag?.sortOrder || 0;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        const nameA = a.tag?.label || a.tag?.name || 'Uncategorized';
        const nameB = b.tag?.label || b.tag?.name || 'Uncategorized';
        return nameA.localeCompare(nameB);
      });
    });
  }

  extraFields = [
    // { key: 'providerModelId', label: 'Tool' },
    { key: 'modalities', label: 'Modality' },
    // { key: 'documentationUrl', label: 'Document' },
    // { key: 'licenseUrl', label: 'License' },
    // { key: 'knowledgeCutoff', label: 'Knowledge Cutoff' },
    // { key: 'releaseDate', label: 'Release Date' },
    { key: 'deprecationDate', label: 'Deprecation Date' },
    // { key: 'licenseType', label: 'License Type' },
    // { key: 'inputPricePerUnit', label: 'Input Price' },
    // { key: 'outputPricePerUnit', label: 'Output Price' },
    // { key: 'maxContextTokens', label: 'Max Context Tokens' },
    // { key: 'maxOutputTokens', label: 'Max Output Tokens' },
    { key: 'tags', label: 'Tags' },
  ];

  getModelFieldValue(model: Model, key: string): string | any | null {
    if (key === 'inputPricePerUnit') {
      return model.object.pricingHistory[0].inputPricePerUnit;
    } else if (key === 'outputPricePerUnit') {
      return model.object.pricingHistory[0].outputPricePerUnit;
    }
    const value = model.object[key as keyof AIModelEntityForView];
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString().split('T')[0]; // Format date as YYYY-MM-DD
    return value || null;
  }

  private buildModelDetails(model: AIModelEntityForView): string[] {
    const details: string[] = [];

    if (model.capabilities?.['tool']) {
      details.push(`Tool: ${model.providerModelId}`);
    }
    if (model.modalities) {
      details.push(`Modality: ${model.modalities.join(', ')}`);
    }
    if (model.documentationUrl) {
      details.push(`Document: ${model.documentationUrl}`);
    }
    if (model.licenseUrl) {
      details.push(`License: ${model.licenseUrl}`);
    }
    if (model.knowledgeCutoff) {
      details.push(`Knowledge Cutoff: ${model.knowledgeCutoff}`);
    }
    if (model.releaseDate) {
      details.push(`Release Date: ${model.releaseDate}`);
    }
    if (model.deprecationDate) {
      details.push(`Deprecation Date: ${model.deprecationDate}`);
    }
    if (model.licenseType) {
      details.push(`License Type: ${model.licenseType}`);
    }
    if (model.tags && model.tags.length > 0) {
      details.push(`Tags: ${model.tags.join(', ')}`);
    }

    return details;
  }

  private addModelToCategory(
    categoryMap: Map<string, Category>,
    categoryName: string,
    tag: TagEntity | null,
    model: Model,
    categorySortOrder: number
  ) {
    if (!categoryMap.has(categoryName)) {
      categoryMap.set(categoryName, {
        category: categoryName,
        sortOrder: categorySortOrder,
        tagGroups: []
      });
    }

    const category = categoryMap.get(categoryName)!;

    // Find existing tag group or create new one
    const tagName = tag?.name || 'no-tag';
    let tagGroup = category.tagGroups.find(tg =>
      (tg.tag?.name || 'no-tag') === tagName
    );

    if (!tagGroup) {
      tagGroup = {
        tag: tag!,
        models: []
      };
      category.tagGroups.push(tagGroup);
    }

    tagGroup.models?.push(model);
  }

  private getCategorySortOrder(categoryName: string, tags: TagEntity[]): number {
    // Find the minimum sort order among tags in this category
    const categoryTags = tags.filter(tag => (tag.category || 'Uncategorized') === categoryName);
    if (categoryTags.length === 0) {
      return categoryName === 'Uncategorized' ? 999 : 500;
    }

    const minSortOrder = Math.min(...categoryTags.map(tag => tag.sortOrder || 0));
    return minSortOrder;
  }

  selectModel(model: Model) {
    this.argsChangeEmitter.emit({
      ...this.args(),
      model: model.key,
      providerName: model.object.providerNameList[0],
    });
  }

  getTotalModelsInCategory(category: Category): number {
    return category.tagGroups.reduce((total, tagGroup) => total + (tagGroup.models?.length || 0), 0);
  }
}