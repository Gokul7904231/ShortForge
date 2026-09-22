import { ModelMeta, PluginManifest, ProviderHealthMetrics } from "../../capability-registry";
import { BaseProviderPlugin } from "../base-provider";
import { PollinationsHealthTracker } from "./health";
import { PollinationsModelDiscovery } from "./models";
import { PollinationsMapper } from "./mapper";

export class PollinationsProviderPlugin extends BaseProviderPlugin {
  id = "pollinations";
  name = "Pollinations Provider";

  manifest: PluginManifest = {
    id: "pollinations",
    name: "Pollinations Provider",
    version: "1.0.0",
    author: "ShortFactory Core Team",
    description: "Dynamic multi-modal provider routing text, image, video, and audio requests to Pollinations AI",
    dependencies: [],
    capabilities: ["SCRIPT", "IMAGE", "SPEECH", "VISION"],
  };

  protected apiKey = process.env.POLLINATIONS_API_KEY || "";
  protected baseUrl = "https://gen.pollinations.ai";
  private imageBaseUrl = "https://image.pollinations.ai";

  private healthTracker: PollinationsHealthTracker;

  constructor() {
    super();
    this.healthTracker = new PollinationsHealthTracker(this.metrics);
    this.setupAdapters();
  }

  private setupAdapters() {
    // 1. Text Completions (OpenAI Compatible)
    this.chatAdapter = {
      id: "pollinations-chat",
      generateText: async (params, signal) => {
        const modelName = params.model ? params.model.replace("pollinations/", "") : "openai";
        const body = PollinationsMapper.mapTextParams(params, modelName);
        
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (this.apiKey) {
          headers["Authorization"] = `Bearer ${this.apiKey}`;
        }

        const start = Date.now();
        const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal,
        });

        if (!res.ok) {
          const errText = await res.text();
          this.healthTracker.recordFailure();
          throw new Error(`Pollinations Text API returned HTTP ${res.status}: ${errText}`);
        }

        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || "";
        const usage = data?.usage || {
          prompt_tokens: Math.round(params.prompt.length / 4),
          completion_tokens: Math.round(text.length / 4),
        };

        this.healthTracker.recordSuccess(Date.now() - start);

        return {
          text,
          usage: {
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
          },
        };
      },
    };

    // 2. Image Generation (/image or /p/{prompt})
    this.imageAdapter = {
      id: "pollinations-image",
      generateImage: async (params, signal) => {
        const modelName = params.model ? params.model.replace("pollinations/", "") : "flux";
        const queryPath = PollinationsMapper.mapImageQuery(params, modelName);
        const imageUrl = `${this.imageBaseUrl}${queryPath}`;

        console.log(`[PollinationsImage] Proxying request to: ${imageUrl}`);
        const start = Date.now();

        const headers: Record<string, string> = {};
        if (this.apiKey) {
          headers["Authorization"] = `Bearer ${this.apiKey}`;
        }

        const res = await fetch(imageUrl, { headers, signal });
        if (!res.ok) {
          this.healthTracker.recordFailure();
          throw new Error(`Pollinations Image API returned HTTP ${res.status}`);
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        this.healthTracker.recordSuccess(Date.now() - start);

        return {
          imageUrl,
          rawBytes: buffer,
        };
      },
    };

    // 3. Audio / Speech Synthesis (Future proof /audio proxy)
    this.speechAdapter = {
      id: "pollinations-speech",
      generateSpeech: async (params, signal) => {
        const prompt = encodeURIComponent(params.text || "");
        const voice = params.voiceId || "alloy";
        const audioUrl = `${this.baseUrl}/audio?prompt=${prompt}&voice=${voice}`;
        
        console.log(`[PollinationsSpeech] Proxying request to: ${audioUrl}`);
        const start = Date.now();

        const headers: Record<string, string> = {};
        if (this.apiKey) {
          headers["Authorization"] = `Bearer ${this.apiKey}`;
        }

        const res = await fetch(audioUrl, { headers, signal });
        if (!res.ok) {
          this.healthTracker.recordFailure();
          throw new Error(`Pollinations Audio API returned HTTP ${res.status}`);
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        this.healthTracker.recordSuccess(Date.now() - start);

        return {
          audioUrl,
          rawBytes: buffer,
        };
      },
    };

    // 4. Video Generation (Future proof /video proxy)
    this.visionAdapter = {
      id: "pollinations-video",
      analyzeImage: async (params, signal) => {
        // Fallback or dynamic video generation endpoint mapping
        const prompt = encodeURIComponent(params.prompt || "");
        const videoUrl = `${this.baseUrl}/video?prompt=${prompt}`;

        console.log(`[PollinationsVideo] Proxying request to: ${videoUrl}`);
        const start = Date.now();

        const headers: Record<string, string> = {};
        if (this.apiKey) {
          headers["Authorization"] = `Bearer ${this.apiKey}`;
        }

        const res = await fetch(videoUrl, { headers, signal });
        if (!res.ok) {
          this.healthTracker.recordFailure();
          throw new Error(`Pollinations Video API returned HTTP ${res.status}`);
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        this.healthTracker.recordSuccess(Date.now() - start);

        return {
          text: `Generated video url: ${videoUrl}`,
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      },
    };
  }

  async authenticateGuard(): Promise<void> {
    // Pollinations does not strictly enforce authorization keys (community mode),
    // but if sk_xxxx is set we bypass or apply it to headers.
  }

  async discoverModels(): Promise<ModelMeta[]> {
    return PollinationsModelDiscovery.discover(this.baseUrl, this.apiKey);
  }

  async health(): Promise<boolean> {
    return this.healthTracker.checkUptime(this.baseUrl);
  }
}
