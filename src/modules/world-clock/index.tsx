import { useEffect, useRef, useState } from "preact/hooks";
import type { ModuleProps } from "@/newtab/module-host/types";
import {
  formatZoneDate,
  formatZoneTime,
  parseZoneList,
  zoneDateKey,
  zoneLabel,
  zoneOffsetLabel,
} from "./logic";
import "./world-clock.css";

const FALLBACK_ZONES = ["Asia/Shanghai", "America/New_York", "Europe/London"];

export default function WorldClock({ props, runtime }: ModuleProps) {
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const zones = (() => {
    const parsed = parseZoneList(props.zones);
    return parsed.length > 0 ? parsed : FALLBACK_ZONES;
  })();
  const showSeconds = props.showSeconds !== false;
  const highlightLocal = props.highlightLocal !== false;

  const [now, setNow] = useState(() => new Date());
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localKey = zoneDateKey(now, localZone);

  useEffect(() => {
    let timer = 0;
    const tick = () => setNow(new Date());
    const start = () => {
      tick();
      timer = window.setInterval(tick, showSeconds ? 1000 : 20_000);
    };
    const stop = () => {
      if (timer) window.clearInterval(timer);
      timer = 0;
    };

    start();
    const off = runtimeRef.current.visibility.onChange((visible) => (visible ? start() : stop()));
    return () => {
      stop();
      off();
    };
  }, [showSeconds]);

  return (
    <div class="kt-world" data-testid="world-clock">
      {zones.map((zone) => {
        const isLocal = zone === localZone;
        const otherDay = zoneDateKey(now, zone) !== localKey;
        return (
          <div
            class={`kt-world-row ${highlightLocal && isLocal ? "kt-world-local" : ""}`}
            key={zone}
            data-testid={`zone-${zone}`}
          >
            <span class="kt-world-city">
              {zoneLabel(zone)}
              {highlightLocal && isLocal ? <em class="kt-world-badge">本机</em> : null}
            </span>
            <span class="kt-world-time">
              {formatZoneTime(now, zone, showSeconds)}
              {otherDay ? <em class="kt-world-day">次日/前日</em> : null}
            </span>
            <span class="kt-world-meta">
              {formatZoneDate(now, zone)} · {zoneOffsetLabel(now, zone)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
