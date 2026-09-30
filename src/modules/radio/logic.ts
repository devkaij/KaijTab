/** 在线电台纯逻辑：请求构造、站点解析（只保留 https 源，避免混合内容被拦）。 */

export interface RadioStation {
  id: string;
  name: string;
  url: string;
  country?: string;
  tags: string[];
  bitrate?: number;
  homepage?: string;
}

export const RADIO_HOST = "https://de1.api.radio-browser.info";
export const MAX_STATIONS = 30;
export const RADIO_CACHE_TTL_MS = 30 * 60 * 1000;

export const RADIO_TAGS: Array<{ value: string; label: string }> = [
  { value: "jazz", label: "爵士" },
  { value: "classical", label: "古典" },
  { value: "piano", label: "钢琴" },
  { value: "electronic", label: "电子" },
  { value: "lofi", label: "Lo-Fi" },
  { value: "rock", label: "摇滚" },
  { value: "news", label: "新闻" },
  { value: "chinese", label: "中文" },
];

export function buildStationUrl(tag: string, limit = 20): string {
  const params = new URLSearchParams({
    limit: String(Math.min(MAX_STATIONS, Math.max(3, limit))),
    hidebroken: "true",
    order: "clickcount",
    reverse: "true",
  });
  return `${RADIO_HOST}/json/stations/bytagexact/${encodeURIComponent(tag)}?${params.toString()}`;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isHttpsStream(url: string): boolean {
  return /^https:\/\//i.test(url.trim());
}

/** 只保留有 https 播放地址的站点 */
export function parseStations(json: unknown, limit = MAX_STATIONS): RadioStation[] {
  if (!Array.isArray(json)) return [];
  const out: RadioStation[] = [];
  for (const raw of json) {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const name = str(item.name);
    const url = str(item.url_resolved) || str(item.url);
    if (!name || !url || !isHttpsStream(url)) continue;
    const tags = str(item.tags)
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .slice(0, 3);
    const country = str(item.country);
    const homepage = str(item.homepage);
    const bitrate = Number(item.bitrate);
    out.push({
      id: str(item.stationuuid) || url,
      name,
      url,
      tags,
      ...(country ? { country } : {}),
      ...(homepage ? { homepage } : {}),
      ...(Number.isFinite(bitrate) && bitrate > 0 ? { bitrate } : {}),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function formatBitrate(kbps: number | undefined): string {
  return kbps ? `${Math.round(kbps)} kbps` : "";
}

export function formatTags(station: RadioStation): string {
  const parts = [station.country, ...station.tags].filter((part) => Boolean(part));
  return parts.join(" · ");
}
