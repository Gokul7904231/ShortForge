export interface GeoCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

export interface GeocodeResult {
  readonly providerId: "NOMINATIM";
  readonly placeId?: string;
  readonly displayName: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly category?: string;
  readonly type?: string;
  readonly address?: Readonly<Record<string, string>>;
  readonly sourceUrl: string;
  readonly retrievedAt: string;
}

export interface WeatherForecastRequest extends GeoCoordinate {
  readonly current?: readonly string[];
  readonly hourly?: readonly string[];
  readonly forecastDays?: number;
  readonly timezone?: string;
}

export interface WeatherForecastResult {
  readonly providerId: "OPEN_METEO";
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone?: string;
  readonly elevation?: number;
  readonly current?: Readonly<Record<string, unknown>>;
  readonly hourly?: Readonly<Record<string, unknown>>;
  readonly retrievedAt: string;
}

export class ContextProviderError extends Error {
  readonly providerId: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    providerId: string,
    message: string,
    options: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "ContextProviderError";
    this.providerId = providerId;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}
