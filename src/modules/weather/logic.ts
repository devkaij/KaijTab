/** 天气纯逻辑：URL 构造、响应解析、WMO 天气码映射、缓存时效。 */

export interface GeoPlace {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export interface WeatherNow {
  temperature: number;
  apparent: number;
  humidity: number | null;
  windSpeed: number | null;
  code: number;
  high: number | null;
  low: number | null;
  fetchedAt: number;
}

export const WEATHER_TTL_MS = 10 * 60 * 1000;

export function buildGeocodeUrl(city: string): string {
  const params = new URLSearchParams({
    name: city,
    count: "1",
    language: "zh",
    format: "json",
  });
  return `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;
}

export function buildForecastUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "1",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseGeocode(json: unknown): GeoPlace | null {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const first = results[0] as Record<string, unknown>;
  const latitude = num(first.latitude);
  const longitude = num(first.longitude);
  const name = typeof first.name === "string" ? first.name : null;
  if (latitude == null || longitude == null || !name) return null;
  return {
    name,
    country: typeof first.country === "string" ? first.country : undefined,
    latitude,
    longitude,
  };
}

export function parseForecast(json: unknown, now = Date.now()): WeatherNow | null {
  const root = json as { current?: Record<string, unknown>; daily?: Record<string, unknown> } | null;
  const current = root?.current;
  if (!current) return null;

  const temperature = num(current.temperature_2m);
  const code = num(current.weather_code);
  if (temperature == null || code == null) return null;

  const daily = root?.daily;
  const highs = daily?.temperature_2m_max;
  const lows = daily?.temperature_2m_min;

  return {
    temperature,
    apparent: num(current.apparent_temperature) ?? temperature,
    humidity: num(current.relative_humidity_2m),
    windSpeed: num(current.wind_speed_10m),
    code,
    high: Array.isArray(highs) ? num(highs[0]) : null,
    low: Array.isArray(lows) ? num(lows[0]) : null,
    fetchedAt: now,
  };
}

/** WMO weather code → 文案与图标 */
export function weatherDescriptor(code: number): { label: string; icon: string } {
  if (code === 0) return { label: "晴", icon: "☀️" };
  if (code === 1) return { label: "大部晴朗", icon: "🌤️" };
  if (code === 2) return { label: "多云", icon: "⛅" };
  if (code === 3) return { label: "阴", icon: "☁️" };
  if (code === 45 || code === 48) return { label: "雾", icon: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "毛毛雨", icon: "🌦️" };
  if (code >= 61 && code <= 67) return { label: "雨", icon: "🌧️" };
  if (code >= 71 && code <= 77) return { label: "雪", icon: "🌨️" };
  if (code >= 80 && code <= 82) return { label: "阵雨", icon: "🌦️" };
  if (code === 85 || code === 86) return { label: "阵雪", icon: "🌨️" };
  if (code >= 95 && code <= 99) return { label: "雷雨", icon: "⛈️" };
  return { label: "未知", icon: "🌡️" };
}

export function isFresh(fetchedAt: number, now: number, ttl = WEATHER_TTL_MS): boolean {
  return now - fetchedAt >= 0 && now - fetchedAt < ttl;
}

/** "刚刚 / n 分钟前 / n 小时前" */
export function formatUpdated(fetchedAt: number, now: number): string {
  const minutes = Math.floor((now - fetchedAt) / 60_000);
  if (minutes <= 0) return "刚刚更新";
  if (minutes < 60) return `${minutes} 分钟前更新`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前更新`;
  return `${Math.floor(hours / 24)} 天前更新`;
}
