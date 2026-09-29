import { useEffect, useState } from "preact/hooks";
import type { ModuleProps } from "@/newtab/module-host/types";
import "./clock.css";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export default function Clock({ props, runtime }: ModuleProps) {
  const showSeconds = props.showSeconds !== false;
  const showDate = props.showDate !== false;
  const hour12 = props.hour12 === true;

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer = 0;
    const tick = () => setNow(new Date());
    const interval = showSeconds ? 1000 : 20000;

    const start = () => {
      tick();
      timer = window.setInterval(tick, interval);
    };
    const stop = () => {
      if (timer) window.clearInterval(timer);
      timer = 0;
    };

    start();
    const off = runtime.visibility.onChange((visible) => (visible ? start() : stop()));
    return () => {
      stop();
      off();
    };
  }, [showSeconds, runtime]);

  const hours24 = now.getHours();
  const displayHours = hour12 ? ((hours24 + 11) % 12) + 1 : hours24;
  const suffix = hour12 ? (hours24 < 12 ? "AM" : "PM") : "";

  return (
    <div class="kt-clock" data-testid="clock">
      <div class="kt-clock-time">
        <span>{pad(displayHours)}</span>
        <span class="kt-clock-colon">:</span>
        <span>{pad(now.getMinutes())}</span>
        {showSeconds ? (
          <>
            <span class="kt-clock-colon">:</span>
            <span class="kt-clock-seconds">{pad(now.getSeconds())}</span>
          </>
        ) : null}
        {suffix ? <span class="kt-clock-suffix">{suffix}</span> : null}
      </div>
      {showDate ? (
        <div class="kt-clock-date">
          {now.getFullYear()} 年 {now.getMonth() + 1} 月 {now.getDate()} 日 · {WEEKDAYS[now.getDay()]}
        </div>
      ) : null}
    </div>
  );
}
