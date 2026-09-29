/** 倒计时纯逻辑：日期解析、整天数差、按年重复的"下一次/最近一次"求解。 */

export type CountMode = "until" | "since";

export function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  // 回读校验，避免 2026-02-31 这类溢出
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** 以"本地日历天"为准折算成整数天序号（跨夏令时也稳定） */
export function toDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

/** from → to 相差的整天数（可为负） */
export function daysBetween(from: Date, to: Date): number {
  return toDayNumber(to) - toDayNumber(from);
}

/**
 * 求解真正参与计算的那一天：
 * - 不重复：直接用目标日期
 * - 每年重复 + until：今年还没到就今年，过了就明年
 * - 每年重复 + since：今年已过就今年，还没到就用去年
 * 2 月 29 日在非闰年回退到 2 月 28 日。
 */
export function resolveOccurrence(
  target: Date,
  today: Date,
  repeatYearly: boolean,
  mode: CountMode,
): Date {
  if (!repeatYearly) return target;

  const month = target.getMonth();
  const day = target.getDate();
  const build = (year: number): Date => {
    const candidate = new Date(year, month, day);
    if (candidate.getMonth() !== month) {
      // 例如 2/29 落在非闰年 → 退回 2/28
      return new Date(year, month, day - 1);
    }
    return candidate;
  };

  const todayNumber = toDayNumber(today);
  if (mode === "until") {
    const thisYear = build(today.getFullYear());
    return toDayNumber(thisYear) < todayNumber ? build(today.getFullYear() + 1) : thisYear;
  }
  const thisYear = build(today.getFullYear());
  return toDayNumber(thisYear) > todayNumber ? build(today.getFullYear() - 1) : thisYear;
}

export interface CountdownInfo {
  /** until：距离目标还有多少天；since：已经过去多少天。均 ≥ 0 */
  days: number;
  occurrence: Date;
  isToday: boolean;
}

export function countdownInfo(
  target: Date | null,
  today: Date,
  repeatYearly: boolean,
  mode: CountMode,
): CountdownInfo | null {
  if (!target) return null;
  const occurrence = resolveOccurrence(target, today, repeatYearly, mode);
  const days =
    mode === "until"
      ? daysBetween(today, occurrence)
      : daysBetween(occurrence, today);
  return { days, occurrence, isToday: days === 0 };
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}
