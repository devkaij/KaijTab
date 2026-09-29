/** 图标探测组件：候选链 + 事件/立即检查/轮询/超时四重保险，快捷方式与书签共用。 */
import { useEffect, useRef, useState } from "preact/hooks";
import { iconCandidates, ICON_LOAD_TIMEOUT_MS } from "@/shared/utils/icons";

export function IconProbe({
  url,
  icon,
  letter,
  letterClassName,
}: {
  url: string;
  icon?: string;
  /** 回退字母的来源（一般是名称） */
  letter?: string;
  letterClassName?: string;
}) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setIndex(0);
    setLoaded(false);
  }, [icon, url]);

  const candidates = iconCandidates(icon ? { url, icon } : { url });
  const src = index < candidates.length ? (candidates[index] ?? null) : null;

  const advance = () => {
    setLoaded(false);
    setIndex((current) => current + 1);
  };

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !src) return;

    let settled = false;
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (ok) setLoaded(true);
      else advance();
    };

    const onLoad = () => settle(true);
    const onError = () => settle(false);
    const check = () => {
      if (settled || !img.complete) return;
      settle(img.naturalWidth > 0);
    };

    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);
    check();
    const interval = setInterval(check, 500);
    const timer = setTimeout(() => settle(false), ICON_LOAD_TIMEOUT_MS);

    return () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
      clearInterval(interval);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const initial = (letter?.trim() || url || "?")[0]?.toUpperCase() ?? "?";

  return (
    <>
      {!loaded ? (
        <span class={letterClassName} data-icon-fallback>
          {initial}
        </span>
      ) : null}
      {src ? <img ref={imgRef} src={src} alt="" draggable={false} /> : null}
    </>
  );
}
