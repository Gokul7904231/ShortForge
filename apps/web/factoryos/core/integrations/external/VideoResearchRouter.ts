import {
  VideoResearchError,
  type VideoResearchProvider,
  type VideoTranscript,
  type VideoTranscriptOptions,
  type VideoSearchResult,
} from "./VideoResearchContracts";
import {
  ArcmiraVideoProvider,
  TranscriptYTProvider,
  VidWordsProvider,
  TubeToTranscriptProvider,
  YouTubeDataApiProvider,
} from "./VideoResearchProviders";

export interface VideoResearchRouterOptions {
  readonly providers?: readonly Provider[];
  readonly transcriptOrder?: readonly string[];
  readonly searchOrder?: readonly string[];
}

export class VideoResearchRouter {
  private readonly providers: readonly VideoResearchProvider[];
  private readonly transcriptOrder: readonly string[];
  private readonly searchOrder: readonly string[];

  constructor(options: VideoResearchRouterOptions = {}) {
    this.providers = options.providers ?? [
      new TranscriptYTProvider(),
      new ArcmiraVideoProvider(),
      new TubeToTranscriptProvider(),
      new VidWordsProvider(),
      new YouTubeDataApiProvider(),
    ];
    this.transcriptOrder =
      options.transcriptOrder ??
      (process.env.VIDEO_TRANSCRIPT_PROVIDER_ORDER || "")
        .split(",")
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean);
    this.searchOrder =
      options.searchOrder ??
      (process.env.VIDEO_SEARCH_PROVIDER_ORDER || "")
        .split(",")
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean);
  }

  private find(id: string): VideoResearchProvider | undefined {
    return this.providers.find((provider) => provider.id === id);
  }

  private defaultTranscriptOrder(): readonly string[] {
    return [
      "transcriptyt",
      "arcmira",
      "tubetotranscript",
      "vidwords",
    ];
  }

  private defaultSearchOrder(): readonly string[] {
    return ["arcmira", "youtube_data_api"];
  }

  async transcript(
    videoRef: string,
    options: VideoTranscriptOptions = {},
  ): Promise<VideoTranscript> {
    const order =
      this.transcriptOrder.length > 0
        ? this.transcriptOrder
        : this.defaultTranscriptOrder();
    const errors: string[] = [];

    for (const id of order) {
      const provider = this.find(id);
      if (!provider?.transcript) continue;
      if (!(await provider.health().catch(() => false))) continue;

      try {
        return await provider.transcript(videoRef, options);
      } catch (error) {
        errors.push(
          error instanceof Error ? provider.id + ": " + error.message : provider.id,
        );
      }
    }

    throw new VideoResearchError(
      "video-research-router",
      errors.length
        ? "All configured transcript providers failed: " + errors.join(" | ")
        : "No configured transcript provider is available.",
      { retryable: true },
    );
  }

  async search(
    query: string,
    count = 5,
  ): Promise<readonly VideoSearchResult[]> {
    const targetOrder =
      this.searchOrder.length > 0
        ? this.searchOrder
        : this.defaultSearchOrder();
    const collected: VideoSearchResult[] = [];
    const seen = new Set<string>();

    for (const id of targetOrder) {
      const provider = this.find(id);
      if (!provider) continue;
      if (!(await provider.health().catch(() => false))) continue;

      try {
        const results = await provider.search(query, count);
        for (const result of results) {
          if (seen.has(result.videoId)) continue;
          seen.add(result.videoId);
          collected.push(result);
          if (collected.length >= count) return collected;
        }
      } catch {
        // Search is a fallback fabric; one provider failure must not block the next.
      }
    }
    return collected.slice(0, count);
  }

  async healthSnapshot(): Promise<readonly {
    provider: string;
    capabilities: readonly string[];
    configured: boolean;
  }[]> {
    return Promise.all(
      this.providers.map(async (provider) => ({
        provider: provider.id,
        capabilities: provider.capabilities,
        configured: await provider.health().catch(() => false),
      })),
    );
  }
}

export {
  ArcmiraVideoProvider,
  TranscriptYTProvider,
  VidWordsProvider,
  TubeToTranscriptProvider,
  YouTubeDataApiProvider,
};
