import {
  arrangingShortcuts,
  clearShortcutPositions,
  editing,
  removeShortcut,
  setShortcutPos,
  setShortcutPositions,
  shortcutEditor,
  state,
} from "@/newtab/store";
import type { Shortcut } from "@/shared/types";
import { IconProbe } from "@/shared/ui/IconProbe";
import { GuidesOverlay } from "@/newtab/canvas/Guides";
import { clamp01, clampToViewport } from "@/newtab/canvas/geometry";
import { computeSnap, type GuideLine } from "@/newtab/canvas/snapping";
import { useEffect, useRef, useState } from "preact/hooks";
import { isFreeMode, styleFromPos } from "./shortcut-layout";

const TILE_SELECTOR = "[data-shortcut-tile]";

/** 记录当前网格里单个图标的宽度（占容器宽度的百分比），自由摆放时保持同等观感 */
function measureTileWidth(container: HTMLElement): void {
  const box = container.getBoundingClientRect();
  if (box.width === 0) return;
  let maxWidth = 0;
  container.querySelectorAll<HTMLElement>(TILE_SELECTOR).forEach((tile) => {
    maxWidth = Math.max(maxWidth, tile.getBoundingClientRect().width);
  });
  if (maxWidth > 0) {
    container.style.setProperty("--kt-arrange-tile-w", `${(maxWidth / box.width) * 100}%`);
    container.dataset.tileWidthSet = "true";
  }
}

export function Shortcuts({ instanceId }: { instanceId: string; props: Record<string, unknown> }) {
  const items = state.value.shortcuts.items;
  const editingLayout = editing.value;
  const arranging = arrangingShortcuts.value === instanceId;
  const freeMode = isFreeMode(items);

  const containerRef = useRef<HTMLDivElement>(null);
  const [localGuides, setLocalGuides] = useState<GuideLine[]>([]);
  const movedRef = useRef(false);

  // 自由摆放模式下（含刷新后）恢复图标宽度基准
  useEffect(() => {
    if (!freeMode) return;
    const container = containerRef.current;
    if (!container || container.dataset.tileWidthSet === "true") return;
    const raf = requestAnimationFrame(() => measureTileWidth(container));
    return () => cancelAnimationFrame(raf);
  }, [freeMode]);

  /** 首次拖动时把当前网格几何"播种"为自由位置，避免跳变；返回是否可用 */
  const ensureFreeMode = (container: HTMLElement): boolean => {
    if (isFreeMode(state.value.shortcuts.items)) return true;
    const box = container.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const updates: Array<{ id: string; pos: { x: number; y: number } }> = [];
    container.querySelectorAll<HTMLElement>(TILE_SELECTOR).forEach((tile) => {
      const id = tile.dataset.shortcutTile;
      if (!id) return;
      const rect = tile.getBoundingClientRect();
      updates.push({
        id,
        pos: {
          x: clamp01((rect.left - box.left) / box.width),
          y: clamp01((rect.top - box.top) / box.height),
        },
      });
    });
    if (updates.length === 0) return false;
    measureTileWidth(container);
    setShortcutPositions(updates);
    return true;
  };

  const startTileDrag = (item: Shortcut) => (e: PointerEvent) => {
    if (!arranging || e.button !== 0) return;
    const tile = e.currentTarget as HTMLElement;
    const container = containerRef.current;
    if (!container) return;

    e.preventDefault();
    e.stopPropagation();

    // 先量好网格几何，再切换为自由摆放
    const box = container.getBoundingClientRect();
    const rect = tile.getBoundingClientRect();
    const startTile = {
      x: rect.left - box.left,
      y: rect.top - box.top,
      w: rect.width,
      h: rect.height,
    };
    const others = [...container.querySelectorAll<HTMLElement>(TILE_SELECTOR)]
      .filter((node) => node !== tile)
      .map((node) => {
        const r = node.getBoundingClientRect();
        return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
      });

    if (!ensureFreeMode(container)) return;

    const startPointer = { x: e.clientX, y: e.clientY };
    try {
      tile.setPointerCapture(e.pointerId);
    } catch {
      // 合成事件或指针已释放：忽略（后续事件仍会派发到该元素）
    }
    tile.style.willChange = "left, top";

    let latest: { x: number; y: number } = item.pos ?? {
      x: startTile.x / box.width,
      y: startTile.y / box.height,
    };
    let raf = 0;
    let lastEvent = e;

    const frame = () => {
      raf = 0;
      const dx = lastEvent.clientX - startPointer.x;
      const dy = lastEvent.clientY - startPointer.y;
      let px = startTile.x + dx;
      let py = startTile.y + dy;
      let lines: GuideLine[] = [];

      if (!lastEvent.altKey) {
        const snap = computeSnap(
          { x: px, y: py, w: startTile.w, h: startTile.h },
          {
            threshold: 6,
            viewport: { w: box.width, h: box.height },
            others,
            grid: 8,
          },
        );
        px += snap.dx;
        py += snap.dy;
        lines = snap.guides;
      }

      const clamped = clampToViewport(
        px,
        py,
        { w: startTile.w, h: startTile.h },
        { w: box.width, h: box.height },
      );
      tile.style.left = `${clamped.x}px`;
      tile.style.top = `${clamped.y}px`;
      latest = { x: clamped.x / box.width, y: clamped.y / box.height };
      setLocalGuides(lines);
      movedRef.current = true;
    };

    const onMove = (ev: PointerEvent) => {
      lastEvent = ev;
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const finish = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        frame();
      }
      tile.removeEventListener("pointermove", onMove);
      tile.removeEventListener("pointerup", finish);
      tile.removeEventListener("pointercancel", finish);
      tile.style.willChange = "";
      setLocalGuides([]);
      setShortcutPos(item.id, latest);
    };

    tile.addEventListener("pointermove", onMove);
    tile.addEventListener("pointerup", finish);
    tile.addEventListener("pointercancel", finish);
  };

  const finishArranging = () => {
    if (!movedRef.current) clearShortcutPositions();
    arrangingShortcuts.value = null;
    movedRef.current = false;
  };

  return (
    <div
      ref={containerRef}
      class="kt-shortcuts"
      data-free={freeMode ? "true" : "false"}
      data-arranging={arranging ? "true" : "false"}
      data-testid={`shortcuts-${instanceId}`}
    >
      {items.map((item) => (
        <div
          key={item.id}
          class="kt-sc-tile"
          data-shortcut-tile={item.id}
          data-testid={`shortcut-${item.id}`}
          style={freeMode ? styleFromPos(item.pos) : undefined}
          onPointerDown={arranging ? startTileDrag(item) : undefined}
        >
          <a
            class="kt-sc-link"
            href={item.url}
            title={item.title}
            draggable={false}
            onClick={(e) => {
              if (editingLayout || arranging) e.preventDefault();
            }}
          >
            <span class="kt-sc-icon">
              <IconProbe
                url={item.url}
                icon={item.icon}
                letter={item.title}
                letterClassName="kt-sc-letter"
              />
            </span>
            <span class="kt-sc-title">{item.title}</span>
          </a>
          <div class="kt-sc-actions kt-interactive">
            <button
              class="kt-sc-action"
              title="编辑"
              onClick={() =>
                shortcuteEditorOpen(item)
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
      ))}

      {editingLayout && !arranging ? (
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

      {arranging ? (
        <div class="kt-sc-arrange-bar kt-interactive" data-testid="shortcut-arrange-bar">
          <span class="kt-sc-arrange-hint">拖动图标摆放 · Alt 关闭吸附</span>
          <button
            class="kt-sc-arrange-btn"
            onClick={() => {
              clearShortcutPositions();
              movedRef.current = true;
            }}
            data-testid="shortcut-arrange-reset"
          >
            恢复自动排列
          </button>
          <button
            class="kt-sc-arrange-btn kt-sc-arrange-primary"
            onClick={finishArranging}
            data-testid="shortcut-arrange-done"
          >
            完成
          </button>
        </div>
      ) : null}

      <GuidesOverlay lines={localGuides} />
    </div>
  );
}

function shortcuteEditorOpen(item: Shortcut): void {
  shortcutEditor.value = {
    id: item.id,
    title: item.title,
    url: item.url,
    icon: item.icon ?? "",
  };
}
