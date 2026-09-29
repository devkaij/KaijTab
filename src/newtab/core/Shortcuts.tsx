import { useEffect, useRef, useState } from "preact/hooks";
import { editing, removeShortcut, shortcutEditor, state } from "@/newtab/store";
import type { Shortcut } from "@/shared/types";
import { iconCandidates, ICON_LOAD_TIMEOUT_MS } from "./icons";

export function ShortcutTile({ item }: { item: Shortcut }) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setIndex(0);
    setLoaded(false);
  }, [item.icon, item.url]);

  const candidates = iconCandidates(item);
  const src = index < candidates.length ? (candidates[index] ?? null) : null;

  const advance = () => {
    setLoaded(false);
    setIndex((current) => current + 1);
  };

  /**
   * 图片探测：事件 + 立即检查 + 轮询 + 超时四重保险。
   * （失败请求可能早于监听器挂载就完成，只靠 onError 会漏掉 → 卡出空白格）
   */
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

  return (
    <div class="kt-sc-tile" data-testid={`shortcut-${item.id}`}>
      <a
        class="kt-sc-link"
        href={item.url}
        title={item.title}
        onClick={(e) => {
          if (editing.value) e.preventDefault();
        }}
      >
        <span class="kt-sc-icon">
          {!loaded ? (
            <span class="kt-sc-letter">{(item.title || item.url)[0]?.toUpperCase() ?? "?"}</span>
          ) : null}
          {src ? <img ref={imgRef} src={src} alt="" draggable={false} /> : null}
        </span>
        <span class="kt-sc-title">{item.title}</span>
      </a>
      <div class="kt-sc-actions kt-interactive">
        <button
          class="kt-sc-action"
          title="编辑"
          onClick={() =>
            shortcutEditor.value = {
              id: item.id,
              title: item.title,
              url: item.url,
              icon: item.icon ?? "",
            }
          }
        >
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path
              fill="currentColor"
              d="M4 20h4.4l10-10a2 2 0 0 0 0-2.8l-1.6-1.6a2 2 0 0 0-2.8 0l-10 10V20Zm14.7-13.3 1-1a2 2 0 0 0 0-2.8l-.6-.6a2 2 0 0 0-2.8 0l-1 1 3.4 3.4Z"
            />
          </svg>
        </button>
        <button
          class="kt-sc-action kt-sc-action-danger"
          title="删除"
          onClick={() => {
            if (window.confirm(`删除快捷方式「${item.title}」？`)) removeShortcut(item.id);
          }}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path fill="currentColor" d="M6 7h12l-1 13H7L6 7Zm3-3h6l1 2H8l1-2Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function Shortcuts({ instanceId }: { instanceId: string; props: Record<string, unknown> }) {
  const items = state.value.shortcuts.items;

  return (
    <div class="kt-shortcuts" data-testid={`shortcuts-${instanceId}`}>
      {items.map((item) => (
        <ShortcutTile key={item.id} item={item} />
      ))}
      {editing.value ? (
        <button
          class="kt-sc-tile kt-sc-add kt-interactive"
          onClick={() => (shortcutEditor.value = { id: null, title: "", url: "", icon: "" })}
          data-testid="shortcut-add"
        >
          <span class="kt-sc-icon">
            <svg viewBox="0 0 24 24" width="45%" height="45%" aria-hidden="true">
              <path fill="currentColor" d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6Z" />
            </svg>
          </span>
          <span class="kt-sc-title">添加</span>
        </button>
      ) : null}
    </div>
  );
}
