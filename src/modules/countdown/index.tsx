import { useEffect, useState } from "preact/hooks";
import type { ModuleProps } from "@/newtab/module-host/types";
import { countdownInfo, formatDate, parseDateOnly, type CountMode } from "./logic";
import "./countdown.css";

const MODE_LABEL: Record<CountMode, { prefix: string; unit: string }> = {
  until: { prefix: "距离", unit: "天" },
  since: { prefix: "", unit: "天" },
};

export default function Countdown({ props }: ModuleProps) {
  const [today, setToday] = useState(() => new Date());

  // 跨天自动刷新（每分钟检查一次，跨过零点时重算）
  useEffect(() => {
    const timer = setInterval(() => setToday(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const title = typeof props.title === "string" && props.title.trim() ? props.title : "目标日";
  const target = parseDateOnly(props.date);
  const mode: CountMode = props.mode === "since" ? "since" : "until";
  const repeatYearly = props.repeatYearly !== false;
  const info = countdownInfo(target, today, repeatYearly, mode);

  if (!target || !info) {
    return (
      <div class="kt-countdown kt-countdown-empty" data-testid="countdown">
        <span>请在「设置」里填写有效的日期</span>
      </div>
    );
  }

  const label = MODE_LABEL[mode];

  return (
    <div class="kt-countdown" data-testid="countdown">
      <div class="kt-countdown-title">
        {label.prefix}
        {title}
      </div>
      {info.isToday ? (
        <div class="kt-countdown-today">就是今天 🎉</div>
      ) : (
        <div class="kt-countdown-days">
          <span class="kt-countdown-number" data-testid="countdown-number">
            {info.days}
          </span>
          <span class="kt-countdown-unit">{label.unit}</span>
        </div>
      )}
      <div class="kt-countdown-date">
        {formatDate(info.occurrence)}
        {repeatYearly ? " · 每年重复" : ""}
      </div>
    </div>
  );
}
