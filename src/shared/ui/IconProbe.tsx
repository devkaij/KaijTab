/** 图标探测组件：候选链 + 事件/立即检查/轮询/超时多重保险，快捷方式与书签共用。 */
import { useEffect, useRef, useState } from "preact/hooks";
import {
  fetchPageIcons,
  iconCandidates,
  serviceIconCandidates,
  ICON_LOAD_TIMEOUT_MS,
} from "@/shared/utils/icons";
import { hasHostPermission } from "@/shared/utils/permissions";

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
  /** 静态候选耗尽后补充的候选：页面 HTML 解析结果（需域名授权，可能为空） */
  const [dynamic, setDynamic] = useState<string[]>([]);
  const imgRef = useRef<HTMLImageElement>(null);
  const expandedRef = useRef(false);

  useEffect(() => {
    setIndex(0);
    setLoaded(false);
    setDynamic([]);
    expandedRef.current = false;
  }, [icon, url]);

  const base = iconCandidates(icon ? { url, icon } : { url });
  const candidates = [...base, ...dynamic, ...serviceIconCandidates(url)];
  const src = index < candidates.length ? (candidates[index] ?? null) : null;

  // 静态路径全部失败后补两档：抓页面 HTML 解析 <link rel=icon>（需已授权该域名），
  // 公开图标服务（DDG/Google）不需要权限，直接排在候选链末尾。
  // HTML 解析是异步的：等它返回时若当前 src 已落到服务段且加载成功，就不再回退。
  useEffect(() => {
    if (expandedRef.current || base.length === 0 || index < base.length) return;
    expandedRef.current = true;
    let cancelled = false;
    (async () => {
      let pageIcons: string[] = [];
      try {
        if (await hasHostPermission(url)) pageIcons = await fetchPageIcons(url);
      } catch {
        // 权限检查/抓取失败都当"没有页面候选"，走服务兜底
      }
      if (!cancelled) setDynamic(pageIcons);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, base.length, url]);

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
