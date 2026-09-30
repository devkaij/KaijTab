/** 世界时钟纯逻辑：时区校验、标签、时间格式化。 */

export const MAX_ZONES = 6;

export function isValidZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** 逗号/空格分隔 → 去重、校验、限量 */
export function parseZoneList(text: unknown): string[] {
  if (typeof text !== "string") return [];
  const zones = text
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .filter(isValidZone);
  return [...new Set(zones)].slice(0, MAX_ZONES);
}

export function zoneLabel(timeZone: string): string {
  const city = timeZone.split("/").pop() ?? timeZone;
  return city.replace(/_/g, " ");
}

/** 形如 UTC+8 */
export function zoneOffsetLabel(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(date);
    const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    return name.replace("GMT", "UTC") || "";
  } catch {
    return "";
  }
}

export function formatZoneTime(date: Date, timeZone: string, withSeconds = true): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      ...(withSeconds ? { second: "2-digit" } : {}),
      hour12: false,
    }).format(date);
  } catch {
    return "--:--";
  }
}

export function formatZoneDate(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(date);
  } catch {
    return "";
  }
}

/** 判断该时区当前是不是"同一天"（用于标记跨日） */
export function zoneDateKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}
