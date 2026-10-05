export interface AudioAssetCandidate {
  readonly providerId: "FREESOUND";
  readonly assetId: string;
  readonly name: string;
  readonly sourceUrl: string;
  readonly downloadUrl?: string;
  readonly previewUrl?: string;
  readonly creator: string;
  readonly license: "Attribution" | "Attribution NonCommercial" | "Creative Commons 0" | string;
  readonly tags: readonly string[];
  readonly score?: number;
  readonly genAiPreference?: string;
  readonly retrievedAt: string;
}

export interface AudioAssetSearchProvider {
  readonly id: string;
  search(query: string, count?: number): Promise<readonly AudioAssetCandidate[]>;
  isConfigured(): boolean;
}

export class FreesoundAudioProvider implements AudioAssetSearchProvider {
  readonly id = "FREESOUND";
  private readonly apiKey = process.env.FREESOUND_API_KEY?.trim() || "";

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async search(query: string, count = 5): Promise<readonly AudioAssetCandidate[]> {
    if (!this.isConfigured()) return [];

    const url = new URL("https://freesound.org/apiv2/search/");
    url.searchParams.set("query", query);
    url.searchParams.set("page_size", String(Math.min(Math.max(count, 1), 50)));
    url.searchParams.set(
      "fields",
      "id,name,tags,username,license,url,previews,score,gen_ai_preference",
    );
    // Freesound APIv2 requires the credential in the token query parameter.
    url.searchParams.set("token", this.apiKey);

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(
        "[FreesoundAudioProvider] Upstream HTTP " + response.status,
      );
    }

    const payload: any = await response.json();
    if (!Array.isArray(payload?.results)) {
      throw new Error("[FreesoundAudioProvider] Malformed search response.");
    }

    return payload.results
      .slice(0, Math.min(Math.max(count, 1), 50))
      .flatMap((item: any) => {
        if (!item?.id || typeof item?.name !== "string") return [];

        const preview =
          item?.previews?.["preview-hq-mp3"] ||
          item?.previews?.["preview-lq-mp3"] ||
          undefined;

        return [{
          providerId: "FREESOUND" as const,
          assetId: String(item.id),
          name: item.name,
          sourceUrl:
            typeof item.url === "string"
              ? item.url
              : "https://freesound.org/",
          downloadUrl:
            "https://freesound.org/apiv2/sounds/" +
            encodeURIComponent(String(item.id)) +
            "/download/",
          previewUrl: preview,
          creator:
            typeof item.username === "string"
              ? item.username
              : "Unknown creator",
          license:
            typeof item.license === "string"
              ? item.license
              : "Unknown",
          tags: Array.isArray(item.tags)
            ? item.tags.filter((tag: unknown): tag is string => typeof tag === "string")
            : [],
          score:
            typeof item.score === "number" ? item.score : undefined,
          genAiPreference:
            typeof item.gen_ai_preference === "string"
              ? item.gen_ai_preference
              : undefined,
          retrievedAt: new Date().toISOString(),
        }];
      });
  }
}
