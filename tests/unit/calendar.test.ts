import { describe, expect, it } from "vitest";
import {
  formatEventWhen,
  isSameDay,
  parseIcs,
  parseIcsDate,
  reviveEvents,
  unfoldLines,
  unescapeIcsText,
  upcomingEvents,
  zonedTimeToUtc,
} from "@/modules/calendar/logic";

const ICS_SAMPLE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Test//CN",
  "BEGIN:VEVENT",
  "UID:evt-1",
  "SUMMARY:周会",
  "LOCATION:会议室 A",
  "DTSTART:20260930T100000Z",
  "DTEND:20260930T110000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:evt-2",
  "SUMMARY:全天活动\\, 带逗号",
  "DTSTART;VALUE=DATE:20261001",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:evt-3",
  "SUMMARY:上海时间下午三点",
  "DTSTART;TZID=Asia/Shanghai:20261002T150000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("unfoldLines / unescapeIcsText", () => {
  it("续行拼接", () => {
    expect(unfoldLines("SUMMARY:第一行\r\n 第二行\r\nUID:1")).toEqual([
      "SUMMARY:第一行第二行",
      "UID:1",
    ]);
  });

  it("反转义", () => {
    expect(unescapeIcsText("带逗号\\, 和分号\\; 与换行\\n第二行")).toBe(
      "带逗号, 和分号; 与换行\n第二行",
    );
  });
});

describe("parseIcsDate", () => {
  it("全天日期", () => {
    const parsed = parseIcsDate("20261001")!;
    expect(parsed.allDay).toBe(true);
    expect(parsed.date.getFullYear()).toBe(2026);
    expect(parsed.date.getMonth()).toBe(9);
    expect(parsed.date.getDate()).toBe(1);
  });

  it("UTC 时间", () => {
    const parsed = parseIcsDate("20260930T100000Z")!;
    expect(parsed.allDay).toBe(false);
    expect(parsed.date.toISOString()).toBe("2026-09-30T10:00:00.000Z");
  });

  it("带 TZID 按该时区换算", () => {
    const parsed = parseIcsDate("20261002T150000", "TZID=Asia/Shanghai")!;
    // 上海 15:00 = UTC 07:00
    expect(parsed.date.toISOString()).toBe("2026-10-02T07:00:00.000Z");
  });

  it("浮动时间按本地时间", () => {
    const parsed = parseIcsDate("20260930T080000")!;
    expect(parsed.date.getHours()).toBe(8);
  });

  it("非法输入返回 null", () => {
    expect(parseIcsDate("2026-09-30")).toBeNull();
    expect(parseIcsDate("")).toBeNull();
  });

  it("跨夏令时的时区换算（纽约）", () => {
    const summer = zonedTimeToUtc(2026, 7, 1, 12, 0, 0, "America/New_York");
    const winter = zonedTimeToUtc(2026, 1, 15, 12, 0, 0, "America/New_York");
    expect(summer.toISOString()).toBe("2026-07-01T16:00:00.000Z"); // UTC-4
    expect(winter.toISOString()).toBe("2026-01-15T17:00:00.000Z"); // UTC-5
  });
});

describe("parseIcs", () => {
  it("解析多个事件（含全天、时区、转义）", () => {
    const events = parseIcs(ICS_SAMPLE);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ summary: "周会", location: "会议室 A", allDay: false });
    expect(events[0]?.start.toISOString()).toBe("2026-09-30T10:00:00.000Z");
    expect(events[1]).toMatchObject({ summary: "全天活动, 带逗号", allDay: true });
    expect(events[2]?.start.toISOString()).toBe("2026-10-02T07:00:00.000Z");
  });

  it("坏输入不崩", () => {
    expect(parseIcs("")).toEqual([]);
    expect(parseIcs("BEGIN:VCALENDAR\nEND:VCALENDAR")).toEqual([]);
  });
});

describe("reviveEvents（缓存还原）", () => {
  it("把 JSON 里的字符串时间还原成 Date", () => {
    const revived = reviveEvents([
      {
        uid: "e1",
        summary: "会议",
        start: "2026-09-30T10:00:00.000Z",
        end: "2026-09-30T11:00:00.000Z",
        allDay: false,
        location: "会议室",
      },
      { start: "2026-10-01T00:00:00.000Z", summary: "", allDay: true },
    ]);
    expect(revived).toHaveLength(2);
    expect(revived[0]?.start).toBeInstanceOf(Date);
    expect(revived[0]?.start.toISOString()).toBe("2026-09-30T10:00:00.000Z");
    expect(revived[0]?.end?.toISOString()).toBe("2026-09-30T11:00:00.000Z");
    expect(revived[1]?.summary).toBe("(无标题)");
    expect(revived[1]?.allDay).toBe(true);
  });

  it("丢弃时间非法的条目，坏输入返回空数组", () => {
    expect(reviveEvents([{ start: "不是时间" }])).toEqual([]);
    expect(reviveEvents(null)).toEqual([]);
    expect(reviveEvents({} as unknown)).toEqual([]);
  });
});

describe("upcomingEvents / formatEventWhen", () => {
  const now = new Date(2026, 8, 30, 9, 0); // 本地 2026-09-30 09:00
  const events = [
    ...parseIcs(ICS_SAMPLE),
    {
      uid: "past",
      summary: "已经过去",
      start: new Date(2026, 8, 20, 10, 0),
      end: null,
      allDay: false,
    },
    {
      uid: "far",
      summary: "很久以后",
      start: new Date(2026, 10, 1, 10, 0),
      end: null,
      allDay: false,
    },
  ];

  it("只保留近期事件并按时间排序", () => {
    const upcoming = upcomingEvents(events, now, 7);
    expect(upcoming.map((event) => event.summary)).toEqual([
      "周会",
      "全天活动, 带逗号",
      "上海时间下午三点",
    ]);
  });

  it("时间标签", () => {
    const upcoming = upcomingEvents(events, now, 7);
    expect(formatEventWhen(upcoming[0]!, now)).toBe("今天 18:00"); // UTC 10:00 在本地 UTC+8 是 18:00
    expect(formatEventWhen(upcoming[1]!, now)).toBe("明天 · 全天");
  });

  it("isSameDay", () => {
    expect(isSameDay(new Date(2026, 8, 30, 1), new Date(2026, 8, 30, 23))).toBe(true);
    expect(isSameDay(new Date(2026, 8, 30), new Date(2026, 9, 1))).toBe(false);
  });
});
