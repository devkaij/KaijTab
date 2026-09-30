/** 天气纯逻辑：URL 构造、响应解析、WMO 天气码映射、缓存时效。 */

export interface GeoPlace {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export interface DailyForecast {
  /** YYYY-MM-DD */
  date: string;
  code: number;
  high: number | null;
  low: number | null;
}

export interface WeatherNow {
  temperature: number;
  apparent: number;
  humidity: number | null;
  windSpeed: number | null;
  code: number;
  high: number | null;
  low: number | null;
  daily: DailyForecast[];
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
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "7",
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
  const times = Array.isArray(daily?.time) ? (daily?.time as unknown[]) : [];
  const highs = Array.isArray(daily?.temperature_2m_max) ? (daily?.temperature_2m_max as unknown[]) : [];
  const lows = Array.isArray(daily?.temperature_2m_min) ? (daily?.temperature_2m_min as unknown[]) : [];
  const codes = Array.isArray(daily?.weather_code) ? (daily?.weather_code as unknown[]) : [];

  const days: DailyForecast[] = [];
  const count = Math.max(times.length, highs.length, lows.length);
  for (let i = 0; i < count; i++) {
    const date = typeof times[i] === "string" ? (times[i] as string) : "";
    const high = num(highs[i]);
    const low = num(lows[i]);
    const dayCode = num(codes[i]) ?? code;
    if (!date && high == null && low == null) continue;
    days.push({ date, code: dayCode, high, low });
  }

  return {
    temperature,
    apparent: num(current.apparent_temperature) ?? temperature,
    humidity: num(current.relative_humidity_2m),
    windSpeed: num(current.wind_speed_10m),
    code,
    high: days[0]?.high ?? null,
    low: days[0]?.low ?? null,
    daily: days.slice(0, 7),
    fetchedAt: now,
  };
}

const WEEKDAY_SHORT = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function parseIsoDate(date: string): Date | null {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parsed) return null;
  return new Date(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3]));
}

/**
 * 第 index 天的标签：今天 / 明天 / 周X。
 * baseDate 用列表第一天的日期——预报是按抓取时刻生成的，
 * 若用"当前时间"当基准，跨过午夜后会出现连着两个"明天"。
 */
export function formatDayLabel(date: string, index: number, baseDate?: Date): string {
  if (index === 0) return "今天";
  if (index === 1) return "明天";
  const target = parseIsoDate(date);
  if (!target) return `第 ${index + 1} 天`;
  const base = baseDate
    ? new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())
    : (() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      })();
  const diffDays = Math.round((target.getTime() - base.getTime()) / 86_400_000);
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "明天";
  return WEEKDAY_SHORT[target.getDay()] ?? "";
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
