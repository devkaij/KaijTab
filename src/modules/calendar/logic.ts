/** ICS（iCalendar）纯逻辑：解析 VEVENT、时区换算、近期事件筛选。 */

export interface IcsEvent {
  uid: string;
  summary: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  location?: string;
}

export const MAX_EVENTS = 300;

/** RFC 5545：以空格/制表符开头的行是上一行的续行 */
export function unfoldLines(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if (/^[ \t]/.test(line) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

export function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

/** 把"某个时区的墙上时间"换算成 UTC 瞬间 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = tzOffsetMs(new Date(guess), timeZone);
  let timestamp = guess - first;
  const secondOffset = tzOffsetMs(new Date(timestamp), timeZone);
  if (secondOffset !== first) timestamp = guess - secondOffset;
  return new Date(timestamp);
}

export interface ParsedIcsDate {
  date: Date;
  allDay: boolean;
}

/** 支持 YYYYMMDD（全天）、YYYYMMDDTHHMMSSZ（UTC）、YYYYMMDDTHHMMSS（浮动/带 TZID） */
export function parseIcsDate(value: string, params = ""): ParsedIcsDate | null {
  const text = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return { date: new Date(Number(y), Number(m) - 1, Number(d)), allDay: true };
  }

  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(text);
  if (!dateTime) return null;
  const [, y, m, d, hh, mm, ss, zulu] = dateTime;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const hour = Number(hh);
  const minute = Number(mm);
  const second = Number(ss);

  if (zulu) return { date: new Date(Date.UTC(year, month - 1, day, hour, minute, second)), allDay: false };

  const zone = /TZID=([^:;]+)/i.exec(params)?.[1]?.replace(/^"|"$/g, "");
  if (zone) {
    try {
      return {
        date: zonedTimeToUtc(year, month, day, hour, minute, second, zone),
        allDay: false,
      };
    } catch {
      // 未知时区：退回本地时间
    }
  }
  return { date: new Date(year, month - 1, day, hour, minute, second), allDay: false };
}

function splitProperty(line: string): { name: string; params: string; value: string } | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const semi = left.indexOf(";");
  const name = (semi < 0 ? left : left.slice(0, semi)).trim().toUpperCase();
  const params = semi < 0 ? "" : left.slice(semi + 1);
  return { name, params, value };
}

export function parseIcs(text: string, limit = MAX_EVENTS): IcsEvent[] {
  const lines = unfoldLines(text);
  const events: IcsEvent[] = [];
  let current: Partial<IcsEvent> & { raw?: Record<string, { value: string; params: string }> } | null =
    null;

  const flush = () => {
    if (!current) return;
    const start = current.start;
    if (start) {
      events.push({
        uid: current.uid || `${start.getTime()}-${events.length}`,
        summary: current.summary || "(无标题)",
        start,
        end: current.end ?? null,
        allDay: current.allDay === true,
        ...(current.location ? { location: current.location } : {}),
      });
    }
    current = null;
  };

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith("BEGIN:VEVENT")) {
      current = {};
      continue;
    }
    if (upper.startsWith("END:VEVENT")) {
      flush();
      if (events.length >= limit) break;
      continue;
    }
    if (!current) continue;

    const prop = splitProperty(line);
    if (!prop) continue;
    switch (prop.name) {
      case "UID":
        current.uid = prop.value.trim();
        break;
      case "SUMMARY":
        current.summary = unescapeIcsText(prop.value);
        break;
      case "LOCATION":
        current.location = unescapeIcsText(prop.value);
        break;
      case "DTSTART": {
        const parsed = parseIcsDate(prop.value, prop.params);
        if (parsed) {
          current.start = parsed.date;
          current.allDay = parsed.allDay;
        }
        break;
      }
      case "DTEND": {
        const parsed = parseIcsDate(prop.value, prop.params);
        if (parsed) current.end = parsed.date;
        break;
      }
      default:
        break;
    }
  }
  flush();

  return events;
}

/** 从缓存（JSON 序列化过）恢复事件：Date 会被存成字符串，这里负责还原 */
export function reviveEvents(raw: unknown): IcsEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: IcsEvent[] = [];
  for (const item of raw) {
    const record = (item ?? {}) as Record<string, unknown>;
    const start = new Date(record.start as string | number);
    if (Number.isNaN(start.getTime())) continue;
    const endRaw = record.end == null ? null : new Date(record.end as string | number);
    const end = endRaw && !Number.isNaN(endRaw.getTime()) ? endRaw : null;
    const uid = typeof record.uid === "string" && record.uid ? record.uid : String(start.getTime());
    const summary = typeof record.summary === "string" && record.summary ? record.summary : "(无标题)";
    const location = typeof record.location === "string" ? record.location : "";
    out.push({
      uid,
      summary,
      start,
      end,
      allDay: record.allDay === true,
      ...(location ? { location } : {}),
    });
  }
  return out;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 取 [from 当天, from + days] 内的事件：进行中的也算，按开始时间排序 */
export function upcomingEvents(
  events: IcsEvent[],
  from: Date,
  days: number,
  limit = 20,
): IcsEvent[] {
  const startOfToday = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const until = new Date(startOfToday.getTime() + (days + 1) * 86_400_000);
  return events
    .filter((event) => {
      const end = event.end ?? new Date(event.start.getTime() + 3_600_000);
      if (end < startOfToday) return false;
      return event.start < until;
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, limit);
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function formatEventWhen(event: IcsEvent, now: Date): string {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

  const dayLabel = isSameDay(event.start, now)
    ? "今天"
    : isSameDay(event.start, tomorrow)
      ? "明天"
      : isSameDay(event.start, yesterday)
        ? "昨天"
        : `${event.start.getMonth() + 1}月${event.start.getDate()}日 ${WEEKDAYS[event.start.getDay()]}`;

  if (event.allDay) return `${dayLabel} · 全天`;
  const time = `${String(event.start.getHours()).padStart(2, "0")}:${String(
    event.start.getMinutes(),
  ).padStart(2, "0")}`;
  return `${dayLabel} ${time}`;
}
