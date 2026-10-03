import type { TreasuryService } from "../factoryos/core/treasury/TreasuryService";

export type TreasuryModelExecutionContext = {
  readonly treasuryService: TreasuryService;
  readonly accountId: string;
  readonly overseerCommandId: string;
  readonly missionId: string;
  readonly runId?: string;
  readonly floorId?: string;
  readonly taskId: string;
  readonly scopeFingerprint: string;
  readonly priority?: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  readonly maxRetries?: number;
  readonly maxCostUsd?: number;
  readonly preferredProviderId?: string;
  readonly subtask?: string;
};

export type LLMProvider = "gemini" | "groq" | "openrouter" | "huggingface";

export type ProviderContext = {
  // Keep generic; concrete provider impls can interpret.
  apiKey?: string;
  treasuryContext?: TreasuryModelExecutionContext;
};

export interface LLMProviderAdapter {
  generateText(params: {
    prompt: string;
    system?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<string>;
}

