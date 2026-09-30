import { describe, expect, it } from "vitest";
import {
  buildStationUrl,
  formatBitrate,
  formatTags,
  isHttpsStream,
  parseStations,
  RADIO_HOST,
} from "@/modules/radio/logic";

describe("buildStationUrl", () => {
  it("指向 radio-browser 且带必要参数", () => {
    const url = buildStationUrl("lofi", 10);
    expect(url.startsWith(`${RADIO_HOST}/json/stations/bytagexact/lofi?`)).toBe(true);
    expect(url).toContain("hidebroken=true");
    expect(url).toContain("order=clickcount");
    expect(url).toContain("limit=10");
  });

  it("条数被限制在 3~30", () => {
    expect(buildStationUrl("jazz", 1)).toContain("limit=3");
    expect(buildStationUrl("jazz", 999)).toContain("limit=30");
  });
});

describe("parseStations", () => {
  const raw = [
    {
      stationuuid: "a",
      name: "Smooth Jazz",
      url_resolved: "https://stream.example.com/jazz",
      country: "United States",
      tags: "jazz,smooth,relax",
      bitrate: 128,
      homepage: "https://example.com",
    },
    {
      stationuuid: "b",
      name: "只提供 http 的台",
      url_resolved: "http://insecure.example.com/live",
      tags: "jazz",
    },
    { stationuuid: "c", name: "", url_resolved: "https://x.example.com" },
    { stationuuid: "d", name: "无地址" },
    "不是对象",
  ];

  it("只保留 https 且字段完整", () => {
    const stations = parseStations(raw);
    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({
      id: "a",
      name: "Smooth Jazz",
      url: "https://stream.example.com/jazz",
      country: "United States",
      bitrate: 128,
    });
    expect(stations[0]?.tags).toEqual(["jazz", "smooth", "relax"]);
  });

  it("url_resolved 缺失时退回 url", () => {
    const stations = parseStations([{ stationuuid: "e", name: "备用地址", url: "https://a.example.com" }]);
    expect(stations[0]?.url).toBe("https://a.example.com");
  });

  it("非数组输入返回空", () => {
    expect(parseStations(null)).toEqual([]);
    expect(parseStations({})).toEqual([]);
  });

  it("限量生效", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      stationuuid: `s${i}`,
      name: `台 ${i}`,
      url_resolved: `https://s${i}.example.com/live`,
    }));
    expect(parseStations(many, 4)).toHaveLength(4);
  });
});

describe("展示辅助", () => {
  it("bitrate 与标签文案", () => {
    expect(formatBitrate(128)).toBe("128 kbps");
    expect(formatBitrate(undefined)).toBe("");
    expect(
      formatTags({ id: "x", name: "n", url: "u", tags: ["jazz"], country: "France" }),
    ).toBe("France · jazz");
  });

  it("https 判定", () => {
    expect(isHttpsStream("https://a.example.com")).toBe(true);
    expect(isHttpsStream("http://a.example.com")).toBe(false);
  });
});
