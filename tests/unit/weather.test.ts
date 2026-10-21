import { describe, expect, it } from "vitest";
import {
  buildChinaSearchUrl,
  buildForecastUrl,
  buildGeocodeUrl,
  formatDayLabel,
  formatUpdated,
  chinaWeatherUrls,
  cnTypeToCode,
  isFresh,
  normalizeCityQuery,
  parseChinaWeather,
  parseCitySearch,
  parseCnTemp,
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

describe("formatDayLabel（跨午夜也稳定）", () => {
  it("以列表首日为基准：今天 / 明天 / 周X", () => {
    const base = new Date(2026, 9, 1); // 2026-10-01 周四
    expect(formatDayLabel("2026-10-01", 0, base)).toBe("今天");
    expect(formatDayLabel("2026-10-02", 1, base)).toBe("明天");
    expect(formatDayLabel("2026-10-03", 2, base)).toBe("周六");
    expect(formatDayLabel("2026-10-06", 5, base)).toBe("周二");
  });

  it("跨过午夜后不会出现两个「明天」", () => {
    // 数据是 09-30 抓的，但此刻已是 10-01
    const base = new Date(2026, 8, 30);
    const labels = ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"].map((date, index) =>
      formatDayLabel(date, index, base),
    );
    expect(labels).toEqual(["今天", "明天", "周五", "周六"]);
  });

  it("坏日期与缺省基准都不崩", () => {
    expect(formatDayLabel("bad", 3, new Date(2026, 9, 1))).toBe("第 4 天");
    expect(formatDayLabel("2026-10-05", 4)).toBeTruthy();
  });
});

describe("weatherDescriptor", () => {  it("覆盖主要天气码", () => {
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

// ———————— 境内备用源（中国天气网镜像） ————————

describe("境内备用源：城市查询与 ID 解析", () => {
  const searchJson = [
    { ref: "101020100~shanghai~上海~Shanghai~上海~Shanghai~21~200000~SH~上海" },
    { ref: "101020200~shanghai~闵行~Minhang~闵行~Minhang~21~201100~MH~上海" },
    { ref: "bad-ref~x~坏数据" },
    { other: "无 ref 字段" },
  ];

  it("normalizeCityQuery 去掉行政区后缀", () => {
    expect(normalizeCityQuery("上海市")).toBe("上海");
    expect(normalizeCityQuery("呼和浩特市")).toBe("呼和浩特");
    expect(normalizeCityQuery("杭州")).toBe("杭州");
    expect(normalizeCityQuery("  北京  ")).toBe("北京");
  });

  it("精确匹配中文名优先", () => {
    expect(parseCitySearch(searchJson, "上海")).toBe("101020100");
  });

  it("无精确匹配时取名字最短的条目，坏条目跳过", () => {
    expect(parseCitySearch(searchJson, "沪")).toBe("101020100");
    expect(parseCitySearch([], "上海")).toBeNull();
    expect(parseCitySearch({ nope: 1 }, "上海")).toBeNull();
  });

  it("搜索 URL 带编码后的城市名", () => {
    expect(buildChinaSearchUrl("上海")).toBe(
      "http://toy1.weather.com.cn/search?cityname=%E4%B8%8A%E6%B5%B7",
    );
  });

  it("天气数据 URL 覆盖两个镜像", () => {
    expect(chinaWeatherUrls("101020100")).toEqual([
      "http://t.weather.itboy.net/api/weather/city/101020100",
      "http://t.weather.sojson.com/api/weather/city/101020100",
    ]);
  });
});

describe("境内备用源：类型→WMO 码与响应解析", () => {
  it("cnTypeToCode：精确表 + 关键字兜底", () => {
    expect(cnTypeToCode("晴")).toBe(0);
    expect(cnTypeToCode("多云")).toBe(2);
    expect(cnTypeToCode("阴")).toBe(3);
    expect(cnTypeToCode("小雨")).toBe(61);
    expect(cnTypeToCode("雷阵雨")).toBe(95);
    expect(cnTypeToCode("阵雪")).toBe(85);
    expect(cnTypeToCode("霾")).toBe(45);
    // 复合/未知类型走关键字
    expect(cnTypeToCode("小雨-中雨")).toBe(61);
    expect(cnTypeToCode("雨夹雪")).toBe(71);
    expect(cnTypeToCode("外星尘暴")).toBe(45);
    expect(cnTypeToCode("")).toBe(3);
  });

  it("parseCnTemp 解析「高温 21℃」类字段", () => {
    expect(parseCnTemp("高温 21℃")).toBe(21);
    expect(parseCnTemp("低温 -3℃")).toBe(-3);
    expect(parseCnTemp("15℃")).toBe(15);
    expect(parseCnTemp("没数字")).toBeNull();
    expect(parseCnTemp(42)).toBe(42);
  });

  it("parseChinaWeather：真实响应形状 → WeatherNow", () => {
    const sample = {
      message: "success!",
      status: 200,
      date: "20261022",
      time: "2026-10-22 00:00:00",
      cityInfo: { city: "上海市", parent: "上海", updateTime: "00:00" },
      data: {
        shidu: "62%",
        pm25: 35,
        pm10: 60,
        quality: "良",
        wendu: 15,
        ganmao: "较易感冒",
        forecast: [
          { date: "22", ymd: "2026-10-22", week: "星期四", high: "高温 21℃", low: "低温 15℃", type: "晴" },
          { date: "23", ymd: "2026-10-23", week: "星期五", high: "高温 23℃", low: "低温 14℃", type: "小雨" },
        ],
        yesterday: { ymd: "2026-10-21", high: "高温 20℃", low: "低温 14℃", type: "多云" },
      },
    };
    const weather = parseChinaWeather(sample, 1_000);
    expect(weather).not.toBeNull();
    expect(weather!.temperature).toBe(15);
    expect(weather!.apparent).toBe(15);
    expect(weather!.humidity).toBe(62);
    expect(weather!.windSpeed).toBeNull();
    expect(weather!.code).toBe(0);
    expect(weather!.high).toBe(21);
    expect(weather!.low).toBe(15);
    expect(weather!.daily).toHaveLength(2);
    expect(weather!.daily[0]).toEqual({ date: "2026-10-22", code: 0, high: 21, low: 15 });
    expect(weather!.daily[1]!.code).toBe(61);
    expect(weather!.fetchedAt).toBe(1_000);
  });

  it("parseChinaWeather：status 非 200 / 缺 wendu / 空对象都返回 null", () => {
    expect(parseChinaWeather({ status: 403, data: { wendu: 1 } })).toBeNull();
    expect(parseChinaWeather({ status: 200, data: {} })).toBeNull();
    expect(parseChinaWeather(null)).toBeNull();
    expect(parseChinaWeather("not json")).toBeNull();
  });
});
