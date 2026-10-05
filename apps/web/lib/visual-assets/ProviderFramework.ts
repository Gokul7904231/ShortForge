import { CandidateAsset, VisualContext } from "./VisualIntelligenceTypes";
import {
  PexafyProvider,
  PexelsProvider,
  PixabayProvider,
} from "./StockVisualProviders";

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
