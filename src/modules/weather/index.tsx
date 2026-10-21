import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { ModuleProps } from "@/newtab/module-host/types";
import {
  buildChinaSearchUrl,
  buildForecastUrl,
  buildGeocodeUrl,
  chinaWeatherUrls,
  formatDayLabel,
  formatUpdated,
  isFresh,
  normalizeCityQuery,
  parseChinaWeather,
  parseCitySearch,
  parseForecast,
  parseGeocode,
  weatherDescriptor,
  WEATHER_TTL_MS,
  type GeoPlace,
  type WeatherNow,
} from "./logic";
import "./weather.css";

interface WeatherCache {
  city: string;
  place: GeoPlace | null;
  weather: WeatherNow | null;
  /** 数据来源：open-meteo（默认，不标） | cn（中国天气网备用源，页脚显示） */
  source?: "open-meteo" | "cn";
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 境内备用源：城市名 → 中国天气网 ID → 实况+预报（两个镜像轮流试） */
async function fetchChinaWeather(city: string): Promise<WeatherNow> {
  const query = normalizeCityQuery(city);
  const id = parseCitySearch(await fetchJson(buildChinaSearchUrl(query)), query);
  if (!id) throw new Error(`境内源找不到城市「${city}」`);
  let lastError: unknown = null;
  for (const url of chinaWeatherUrls(id)) {
    try {
      const weather = parseChinaWeather(await fetchJson(url));
      if (weather) return weather;
      lastError = new Error("境内源天气数据格式异常");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("境内源获取失败");
}

export default function Weather({ props, runtime }: ModuleProps) {
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const city = typeof props.city === "string" && props.city.trim() ? props.city.trim() : "北京";
  const showDetails = props.showDetails !== false;

  const [cache, setCache] = useState<WeatherCache>(() => {
    const stored = runtime.data.get<WeatherCache>("cache");
    return stored && typeof stored === "object" && stored.city === city
      ? stored
      : { city, place: null, weather: null };
  });
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadingRef = useRef(false);

  const load = useCallback(
    async (force: boolean) => {
      const current = runtimeRef.current.data.get<WeatherCache>("cache");
      const base: WeatherCache =
        current && typeof current === "object" && current.city === city
          ? current
          : { city, place: null, weather: null };

      if (!force && base.weather && isFresh(base.weather.fetchedAt, Date.now())) {
        setCache(base);
        setStatus("idle");
        return;
      }
      if (loadingRef.current) return;
      loadingRef.current = true;
      setStatus("loading");

      try {
        let next: WeatherCache;
        try {
          // 主源：Open-Meteo（实况+7 天预报，境外）
          let place = base.place;
          if (!place) {
            const geoJson = await fetchJson(buildGeocodeUrl(city));
            place = parseGeocode(geoJson);
            if (!place) throw new Error(`找不到城市「${city}」`);
          }
          const forecastJson = await fetchJson(buildForecastUrl(place.latitude, place.longitude));
          const weather = parseForecast(forecastJson);
          if (!weather) throw new Error("天气数据格式异常");
          next = { city, place, weather, source: "open-meteo" };
        } catch (primaryError) {
          // 备用源：中国天气网镜像（境内，无 key；系统代理挂掉时的兜底）。
          // 备用源也失败时，重新抛出主源的错误——它对故障原因更有解释力。
          try {
            next = { city, place: base.place, weather: await fetchChinaWeather(city), source: "cn" };
          } catch {
            throw primaryError;
          }
        }

        runtimeRef.current.data.set("cache", next);
        setCache(next);
        setError(null);
        setStatus("idle");
      } catch (err) {
        setError(String((err as Error).message ?? err));
        setStatus("error");
      } finally {
        loadingRef.current = false;
      }
    },
    [city],
  );

  // 首次加载 + 城市变化
  useEffect(() => {
    setCache((prev) => (prev.city === city ? prev : { city, place: null, weather: null }));
    void load(false);
  }, [city, load]);

  // 每 10 分钟自动刷新；页面重新可见且数据过期时也刷新
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    const refresh = setInterval(() => void load(false), WEATHER_TTL_MS);
    const off = runtimeRef.current.visibility.onChange((visible) => {
      if (visible) void load(false);
    });
    return () => {
      clearInterval(timer);
      clearInterval(refresh);
      off();
    };
  }, [load]);

  const weather = cache.weather;
  const forecastBase = weather?.daily[0]?.date
    ? new Date(`${weather.daily[0].date}T00:00:00`)
    : undefined;
  const descriptor = weather ? weatherDescriptor(weather.code) : null;

  return (
    <div class="kt-weather" data-testid="weather">
      {!weather ? (
        <div class="kt-weather-placeholder">
          {status === "loading" ? "正在获取天气…" : "暂无天气数据"}
        </div>
      ) : (
        <>
          <div class="kt-weather-main">
            <span class="kt-weather-icon" aria-hidden="true">
              {descriptor?.icon}
            </span>
            <span class="kt-weather-temp" data-testid="weather-temp">
              {Math.round(weather.temperature)}°
            </span>
          </div>
          <div class="kt-weather-line">
            <span class="kt-weather-city">{cache.place?.name ?? city}</span>
            <span class="kt-weather-label">{descriptor?.label}</span>
            {weather.high != null && weather.low != null ? (
              <span class="kt-weather-range">
                {Math.round(weather.high)}° / {Math.round(weather.low)}°
              </span>
            ) : null}
          </div>
          {showDetails ? (
            <div class="kt-weather-details">
              <span>体感 {Math.round(weather.apparent)}°</span>
              {weather.humidity != null ? <span>湿度 {Math.round(weather.humidity)}%</span> : null}
              {weather.windSpeed != null ? (
                <span>风 {Math.round(weather.windSpeed)} km/h</span>
              ) : null}
            </div>
          ) : null}
          <div class="kt-weather-foot">
            {formatUpdated(weather.fetchedAt, now)}
            {cache.source === "cn" ? <span class="kt-weather-src"> · 中国天气网</span> : null}
          </div>
          {weather.daily.length > 1 ? (
            <div class="kt-weather-week" data-testid="weather-week">
              {weather.daily.map((day, index) => (
                <div class="kt-weather-day" key={day.date || index}>
                  <span class="kt-weather-day-label">{formatDayLabel(day.date, index, forecastBase)}</span>
                  <span class="kt-weather-day-icon" aria-hidden="true">
                    {weatherDescriptor(day.code).icon}
                  </span>
                  <span class="kt-weather-day-temp">
                    {day.high != null ? `${Math.round(day.high)}°` : "--"}
                    <em>{day.low != null ? `${Math.round(day.low)}°` : "--"}</em>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
      {status === "error" ? (
        <div class="kt-weather-error" data-testid="weather-error">
          <span>{error ?? "获取失败"}</span>
          <button class="kt-weather-retry" onClick={() => void load(true)}>
            重试
          </button>
        </div>
      ) : null}
    </div>
  );
}
