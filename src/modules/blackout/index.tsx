import { useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import type { ModuleProps } from "@/newtab/module-host/types";
import "./blackout.css";

interface WakeLockLike {
  release(): Promise<void>;
}

interface WakeLockApi {
  request(type: "screen"): Promise<WakeLockLike>;
}

function wakeLockApi(): WakeLockApi | null {
  const nav = navigator as unknown as { wakeLock?: WakeLockApi };
  return nav.wakeLock ?? null;
}

function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function Blackout({ props }: ModuleProps) {
  const [active, setActive] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const layerRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<WakeLockLike | null>(null);

  const showClock = props.showClock === true;
  const keepAwake = props.keepAwake !== false;

  const requestWakeLock = () => {
    const api = wakeLockApi();
    if (!api) return;
    void api
      .request("screen")
      .then((lock) => {
        wakeLockRef.current = lock;
      })
      .catch(() => undefined);
  };

  const enter = async () => {
    // 先用覆盖层立刻变黑（即使全屏被拒也有效）
    setActive(true);
    setHintVisible(true);

    // 关键：黑屏层是常驻渲染的，这里 ref 一定拿得到；
    // 请求必须在点击手势的同一个任务里发起，否则浏览器会拒绝。
    const layer = layerRef.current;
    if (layer && document.fullscreenEnabled && !document.fullscreenElement) {
      try {
        await layer.requestFullscreen({ navigationUI: "hide" });
      } catch {
        // 浏览器拒绝（例如页面失焦）：黑屏层兜底，提示里会给出 F11
      }
    }
    setFullscreen(Boolean(document.fullscreenElement));
    if (keepAwake) requestWakeLock();
  };

  const exit = () => {
    setActive(false);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  };

  // Esc 退出全屏后同步状态
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setActive(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // 非全屏兜底：Esc / 任意键退出
  useEffect(() => {
    if (!active) return;
    const onKey = () => exit();
    window.addEventListener("keydown", onKey);
    layerRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // 提示 3 秒后淡出（之后只剩纯黑）
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setHintVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [active]);

  // 极暗时钟：每 20 秒刷新一次足够
  useEffect(() => {
    if (!active || !showClock) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(timer);
  }, [active, showClock]);

  // 页面重新可见时补回常亮锁
  useEffect(() => {
    if (!active || !keepAwake) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, keepAwake]);

  return (
    <div class="kt-blackout" data-testid="blackout">
      <span class="kt-blackout-icon" aria-hidden="true">
        🌙
      </span>
      <span class="kt-blackout-tip">
        全屏纯黑（亮度压到最低）
        <br />
        点击任意处或按 Esc 退出
      </span>
      <button class="kt-blackout-btn" onClick={() => void enter()} data-testid="blackout-enter">
        进入全屏黑屏
      </button>

      {/* 常驻渲染：这样点击时 ref 一定存在，全屏请求才能在手势内发起 */}
      {createPortal(
        <div
          class="kt-blackout-layer"
          ref={layerRef}
          tabIndex={0}
          data-active={active ? "true" : "false"}
          data-fullscreen={fullscreen ? "true" : "false"}
          onPointerDown={active ? exit : undefined}
          data-testid="blackout-layer"
        >
          {active && hintVisible ? (
            <div class="kt-blackout-hint" data-testid="blackout-hint">
              {fullscreen ? "点击任意处或按 Esc 退出" : "浏览器未进入全屏，可按 F11 · 点击任意处或按 Esc 退出"}
            </div>
          ) : null}
          {active && showClock ? (
            <div class="kt-blackout-clock" data-testid="blackout-clock">
              {formatClock(now)}
            </div>
          ) : null}
        </div>,
        document.body,
      )}
    </div>
  );
}
