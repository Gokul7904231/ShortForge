import {
  AIProviderPlugin,
  AICapability,
  ModelMeta,
  ProviderHealthMetrics,
  PluginManifest,
  ProviderState,
} from "../capability-registry";
import {
  ChatAdapter,
  ImageAdapter,
  SpeechAdapter,
  EmbeddingAdapter,
  VisionAdapter,
} from "../execution-adapters";

export abstract class BaseProviderPlugin implements AIProviderPlugin {
  abstract id: string;
  abstract name: string;
  abstract manifest: PluginManifest;

  protected apiKey: string = "";
  protected baseUrl: string = "";

  updateConfig(config: { apiKey?: string; baseUrl?: string; options?: any }): void {
    if (config.apiKey) this.apiKey = config.apiKey;
    if (config.baseUrl) this.baseUrl = config.baseUrl;
  }

  protected metrics: ProviderHealthMetrics = {
    state: "INITIALIZING",
    latency: 0,
    avgResponseTime: 0.0,
    errorRate: 0.0,
    totalCost: {
      tokensInput: 0,
      tokensOutput: 0,
      estimatedUSD: 0,
      currency: "USD",
      pricingSource: "free",
      lastUpdated: Date.now(),
    },
    retries: 0,
    retryRate: 0.0,
    quotaRemaining: -1,
    rateLimitLimit: -1,
    rateLimitRemaining: -1,
    rateLimitReset: 0,
    jsonReliability: 1.0,
    lastChecked: Date.now(),
  };

  // Typed Adapters (overridden by sub-classes if supported)
  protected chatAdapter?: ChatAdapter;
  protected imageAdapter?: ImageAdapter;
  protected speechAdapter?: SpeechAdapter;
  protected embeddingAdapter?: EmbeddingAdapter;
  protected visionAdapter?: VisionAdapter;

  abstract discoverModels(): Promise<ModelMeta[]>;
  protected abstract authenticateGuard(): Promise<void>;

  // Lifecycle Hooks
  async initialize(): Promise<void> {
    console.log(`[BaseProviderPlugin] [${this.id}] Initializing...`);
    this.metrics.state = "ONLINE";
  }

  async warmup(): Promise<void> {
    console.log(`[BaseProviderPlugin] [${this.id}] Warming up...`);
  }

  async shutdown(): Promise<void> {
    console.log(`[BaseProviderPlugin] [${this.id}] Shutting down...`);
    this.metrics.state = "OFFLINE";
  }

  async cleanup(): Promise<void> {
    console.log(`[BaseProviderPlugin] [${this.id}] Cleaning up...`);
  }

  supportsCapability(capability: AICapability, requirements: any = {}): boolean {
    if (!this.manifest.capabilities.includes(capability)) {
      return false;
    }
    // Sub-classes can implement deeper criteria negotiation checks
    return true;
  }

  async health(): Promise<boolean> {
    return this.metrics.state !== "OFFLINE" && this.metrics.state !== "AUTH FAILED";
  }

  priority(): number {
    return 50; // default medium priority
  }

  status(): ProviderHealthMetrics {
    return this.metrics;
  }

  describe(): any {
    return {
      provider: this.name,
      supports: this.manifest.capabilities,
      recommendedProfiles: ["Balanced", "Production"],
      limitations: this.id === "local" ? [] : ["No local mode"],
    };
  }

  /**
   * Executes a capability call with full rate limit protection, metrics tracking, and exponential backoff retry controls.
   */
  async execute(capability: AICapability, params: any, signal?: AbortSignal): Promise<any> {
    const start = Date.now();
    this.metrics.lastChecked = start;

    // 0. Dry Run Guard (Rule 12)
    if (params.dryRun) {
      console.log(`[BaseProviderPlugin] [${this.id}] Running dry run for capability: ${capability}`);
      return {
        provider: this.id,
        model: params.model || "dry-run-model",
        estimatedCost: 0.0,
        estimatedTokens: 100,
        expectedLatency: 1500,
      };
    }

    // 1. Authenticate Guard
    await this.authenticateGuard();

    // 2. Rate Limit Guard
    this.checkRateLimitGuard();

    const maxAttempts = 3;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;
      if (signal?.aborted) {
        throw new DOMException("Execution cancelled by abort signal", "AbortError");
      }

      try {
        let result: any;

        // Route task execution to the appropriate typed adapter
        switch (capability) {
          case "SCRIPT":
            if (!this.chatAdapter) throw new Error("ChatAdapter not supported by this provider.");
            const chatRes = await this.chatAdapter.generateText(params, signal);
            result = chatRes.text;
            this.recordTokensUsage(chatRes.usage.inputTokens, chatRes.usage.outputTokens, params.model);
            break;

          case "IMAGE":
            if (!this.imageAdapter) throw new Error("ImageAdapter not supported by this provider.");
            result = await this.imageAdapter.generateImage(params, signal);
            break;

          case "SPEECH":
            if (!this.speechAdapter) throw new Error("SpeechAdapter not supported by this provider.");
            result = await this.speechAdapter.generateSpeech(params, signal);
            break;

          case "EMBEDDING":
            if (!this.embeddingAdapter) throw new Error("EmbeddingAdapter not supported by this provider.");
            const embedRes = await this.embeddingAdapter.generateEmbeddings(params.texts, signal);
            result = embedRes.embeddings;
            this.recordTokensUsage(embedRes.usage.tokens, 0, params.model);
            break;

          case "VISION":
            if (!this.visionAdapter) throw new Error("VisionAdapter not supported by this provider.");
            const visionRes = await this.visionAdapter.analyzeImage(params, signal);
            result = visionRes.text;
            this.recordTokensUsage(visionRes.usage.inputTokens, visionRes.usage.outputTokens, params.model);
            break;

          default:
            throw new Error(`Capability ${capability} is not currently routed by Provider base execution.`);
        }

        // Execution succeeded: Record success metrics
        const duration = Date.now() - start;
        this.updateSuccessMetrics(duration, attempt > 1);
        return result;

      } catch (err: any) {
        console.warn(`[BaseProviderPlugin] [${this.id}] Attempt ${attempt} failed: ${err.message}`);
        
        const errMsg = String(err?.message || "");
        const isFatalError =
          err?.isRetryable === false ||
          errMsg.includes("API key not valid") ||
          errMsg.includes("API_KEY_INVALID") ||
          errMsg.includes("Insufficient credits") ||
          errMsg.includes("402") ||
          errMsg.includes("401");

        if (attempt >= maxAttempts || isFatalError || err?.name === "AbortError" || signal?.aborted) {
          this.updateFailureMetrics();
          throw err;
        }

        // Apply exponential backoff with full jitter
        const backoffBase = 1000;
        const maxBackoff = 6000;
        const backoffLimit = Math.min(maxBackoff, backoffBase * Math.pow(2, attempt));
        const backoffWithJitter = Math.random() * backoffLimit;
        
        console.log(`[BaseProviderPlugin] [${this.id}] Retrying in ${backoffWithJitter.toFixed(0)}ms...`);
        await new Promise((res) => setTimeout(res, backoffWithJitter));
      }
    }
  }

  protected checkRateLimitGuard(): void {
    if (this.metrics.rateLimitRemaining === 0 && Date.now() < this.metrics.rateLimitReset) {
      this.metrics.state = "RATE LIMITED";
      throw new Error(`[BaseProviderPlugin] Provider ${this.id} is rate-limited. Reset at ${new Date(this.metrics.rateLimitReset).toISOString()}`);
    }
  }

  protected updateRateLimitMetrics(headers: Headers): void {
    const remaining = headers.get("x-ratelimit-remaining") || headers.get("ratelimit-remaining");
    const limit = headers.get("x-ratelimit-limit") || headers.get("ratelimit-limit");
    const reset = headers.get("x-ratelimit-reset") || headers.get("ratelimit-reset");

    if (remaining) this.metrics.rateLimitRemaining = parseInt(remaining, 10);
    if (limit) this.metrics.rateLimitLimit = parseInt(limit, 10);
    if (reset) {
      const resetVal = parseFloat(reset);
      if (resetVal < 100000) {
        this.metrics.rateLimitReset = Date.now() + resetVal * 1000;
      } else {
        this.metrics.rateLimitReset = resetVal * 1000;
      }
    }

    if (this.metrics.rateLimitRemaining > 0) {
      this.metrics.state = "ONLINE";
    }
  }

  private updateSuccessMetrics(duration: number, wasRetried: boolean) {
    this.metrics.state = "ONLINE";
    this.metrics.latency = duration;
    this.metrics.avgResponseTime = this.metrics.avgResponseTime * 0.9 + duration * 0.1;
    this.metrics.errorRate = this.metrics.errorRate * 0.9 + 0.0 * 0.1;
    this.metrics.retryRate = this.metrics.retryRate * 0.9 + (wasRetried ? 1.0 : 0.0) * 0.1;
  }

  private updateFailureMetrics() {
    this.metrics.state = "DEGRADED";
    this.metrics.errorRate = this.metrics.errorRate * 0.9 + 1.0 * 0.1;
  }

  private recordTokensUsage(input: number, output: number, modelId?: string) {
    this.metrics.totalCost.tokensInput += input;
    this.metrics.totalCost.tokensOutput += output;
    
    // Estimate cost (pricing scales parsed in future ModelPlugins)
    const costInputEst = (input / 1000000) * 0.15; // default avg $0.15/1M
    const costOutputEst = (output / 1000000) * 0.60; // default avg $0.60/1M
    this.metrics.totalCost.estimatedUSD += costInputEst + costOutputEst;
    this.metrics.totalCost.lastUpdated = Date.now();
  }
}
