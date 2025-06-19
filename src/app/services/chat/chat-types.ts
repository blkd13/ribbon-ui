import { OpenAI } from 'openai';

// チャット関連の型定義を集約

export interface ChatInputArea {
  role: OpenAI.ChatCompletionRole;
  content: ChatContent[];
  messageGroupId?: string;
}

export type ChatContent = (
  { type: 'text', text: string } | 
  { type: 'file', text: string, fileGroupId: string }
);

export interface LlmModel {
  tag: string;
  isEnable: boolean;
  class: string;
  maxTokens: number;
  maxInputTokens: number;
  isGSearch: boolean;
  isDomestic: boolean;
  isPdf: boolean;
  price: number[];
  id: string;
  label?: string;
}

export interface ChatStreamState {
  streamId: string;
  messageId: string;
  isActive: boolean;
  text: string;
  error?: string;
}

export interface ChatConnectionState {
  connectionId: string;
  isConnected: boolean;
  reconnectAttempts: number;
  lastActivity: Date;
}

export interface ChatPreset {
  id: string;
  name: string;
  systemPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  isDefault?: boolean;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
}

export interface ChatModelSettings {
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPrompt?: string;
}

export interface ChatStreamingOptions {
  onMessage?: (chunk: OpenAI.ChatCompletionChunk) => void;
  onError?: (error: any) => void;
  onComplete?: () => void;
  onTokenUpdate?: (usage: Partial<TokenUsage>) => void;
}