import type { CandidateAsset } from "./VisualIntelligenceTypes";

const DEFAULT_COUNT = 5;
const MAX_COUNT = 20;
const REQUEST_TIMEOUT_MS = 12_000;

function countOf(count: number): number {
  if (!Number.isFinite(count)) return DEFAULT_COUNT;
  return Math.min(Math.max(Math.floor(count), 1), MAX_COUNT);
}

function preferredOrientation(): "portrait" | undefined {
  return process.env.SHORTFORGE_VISUAL_STOCK_ORIENTATION === "portrait"
    ? "portrait"
    : undefined;
}

function stripHtml(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/<[^>]*>/g, "").trim()
    : "";
}

function pexelsAsset(photo: any, query: string): CandidateAsset | null {
  if (!photo?.src?.large && !photo?.src?.medium) return null;
  const sourceUrl = typeof photo?.url === "string"
    ? photo.url
    : "https://www.pexels.com/";
  const photographer = typeof photo?.photographer === "string"
    ? photo.photographer
    : "Unknown Photographer";
  return {
    id: "pexels_" + String(photo.id ?? "unknown"),
    storageKey: "",
    sha256: "",
    dhash: "",
    license: "Pexels API Terms",
    licenseUrl: "https://www.pexels.com/api/documentation/",
    usagePolicyUrl: "https://www.pexels.com/api/documentation/",
    author: photographer,
    sourceUrl,
    originalUrl: photo?.src?.original || photo?.src?.large2x || photo?.src?.large || photo?.src?.medium || "",
    title: query,
    description: "",
    credits: `Photo by ${photographer} on Pexels: ${sourceUrl}`,
    attributionRequired: true,
    qualityScore: Math.min(
      10,
      (Number(photo.width) > 0 && Number(photo.height) > 0 ? 8 : 6) +
        (String(photo?.avg_color || "").length > 0 ? 0.2 : 0),
    ),
    width: Number(photo.width) || 1080,
    height: Number(photo.height) || 1920,
    tags: [query.toLowerCase()],
    source: "pexels",
    usageCount: 0,
  };
}

function pixabayAsset(hit: any, query: string): CandidateAsset | null {
  const imageUrl = hit?.largeImageURL || hit?.fullHDURL || hit?.imageURL;
  if (!imageUrl) return null;
  const user = typeof hit?.user === "string" ? hit.user : "Unknown Contributor";
  const page = typeof hit?.pageURL === "string"
    ? hit.pageURL
    : "https://pixabay.com/";
  return {
    id: "pixabay_" + String(hit.id ?? "unknown"),
    storageKey: "",
    sha256: "",
    dhash: "",
    license: "Pixabay Content License",
    licenseUrl: "https://pixabay.com/service/license-summary/",
    usagePolicyUrl: "https://pixabay.com/api/docs/",
    author: user,
    sourceUrl: page,
    originalUrl: imageUrl,
    title: query,
    description: typeof hit?.tags === "string" ? hit.tags : "",
    credits: `Image by ${user} on Pixabay: ${page}`,
    attributionRequired: true,
    qualityScore: Number(hit?.imageWidth) > 0 && Number(hit?.imageHeight) > 0 ? 8.2 : 7,
    width: Number(hit?.imageWidth) || Number(hit?.webformatWidth) || 1080,
    height: Number(hit?.imageHeight) || Number(hit?.webformatHeight) || 1920,
    tags: typeof hit?.tags === "string"
      ? hit.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean).slice(0, 20)
      : [query.toLowerCase()],
    source: "pixabay",
    usageCount: 0,
  };
}

function pexafyAsset(photo: any, query: string): CandidateAsset | null {
  const imageUrl = photo?.image_url || photo?.urls?.large || photo?.urls?.regular;
  if (!imageUrl) return null;
  const attribution = photo?.attribution?.plain || photo?.attribution?.html || "";
  const author = photo?.photographer_full_name || photo?.photographer_username || "Unknown Photographer";
  const source = photo?.source || "Pexafy";
  const sourceUrl = photo?.photographer_url || photo?.source_image_url || "https://pexafy.com/";
  const license = photo?.license_type || "Provider-declared license";
  return {
    id: "pexafy_" + String(photo?.photo_id ?? "unknown"),
    storageKey: "",
    sha256: "",
    dhash: "",
    license,
    licenseUrl: "https://docs.pexafy.com/api-reference/search/search-photos-by-text",
    usagePolicyUrl: "https://docs.pexafy.com/",
    author,
    sourceUrl,
    originalUrl: imageUrl,
    title: photo?.description || photo?.alt_description || query,
    description: photo?.description || photo?.alt_description || "",
    credits: attribution || `Photo by ${author}. Source: ${source}.`,
    attributionRequired: Boolean(attribution),
    qualityScore: Math.min(10, 7 + Number(photo?.relevance_score || 0)),
    width: Number(photo?.width) || 1080,
    height: Number(photo?.height) || 1920,
    tags: [query.toLowerCase()],
    source: "pexafy",
    usageCount: 0,
  };
}

export class PexelsProvider {
  readonly id = "pexels";
  private readonly apiKey = process.env.PEXELS_API_KEY?.trim() || "";

  async search(query: string, count = DEFAULT_COUNT): Promise<CandidateAsset[]> {
    if (!this.apiKey) return [];
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(countOf(count)));
    const orientation = preferredOrientation();
    if (orientation) url.searchParams.set("orientation", orientation);

    try {
      const response = await fetch(url, {
        headers: { Authorization: this.apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return [];
      const data: any = await response.json();
      return Array.isArray(data?.photos)
        ? data.photos.map((photo: any) => pexelsAsset(photo, query)).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  async health(): Promise<boolean> {
    return Boolean(this.apiKey);
  }
}

export class PixabayProvider {
  readonly id = "pixabay";
  private readonly apiKey = process.env.PIXABAY_API_KEY?.trim() || "";

  async search(query: string, count = DEFAULT_COUNT): Promise<CandidateAsset[]> {
    if (!this.apiKey) return [];
    const url = new URL("https://pixabay.com/api/");
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("q", query.slice(0, 100));
    url.searchParams.set("image_type", "photo");
    url.searchParams.set("safesearch", "true");
    url.searchParams.set(
      "orientation",
      preferredOrientation() ? "vertical" : "all",
    );
    url.searchParams.set("per_page", String(Math.min(Math.max(countOf(count), 3), 20)));

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return [];
      const data: any = await response.json();
      return Array.isArray(data?.hits)
        ? data.hits.map((hit: any) => pixabayAsset(hit, query)).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  async health(): Promise<boolean> {
    return Boolean(this.apiKey);
  }
}

export class PexafyProvider {
  readonly id = "pexafy";
  private readonly apiKey = process.env.PEXAFY_API_KEY?.trim() || "";

  async search(query: string, count = DEFAULT_COUNT): Promise<CandidateAsset[]> {
    if (!this.apiKey) return [];
    const url = new URL("https://api.pexafy.com/api/v1/search/photos");
    url.searchParams.set("q", query);
    url.searchParams.set("per_page", String(countOf(count)));
    url.searchParams.set("limit", String(countOf(count)));
    url.searchParams.set(
      "fields",
      "photo_id,image_url,urls,width,height,photographer_username,photographer_full_name,photographer_url,source,license_type,source_image_url,description,alt_description,relevance_score,attribution",
    );
    const orientation = preferredOrientation();
    if (orientation) url.searchParams.set("orientation", orientation);

    try {
      const response = await fetch(url, {
        headers: { "x-api-key": this.apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return [];
      const data: any = await response.json();
      return Array.isArray(data?.data)
        ? data.data.map((photo: any) => pexafyAsset(photo, query)).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  async health(): Promise<boolean> {
    return Boolean(this.apiKey);
  }
}
