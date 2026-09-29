import { describe, expect, it } from "vitest";
import {
  buildForecastUrl,
  buildGeocodeUrl,
  formatUpdated,
  isFresh,
  parseForecast,
  parseGeocode,
  weatherDescriptor,
  WEATHER_TTL_MS,
} from "@/modules/weather/logic";

describe("URL 构造", () => {
  it("地理编码 URL 带城市参数", () => {
    const url = buildGeocodeUrl("杭州");
    expect(url.startsWith("https://geocoding-api.open-meteo.com/v1/search?")).toBe(true);
    expect(url).toContain("name=%E6%9D%AD%E5%B7%9E");
    expect(url).toContain("format=json");
  });

  it("预报 URL 带经纬度与字段", () => {
    const url = buildForecastUrl(30.29, 120.16);
    expect(url.startsWith("https://api.open-meteo.com/v1/forecast?")).toBe(true);
    expect(url).toContain("latitude=30.29");
    expect(url).toContain("longitude=120.16");
    expect(url).toContain("current=");
    expect(url).toContain("timezone=auto");
  });
});

describe("parseGeocode", () => {
  it("解析首个结果", () => {
    const place = parseGeocode({
      results: [{ name: "杭州", country: "中国", latitude: 30.29, longitude: 120.16 }],
    });
    expect(place).toEqual({ name: "杭州", country: "中国", latitude: 30.29, longitude: 120.16 });
  });

  it("空结果/坏数据返回 null", () => {
    expect(parseGeocode({ results: [] })).toBeNull();
    expect(parseGeocode({})).toBeNull();
    expect(parseGeocode(null)).toBeNull();
    expect(parseGeocode({ results: [{ name: "x" }] })).toBeNull();
  });
});

describe("parseForecast", () => {
  const payload = {
    current: {
      temperature_2m: 23.4,
      apparent_temperature: 25.1,
      weather_code: 3,
      relative_humidity_2m: 62,
      wind_speed_10m: 8.5,
    },
    daily: { temperature_2m_max: [27.2], temperature_2m_min: [18.9] },
  };

  it("完整响应", () => {
    const now = 1_700_000_000_000;
    const weather = parseForecast(payload, now)!;
    expect(weather.temperature).toBe(23.4);
    expect(weather.apparent).toBe(25.1);
    expect(weather.code).toBe(3);
    expect(weather.humidity).toBe(62);
    expect(weather.high).toBe(27.2);
    expect(weather.low).toBe(18.9);
    expect(weather.fetchedAt).toBe(now);
  });

  it("缺字段时容错", () => {
    const weather = parseForecast({ current: { temperature_2m: 20, weather_code: 0 } })!;
    expect(weather.apparent).toBe(20);
    expect(weather.humidity).toBeNull();
    expect(weather.high).toBeNull();
  });

  it("无 current 或非数字时返回 null", () => {
    expect(parseForecast({})).toBeNull();
    expect(parseForecast(null)).toBeNull();
    expect(parseForecast({ current: { temperature_2m: "20" } })).toBeNull();
  });
});

describe("weatherDescriptor", () => {
  it("覆盖主要天气码", () => {
    expect(weatherDescriptor(0).label).toBe("晴");
    expect(weatherDescriptor(2).label).toBe("多云");
    expect(weatherDescriptor(45).label).toBe("雾");
    expect(weatherDescriptor(63).label).toBe("雨");
    expect(weatherDescriptor(75).label).toBe("雪");
    expect(weatherDescriptor(81).label).toBe("阵雨");
    expect(weatherDescriptor(96).label).toBe("雷雨");
    expect(weatherDescriptor(12345).label).toBe("未知");
  });
});

describe("缓存与时间文案", () => {
  it("isFresh 判定", () => {
    const now = 1_000_000;
    expect(isFresh(now - 1000, now)).toBe(true);
    expect(isFresh(now - WEATHER_TTL_MS - 1, now)).toBe(false);
    expect(isFresh(now + 5000, now)).toBe(false);
  });

  it("formatUpdated 文案", () => {
    const now = 10_000_000_000;
    expect(formatUpdated(now, now)).toBe("刚刚更新");
    expect(formatUpdated(now - 5 * 60_000, now)).toBe("5 分钟前更新");
    expect(formatUpdated(now - 3 * 3_600_000, now)).toBe("3 小时前更新");
    expect(formatUpdated(now - 2 * 86_400_000, now)).toBe("2 天前更新");
  });
});
