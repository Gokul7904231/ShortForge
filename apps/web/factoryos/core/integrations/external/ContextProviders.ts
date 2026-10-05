import {
  ContextProviderError,
  type GeocodeResult,
  type GeoCoordinate,
  type WeatherForecastRequest,
  type WeatherForecastResult,
} from "./ContextProviderContracts";

function assertCoordinate(input: GeoCoordinate): void {
  if (
    !Number.isFinite(input.latitude) ||
    input.latitude < -90 ||
    input.latitude > 90 ||
    !Number.isFinite(input.longitude) ||
    input.longitude < -180 ||
    input.longitude > 180
  ) {
    throw new ContextProviderError(
      "context",
      "Latitude/longitude are outside the valid WGS84 range.",
    );
  }
}

async function responseJson(
  response: Response,
  providerId: string,
): Promise<any> {
  const text = await response.text();
  if (!response.ok) {
    throw new ContextProviderError(
      providerId,
      providerId + " returned HTTP " + response.status + ".",
      {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      },
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ContextProviderError(
      providerId,
      providerId + " returned malformed JSON.",
    );
  }
}

export class OpenMeteoProvider {
  readonly id = "OPEN_METEO" as const;

  async forecast(
    request: WeatherForecastRequest,
  ): Promise<WeatherForecastResult> {
    assertCoordinate(request);
    const baseUrl =
      process.env.OPEN_METEO_BASE_URL?.trim() ||
      "https://api.open-meteo.com/v1";
    const url = new URL(
      baseUrl.replace(/\/+$/, "") + "/forecast",
    );

    url.searchParams.set("latitude", String(request.latitude));
    url.searchParams.set("longitude", String(request.longitude));

    if (request.current?.length) {
      url.searchParams.set("current", request.current.join(","));
    }
    if (request.hourly?.length) {
      url.searchParams.set("hourly", request.hourly.join(","));
    }
    if (request.forecastDays !== undefined) {
      const days = Math.min(
        Math.max(Math.floor(request.forecastDays), 1),
        16,
      );
      url.searchParams.set("forecast_days", String(days));
    }
    if (request.timezone) {
      url.searchParams.set("timezone", request.timezone);
    }

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await responseJson(response, this.id);

    if (
      typeof payload?.latitude !== "number" ||
      typeof payload?.longitude !== "number"
    ) {
      throw new ContextProviderError(
        this.id,
        "Open-Meteo response did not contain valid coordinates.",
      );
    }

    return {
      providerId: this.id,
      latitude: payload.latitude,
      longitude: payload.longitude,
      timezone:
        typeof payload?.timezone === "string"
          ? payload.timezone
          : undefined,
      elevation:
        typeof payload?.elevation === "number"
          ? payload.elevation
          : undefined,
      current:
        payload?.current &&
        typeof payload.current === "object"
          ? payload.current
          : undefined,
      hourly:
        payload?.hourly &&
        typeof payload.hourly === "object"
          ? payload.hourly
          : undefined,
      retrievedAt: new Date().toISOString(),
    };
  }
}

export class NominatimProvider {
  readonly id = "NOMINATIM" as const;
  private readonly cache = new Map<string, GeocodeResult[]>();
  private nextAllowedRequestAt = 0;
  private queue: Promise<void> = Promise.resolve();

  private baseUrl(): string {
    return (
      process.env.NOMINATIM_BASE_URL?.trim() ||
      "https://nominatim.openstreetmap.org"
    ).replace(/\/+$/, "");
  }

  private userAgent(): string {
    const value =
      process.env.NOMINATIM_USER_AGENT?.trim() ||
      "ShortForge/1.0 (contact-required@example.invalid)";
    if (value.length < 8) {
      throw new ContextProviderError(
        this.id,
        "NOMINATIM_USER_AGENT must identify the application.",
      );
    }
    return value;
  }

  private async rateLimit(): Promise<void> {
    let release!: () => void;
    const current = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await current;

    const waitMs = Math.max(
      0,
      this.nextAllowedRequestAt - Date.now(),
    );
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.nextAllowedRequestAt = Date.now() + 1000;
    release();
  }

  private async get(url: URL): Promise<any> {
    const key = url.toString();
    const cached = this.cache.get(key);
    if (cached) return cached;

    await this.rateLimit();
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": this.userAgent(),
        ...(process.env.NOMINATIM_REFERER?.trim()
          ? { Referer: process.env.NOMINATIM_REFERER.trim() }
          : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await responseJson(response, this.id);
    return payload;
  }

  private normalize(item: any): GeocodeResult | null {
    const lat = Number(item?.lat);
    const lon = Number(item?.lon);
    const displayName =
      typeof item?.display_name === "string"
        ? item.display_name
        : "";
    if (!displayName || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    const address: Record<string, string> = {};
    if (item?.address && typeof item.address === "object") {
      for (const [key, value] of Object.entries(item.address)) {
        if (typeof value === "string" && value.length <= 300) {
          address[key] = value;
        }
      }
    }

    return {
      providerId: this.id,
      placeId:
        item?.place_id !== undefined
          ? String(item.place_id)
          : undefined,
      displayName,
      latitude: lat,
      longitude: lon,
      category:
        typeof item?.category === "string"
          ? item.category
          : undefined,
      type:
        typeof item?.type === "string"
          ? item.type
          : undefined,
      address,
      sourceUrl:
        typeof item?.licence === "string"
          ? "https://www.openstreetmap.org/"
          : "https://nominatim.openstreetmap.org/",
      retrievedAt: new Date().toISOString(),
    };
  }

  async search(
    query: string,
    options: { limit?: number } = {},
  ): Promise<readonly GeocodeResult[]> {
    const q = query.trim();
    if (!q) {
      throw new ContextProviderError(
        this.id,
        "Nominatim search query cannot be empty.",
      );
    }
    const url = new URL(this.baseUrl() + "/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set(
      "limit",
      String(
        Math.min(Math.max(Math.floor(options.limit ?? 5), 1), 10),
      ),
    );
    const key = url.toString();
    const cached = this.cache.get(key);
    if (cached) return cached;

    const payload = await this.get(url);
    if (!Array.isArray(payload)) {
      throw new ContextProviderError(
        this.id,
        "Nominatim search returned a malformed result.",
      );
    }
    const normalized = payload
      .map((item) => this.normalize(item))
      .filter((item): item is GeocodeResult => Boolean(item));
    this.cache.set(key, normalized);
    return normalized;
  }

  async reverse(
    coordinates: GeoCoordinate,
  ): Promise<GeocodeResult | null> {
    assertCoordinate(coordinates);
    const url = new URL(this.baseUrl() + "/reverse");
    url.searchParams.set("lat", String(coordinates.latitude));
    url.searchParams.set("lon", String(coordinates.longitude));
    url.searchParams.set("format", "jsonv2");
    const key = url.toString();
    const cached = this.cache.get(key);
    if (cached) return cached[0] ?? null;

    const payload = await this.get(url);
    const normalized = this.normalize(payload);
    const result = normalized ? [normalized] : [];
    this.cache.set(key, result);
    return normalized;
  }
}
