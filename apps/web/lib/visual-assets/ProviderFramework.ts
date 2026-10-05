import { CandidateAsset, VisualContext } from "./VisualIntelligenceTypes";

export interface MediaProvider {
  id: string;
  search(query: string, count: number): Promise<CandidateAsset[]>;
  health(): Promise<boolean>;
}

export class WikimediaProvider implements MediaProvider {
  id = "wikimedia";

  async search(query: string, count = 5): Promise<CandidateAsset[]> {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
      query
    )}&gsrlimit=${count}&prop=imageinfo&iiprop=url|size|extmetadata`;

    try {
      const res = await fetch(url);
      if (!res.ok) return [];

      const data = await res.json();
      const pages = data?.query?.pages || {};
      const results: CandidateAsset[] = [];

      for (const key of Object.keys(pages)) {
        const pageData = pages[key];
        const info = pageData?.imageinfo?.[0];
        if (!info?.url) continue;

        const extmetadata = info.extmetadata || {};
        const artistHtml = extmetadata.Artist?.value || "Unknown Artist";
        const author = artistHtml.replace(/<[^>]*>/g, "").trim();
        const imageDescription = extmetadata.ImageDescription?.value || "";

        const licenseName = extmetadata.LicenseShortName?.value || "CC-BY";
        const attributionRequired = !["cc0", "pd", "public domain"].includes(licenseName.toLowerCase());

        const credits = `Image by ${author}. Source: ${info.descriptionurl || "https://commons.wikimedia.org"}. License: ${licenseName}`;

        results.push({
          id: `wiki_${pageData.pageid || Math.random()}`,
          storageKey: "",
          sha256: "",
          dhash: "",
          license: licenseName,
          author,
          sourceUrl: info.descriptionurl || "https://commons.wikimedia.org",
          originalUrl: info.url,
          title: pageData.title || info.title || "",
          description: imageDescription.replace(/<[^>]*>/g, "").trim().slice(0, 200),
          credits,
          attributionRequired,
          qualityScore: 8.0,
          width: info.width || 1080,
          height: info.height || 1920,
          tags: [query.toLowerCase()],
          source: "wikimedia",
          usageCount: 0,
        } as any);
      }

      return results;
    } catch {
      return [];
    }
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch("https://commons.wikimedia.org/w/api.php?action=query&format=json", { method: "HEAD" });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export class OpenverseProvider implements MediaProvider {
  id = "openverse";

  async search(query: string, count = 5): Promise<CandidateAsset[]> {
    const url = `https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(query)}&page_size=${count}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return [];

      const data = await res.json();
      const results = data?.results || [];

      return results.map((item: any) => {
        const licenseName = item.license ? String(item.license).toUpperCase() : "CC-BY";
        const attributionRequired = !["CC0", "PDM", "PUBLIC DOMAIN"].includes(licenseName);
        const author = item.creator || "Unknown Creator";
        const credits = `Image by ${author}. Source: ${item.foreign_landing_url || "https://openverse.org"}. License: ${licenseName}`;

        return {
          id: `open_${item.id || Math.random()}`,
          storageKey: "",
          sha256: "",
          dhash: "",
          license: licenseName,
          author,
          sourceUrl: item.foreign_landing_url || "https://openverse.org",
          originalUrl: item.url,
          title: item.title || "",
          description: (item.description || "").slice(0, 200),
          credits,
          attributionRequired,
          qualityScore: 7.5,
          width: item.width || 1080,
          height: item.height || 1920,
          tags: [query.toLowerCase()],
          source: "openverse",
          usageCount: 0,
        } as any;
      });
    } catch {
      return [];
    }
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch("https://api.openverse.engineering/v1/", { method: "HEAD" });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// Future expansion stub adapters
function scoreResolution(width: number, height: number): number {
  const pixels = Math.max(0, width) * Math.max(0, height);
  if (pixels >= 3840 * 2160) return 9.8;
  if (pixels >= 2560 * 1440) return 9.2;
  if (pixels >= 1920 * 1080) return 8.6;
  if (pixels >= 1080 * 1350) return 8.0;
  return 7.0;
}

function createCandidate(
  source: CandidateAsset["source"],
  id: string,
  values: Omit<CandidateAsset, "source" | "id" | "usageCount">,
): CandidateAsset {
  return { id, source, usageCount: 0, ...values };
}

export class PixabayProvider implements MediaProvider {
  id = "pixabay";
  private readonly apiKey = process.env.PIXABAY_API_KEY?.trim() || "";

  async search(query: string, count = 5): Promise<CandidateAsset[]> {
    if (!this.apiKey) return [];

    const url = new URL("https://pixabay.com/api/");
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("q", query);
    url.searchParams.set("image_type", "photo");
    url.searchParams.set("safesearch", "true");
    url.searchParams.set("per_page", String(Math.min(Math.max(count, 3), 200)));

    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return [];

      const data = await res.json();
      const hits = Array.isArray(data?.hits) ? data.hits : [];

      return hits.slice(0, count).flatMap((item: any) => {
        if (!item?.id || !item?.webformatURL) return [];

        const pageUrl =
          typeof item?.pageURL === "string"
            ? item.pageURL
            : "https://pixabay.com/";
        const author =
          typeof item?.user === "string" ? item.user : "Unknown contributor";
        const width = Number(item?.imageWidth) || 1080;
        const height = Number(item?.imageHeight) || 1920;
        const credits = `Image by ${author} on Pixabay: ${pageUrl}`;

        return [
          createCandidate("pixabay", `pixabay_${item.id}`, {
            storageKey: "",
            sha256: "",
            dhash: "",
            license: "Pixabay Content License",
            author,
            sourceUrl: pageUrl,
            originalUrl:
              typeof item?.largeImageURL === "string"
                ? item.largeImageURL
                : item.webformatURL,
            title: typeof item?.tags === "string" ? item.tags : "",
            description:
              typeof item?.tags === "string" ? item.tags.slice(0, 200) : "",
            credits,
            attributionRequired: true,
            qualityScore: scoreResolution(width, height),
            width,
            height,
            tags:
              typeof item?.tags === "string"
                ? item.tags
                    .toLowerCase()
                    .split(/,\s*/)
                    .filter(Boolean)
                    .slice(0, 20)
                : [query.toLowerCase()],
            usagePolicy: {
              attributionRequired: true,
              attributionText: credits,
              providerPolicy:
                "Cache API results and download selected images to server storage; do not permanently hotlink image URLs.",
              materialization: "DOWNLOAD_TO_CAS",
            },
          }),
        ];
      });
    } catch {
      return [];
    }
  }

  async health(): Promise<boolean> {
    return Boolean(this.apiKey);
  }
}

export class PexelsProvider implements MediaProvider {
  id = "pexels";
  private readonly apiKey = process.env.PEXELS_API_KEY?.trim() || "";

  async search(query: string, count = 5): Promise<CandidateAsset[]> {
    if (!this.apiKey) return [];

    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(Math.min(Math.max(count, 1), 80)));

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: this.apiKey,
          Accept: "application/json",
        },
      });
      if (!res.ok) return [];

      const data = await res.json();
      const photos = Array.isArray(data?.photos) ? data.photos : [];

      return photos.slice(0, count).flatMap((item: any) => {
        if (!item?.id || !item?.src?.original) return [];

        const pageUrl =
          typeof item?.url === "string"
            ? item.url
            : "https://www.pexels.com/";
        const author =
          typeof item?.photographer === "string"
            ? item.photographer
            : "Unknown photographer";
        const width = Number(item?.width) || 1080;
        const height = Number(item?.height) || 1920;
        const credits = `Photo by ${author} on Pexels: ${pageUrl}`;

        return [
          createCandidate("pexels", `pexels_${item.id}`, {
            storageKey: "",
            sha256: "",
            dhash: "",
            license: "Pexels License",
            author,
            sourceUrl: pageUrl,
            originalUrl: item.src.original,
            title: typeof item?.alt === "string" ? item.alt : "",
            description:
              typeof item?.alt === "string" ? item.alt.slice(0, 200) : "",
            credits,
            attributionRequired: true,
            qualityScore: scoreResolution(width, height),
            width,
            height,
            tags:
              typeof item?.alt === "string" && item.alt.trim()
                ? item.alt
                    .toLowerCase()
                    .split(/[^a-z0-9]+/)
                    .filter(Boolean)
                    .slice(0, 12)
                : [query.toLowerCase()],
            usagePolicy: {
              attributionRequired: true,
              attributionText: credits,
              providerPolicy:
                "Show a prominent Pexels link and credit photographers when possible.",
              materialization: "DOWNLOAD_TO_CAS",
            },
          }),
        ];
      });
    } catch {
      return [];
    }
  }

  async health(): Promise<boolean> {
    return Boolean(this.apiKey);
  }
}

export class PexafyProvider implements MediaProvider {
  id = "pexafy";
  private readonly apiKey = process.env.PEXAFY_API_KEY?.trim() || "";

  async search(query: string, count = 5): Promise<CandidateAsset[]> {
    if (!this.apiKey) return [];

    const url = new URL(
      "https://api.pexafy.com/api/v1/search/photos",
    );
    url.searchParams.set("q", query);
    url.searchParams.set(
      "per_page",
      String(Math.min(Math.max(count, 1), 100)),
    );
    url.searchParams.set("orientation", "portrait");

    try {
      const res = await fetch(url, {
        headers: {
          "x-api-key": this.apiKey,
          Accept: "application/json",
        },
      });
      if (!res.ok) return [];

      const data = await res.json();
      const photos = Array.isArray(data?.data) ? data.data : [];

      return photos.slice(0, count).flatMap((item: any) => {
        const id = item?.photo_id;
        const original =
          item?.urls?.full ||
          item?.urls?.large ||
          item?.urls?.regular ||
          item?.urls?.small;
        if (!id || !original) return [];

        const attributionPlain =
          typeof item?.attribution?.plain === "string"
            ? item.attribution.plain
            : "";
        const sourceName =
          typeof item?.source === "string" ? item.source : "Pexafy";
        const licenseName =
          typeof item?.license_type === "string"
            ? item.license_type
            : "unknown";
        const credits =
          attributionPlain ||
          `Provided via Pexafy; source library: ${sourceName}`;

        return [
          createCandidate("pexafy", `pexafy_${id}`, {
            storageKey: "",
            sha256: "",
            dhash: "",
            license: licenseName,
            author:
              typeof item?.photographer_username === "string"
                ? item.photographer_username
                : "Unknown photographer",
            sourceUrl: "https://pexafy.com/",
            originalUrl: original,
            title:
              typeof item?.alt_description === "string"
                ? item.alt_description
                : typeof item?.description === "string"
                  ? item.description
                  : "",
            description:
              typeof item?.description === "string"
                ? item.description.slice(0, 200)
                : "",
            credits,
            attributionRequired: false,
            qualityScore:
              typeof item?.relevance_score === "number"
                ? Math.max(0, Math.min(10, item.relevance_score * 10))
                : 7.5,
            width:
              Number(item?.width) ||
              (item?.orientation === "landscape" ? 1920 : 1080),
            height:
              Number(item?.height) ||
              (item?.orientation === "landscape" ? 1080 : 1920),
            tags: [
              query.toLowerCase(),
              sourceName.toLowerCase(),
            ].filter(Boolean),
            usagePolicy: {
              attributionRequired: false,
              attributionText: credits,
              providerPolicy:
                "Pexafy documents returned photos as free to use without attribution; preserve source/license metadata and follow applicable source terms.",
              materialization: "DOWNLOAD_TO_CAS",
            },
          }),
        ];
      });
    } catch {
      return [];
    }
  }

  async health(): Promise<boolean> {
    return Boolean(this.apiKey);
  }
}

export class InternalLibraryProvider implements MediaProvider {
  id = "internal";
  async search(): Promise<CandidateAsset[]> { return []; }
  async health(): Promise<boolean> { return true; }
}

export class AIGenProvider implements MediaProvider {
  id = "ai_fallback";
  async search(): Promise<CandidateAsset[]> { return []; }
  async health(): Promise<boolean> { return true; }
}

export class ProviderFramework {
  private providers = new Map<string, MediaProvider>();

  constructor() {
    this.providers.set("wikimedia", new WikimediaProvider());
    this.providers.set("openverse", new OpenverseProvider());
    this.providers.set("pixabay", new PixabayProvider());
    this.providers.set("pexels", new PexelsProvider());
    this.providers.set("pexafy", new PexafyProvider());
    this.providers.set("internal", new InternalLibraryProvider());
    this.providers.set("ai_fallback", new AIGenProvider());
  }

  getProvider(id: string): MediaProvider | undefined {
    return this.providers.get(id);
  }

  async run(context: VisualContext): Promise<void> {
    const t0 = Date.now();
    const intent = context.intent;
    const plan = context.plan;

    if (!intent || !plan) {
      throw new Error("ProviderFramework requires parsed Intent and AssetPlan");
    }

    const query = `${intent.topic} ${intent.category}`;
    const providersToQuery = context.config.providerPriority || ["wikimedia", "openverse"];
    
    const allCandidates: CandidateAsset[] = [];

    // Query active providers in parallel
    const searchPromises = providersToQuery.map(async (provId) => {
      const prov = this.providers.get(provId);
      if (!prov) return [];
      
      const isHealthy = await prov.health().catch(() => false);
      if (!isHealthy) {
        console.warn(`[ProviderFramework] Provider ${provId} reported unhealthy. Skipping search.`);
        return [];
      }

      console.log(`[ProviderFramework] Querying provider: ${provId} for search term "${query}"`);
      return prov.search(query, 5).catch(() => []);
    });

    const searchResults = await Promise.all(searchPromises);
    for (const list of searchResults) {
      allCandidates.push(...list);
    }

    context.candidates = allCandidates;
    context.metrics.retrievalTime = Date.now() - t0;
  }
}
