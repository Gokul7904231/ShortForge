/**
 * @deprecated Legacy factory bridge — superseded by the AIProviderRegistry plugin system.
 * Will be removed in Phase 3 cleanup.
 */
import { AIProviderRegistry } from "./capability-registry";
import { LLMProvider, LLMProviderAdapter } from "./provider";
import { getProviderWithFallback } from "./providers/factory_with_fallback";

export function providerFactory(provider: LLMProvider, ctx: { apiKey?: string }): LLMProviderAdapter {
  // Bridge old code to the new plugin registry
  const plugin = getProviderWithFallback(provider as string);

  return {
    async generateText(params) {
      const mergedParams = { ...params, apiKey: ctx?.apiKey };

      try {
        if (!plugin) throw new Error(`No provider plugin found for: ${provider}`);
        const result = await plugin.execute("SCRIPT", mergedParams);
        if (typeof result === "string") return result;
        if (result && typeof result === "object" && "text" in result) return result.text as string;
        return String(result ?? "");
      } catch (primaryErr: any) {
        // If primary provider failed with credit/auth/quota error, try fallback providers
        const errMsg = String(primaryErr?.message || "");
        const isAuthOrCreditError =
          errMsg.includes("402") ||
          errMsg.includes("Insufficient credits") ||
          errMsg.includes("401") ||
          errMsg.includes("API key not valid") ||
          errMsg.includes("API_KEY_INVALID") ||
          errMsg.includes("invalid_api_key") ||
          errMsg.includes("quota") ||
          errMsg.includes("billing");

        if (isAuthOrCreditError) {
          const fallbackCandidates = ["google", "groq", "pollinations"].filter((id) => id !== plugin?.id);
          for (const fallbackId of fallbackCandidates) {
            const fallbackPlugin = AIProviderRegistry.getPlugin(fallbackId);
            if (!fallbackPlugin) continue;
            try {
              console.warn(`[providerFactory] Primary provider ${plugin?.id || provider} failed (${primaryErr.message}). Attempting fallback to ${fallbackId}...`);
              const fbResult = await fallbackPlugin.execute("SCRIPT", mergedParams);
              if (typeof fbResult === "string") return fbResult;
              if (fbResult && typeof fbResult === "object" && "text" in fbResult) return fbResult.text as string;
              return String(fbResult ?? "");
            } catch (fbErr: any) {
              console.warn(`[providerFactory] Fallback provider ${fallbackId} failed: ${fbErr?.message}`);
            }
          }
        }
        throw primaryErr;
      }
    },
  };
}
