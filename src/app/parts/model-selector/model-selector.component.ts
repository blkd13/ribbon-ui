import { Component, ElementRef, inject, input, model, output, QueryList, TemplateRef, viewChild, ViewChild, ViewChildren, ViewContainerRef } from '@angular/core';
import { MatMenu, MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';
import { AIModelEntityForView, AIModelManagerService } from '../../services/model-manager.service';

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
}

export interface Category {
  label: string;         // e.g. "最新", "Gemini", …
  models: Model[];
}

export const MODEL_CATEGORIES: Category[] = [
  // ---------------------------------------------------------------------------
  // 最新 (Latest)
  // ---------------------------------------------------------------------------
  {
    label: "最新",
    models: [
      {
        key: "pro_250506",
        name: "gemini-2.5-pro-preview-05-06",
        desc: "最新世代のマルチモーダル推論モデル (Preview)",
        details: [
          "マルチモーダル理解・生成",
          "長コンテキスト (1M tokens)",
          "コーディング・Web 開発に最適"
        ],
        preview: true
      },
      {
        key: "flash_250417",
        name: "gemini-2.5-flash-preview-04-17",
        desc: "制御性を高めた高速推論モデル (Preview)",
        details: [
          "推論速度を 2.3× 向上",
          "低レイテンシ・低コスト",
          "最大コンテキスト 512k tokens"
        ],
        preview: true
      },
      {
        key: "flash2_image",
        name: "gemini-2.0-flash-preview-image-generation",
        desc: "画像生成特化 Flash モデル (Preview)",
        details: [
          "Image-to-Text & Text-to-Image を高速処理",
          "1M トークン コンテキスト",
          "最終更新日 2025/05/06"
        ],
        preview: true
      },
      {
        key: "gemini_flash_lite001",
        name: "gemini-2.0-flash-lite-001",
        desc: "Google's most cost‑efficient model",
        details: [
          "100 トークン ウィンドウ",
          "レスポンスを最小限に圧縮",
          "組み込み / IoT 用"
        ]
      },
      {
        key: "palm3_bison_prev",
        name: "palm-3-bison-preview",
        desc: "PaLM 3 系列の大規模言語モデル (Preview)",
        details: [
          "汎用推論 & QA",
          "多言語対応 (200+ 言語)",
          "コード補完精度 78%"
        ],
        preview: true
      }
    ]
  },

  // ---------------------------------------------------------------------------
  // Gemini (スタンダード)
  // ---------------------------------------------------------------------------
  {
    label: "Gemini",
    models: [
      {
        key: "gemini_pro_001",
        name: "gemini-pro-001",
        desc: "バランス型のマルチモーダルモデル",
        details: [
          "画像・音声入力に対応",
          "32k トークン コンテキスト",
          "STEM 問題に強い"
        ]
      },
      {
        key: "gemini_flash_001",
        name: "gemini-flash-001",
        desc: "優れた推論速度とコスト効率",
        details: [
          "推論レイテンシ ~300ms",
          "動画フレーム理解 (β)",
          "API 料金 $0.00025/token"
        ]
      },
      {
        key: "gemini_flash_002",
        name: "gemini-flash-002",
        desc: "Flash 系列の第 2 世代",
        details: [
          "100k トークン コンテキスト",
          "乱雑な PDF 入力に強い",
          "コスト 15% 削減"
        ]
      },
      {
        key: "gemini_code_001",
        name: "gemini-code-001",
        desc: "コード生成・リファクタリング特化",
        details: [
          "40+ 言語の構文/型を学習",
          "テストケース自動生成",
          "IDE 拡張プラグイン提供"
        ]
      },
      {
        key: "gemini_audio_001",
        name: "gemini-audio-001",
        desc: "音声理解 & TTS",
        details: [
          "24kHz HiFi スピーチ合成",
          "リアルタイム文字起こし",
          "多言語スピーカークローン"
        ]
      }
    ]
  },

  // ---------------------------------------------------------------------------
  // チューン済み (Fine‑tuned)
  // ---------------------------------------------------------------------------
  {
    label: "チューン済み",
    models: [
      {
        key: "fin_tuned_sql",
        name: "gemini-pro-finetune-sql",
        desc: "SQL 生成・最適化に特化",
        details: [
          "200k DBA 対話ログで訓練",
          "クエリプラン コスト最小化",
          "ETL スクリプト生成にも対応"
        ]
      },
      {
        key: "fin_tuned_legal",
        name: "gemini-pro-finetune-legal-ja",
        desc: "日本語リーガルドメイン特化",
        details: [
          "判例 75 万件コーパス",
          "条文の条番号リンク付け",
          "要約・リスク抽出"
        ]
      },
      {
        key: "fin_tuned_medical",
        name: "gemini-pro-finetune-medical-en",
        desc: "医療論文・臨床ノート向け",
        details: [
          "PubMed 2024+ 収録",
          "臨床タスクベンチ SOTA",
          "HIPAA コンプライアンス"
        ]
      },
      {
        key: "fin_tuned_finance",
        name: "gemini-flash-finetune-finance",
        desc: "金融チャットボット高速版",
        details: [
          "10ms 以下応答",
          "ガバナンス用ファクトチェック API 付属",
          "ストレスシナリオ推論"
        ]
      }
    ]
  },

  // ---------------------------------------------------------------------------
  // サードパーティ
  // ---------------------------------------------------------------------------
  {
    label: "サードパーティ",
    models: [
      {
        key: "anthropic_claude3",
        name: "claude‑3‑opus‑2025‑05‑01",
        desc: "Anthropic Claude 3 Opus (Hosted)",
        details: [
          "ステップバイステップ推論強化",
          "長期記憶に基づく対話",
          "安全層 (Constitutional AI v2)"
        ]
      },
      {
        key: "openai_gpt5",
        name: "openai‑gpt‑5‑preview",
        desc: "GPT‑5 Preview Hosted by Google AI Studio",
        details: [
          "マルチモーダル・マルチエージェント",
          "専用 GPU Memory Pool",
          "ツール呼び出し自動推論"
        ],
        preview: true
      },
      {
        key: "llama3_70b",
        name: "llama‑3‑70b‑instruct",
        desc: "Meta AI Llama‑3 70B Instruct",
        details: [
          "オープンソース (Apache‑2.0)",
          "32k コンテキスト",
          "英語・多言語総合性能"
        ]
      },
      {
        key: "mistral_large",
        name: "mistral‑large‑2404",
        desc: "Mistral Large 24.04",
        details: [
          "European multi‑lingual focus",
          "Retrieval Augmented Generation",
          "少数例学習の精度向上"
        ]
      },
      {
        key: "groq_mix",
        name: "mixtral‑8x22b‑groq‑api",
        desc: "Groq API 超高速 Mixtral 8×22B",
        details: [
          "推論レイテンシ ~10ms",
          "128k コンテキスト",
          "MoE アーキテクチャ"
        ]
      }
    ]
  },

  // ---------------------------------------------------------------------------
  // 研究用 (Research)
  // ---------------------------------------------------------------------------
  {
    label: "研究用",
    models: [
      {
        key: "beta_musicgen",
        name: "gemini‑music‑beta‑001",
        desc: "テキスト → 楽曲 生成実験モデル",
        details: [
          "128 秒までの音楽出力",
          "ジャンル条件付き生成",
          "Cue‑split MIDI も出力"
        ],
        preview: true
      },
      {
        key: "beta_agentic",
        name: "gemini‑agentic‑sandbox‑2025",
        desc: "マルチエージェント 協調推論研究",
        details: [
          "最大 16 エージェント",
          "計画 / 実行 / 反省 の自己修正",
          "限定 Early Access"
        ],
        preview: true
      },
      {
        key: "beta_quantum",
        name: "gemini‑quantum‑sim‑alpha",
        desc: "量子回路シミュレーション補助",
        details: [
          "トランスパイル自動化",
          "量子エラー訂正提案",
          "最大 64‑qubit 回路"
        ]
      }
    ]
  }
];


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

  readonly model = model<string>('');

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
    this.model.update(_model => model.name);
  }
}
