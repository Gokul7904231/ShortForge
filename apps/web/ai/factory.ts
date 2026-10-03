/**
 * @deprecated Legacy compatibility bridge.
 *
 * Production model execution must flow through IntelligentRouter + Treasury.
 * Non-production callers may still use the historical direct-provider fallback
 * behavior until their routes are migrated.
 */
import { AIProviderRegistry } from "./capability-registry";
import { LLMProvider, LLMProviderAdapter, TreasuryModelExecutionContext } from "./provider";
import { IntelligentRouter } from "./intelligent-router";
import { getProviderWithFallback } from "./providers/factory_with_fallback";

export function providerFactory(
  provider: LLMProvider,
  ctx: {
    apiKey?: string;
    treasuryContext?: TreasuryModelExecutionContext;
  },
): LLMProviderAdapter {
  return {
    async generateText(params) {
      if (process.env.NODE_ENV === "production") {
        const treasuryContext = ctx?.treasuryContext;
        if (!treasuryContext) {
          throw new Error(
            "[providerFactory] Production model execution requires TreasuryModelExecutionContext; direct provider fallback is disabled",
          );
        }

        IntelligentRouter.bindTreasury(
          treasuryContext.treasuryService,
          true,
        );

        const result = await IntelligentRouter.routeExecute(
          {
            capability: "SCRIPT",
            subtask: treasuryContext.subtask || "legacy_agent",
            maxCostLimit:
              treasuryContext.maxCostUsd ??
              Number(
                process.env.FACTORYOS_MAX_INFERENCE_RESERVATION_USD ?? "0.10",
              ),
            maxRetries: treasuryContext.maxRetries ?? 0,
            overseerCommandId: treasuryContext.overseerCommandId,
            accountId: treasuryContext.accountId,
            missionId: treasuryContext.missionId,
            runId: treasuryContext.runId,
            floorId: treasuryContext.floorId,
            taskId: treasuryContext.taskId,
            scopeFingerprint: treasuryContext.scopeFingerprint,
            priority: treasuryContext.priority ?? "NORMAL",
            preferredProviderId: treasuryContext.preferredProviderId ?? provider,
          },
          {
            ...params,
            apiKey: ctx?.apiKey,
          },
        );

        if (typeof result === "string") return result;
        if (
          result &&
          typeof result === "object" &&
          "text" in result
        ) {
          return result.text as string;
        }
        return String(result ?? "");
      }

      const normalizedProvider =
        provider === "gemini" ? "google" : provider;
      const plugin =
        getProviderWithFallback(normalizedProvider as string);

      try {
        if (!plugin) {
          throw new Error(
            "No provider plugin found for: " + provider,
          );
        }

        const mergedParams = {
          ...params,
          apiKey: ctx?.apiKey,
        };
        const result = await plugin.execute("SCRIPT", mergedParams);

        if (typeof result === "string") return result;
        if (
          result &&
          typeof result === "object" &&
          "text" in result
        ) {
          return result.text as string;
        }
        return String(result ?? "");
      } catch (primaryErr: any) {
        const errMsg = String(primaryErr?.message || "").toLowerCase();
        const isAuthOrCreditError =
          errMsg.includes("402") ||
          errMsg.includes("insufficient credits") ||
          errMsg.includes("401") ||
          errMsg.includes("api key not valid") ||
          errMsg.includes("api_key_invalid") ||
          errMsg.includes("invalid_api_key") ||
          errMsg.includes("quota") ||
          errMsg.includes("billing");

        if (!isAuthOrCreditError) {
          throw primaryErr;
        }

        const fallbackCandidates = [
          "google",
          "groq",
          "pollinations",
        ].filter((id) => id !== plugin?.id);

        for (const fallbackId of fallbackCandidates) {
          const fallbackPlugin = AIProviderRegistry.getPlugin(fallbackId);
          if (!fallbackPlugin) continue;
          try {
            const result = await fallbackPlugin.execute("SCRIPT", {
              ...params,
              apiKey: ctx?.apiKey,
            });
            if (typeof result === "string") return result;
            if (
              result &&
              typeof result === "object" &&
              "text" in result
            ) {
              return result.text as string;
            }
            return String(result ?? "");
          } catch {}
        }

        throw primaryErr;
      }
    },
  };
}
