import { useRef } from "preact/hooks";
import type { WidgetInstance } from "@/shared/types";
import { clampToViewport, instanceRect, type Rect } from "./geometry";
import { computeSnap, type GuideLine, type SnapActiveEdges } from "./snapping";
import {
  editing,
  guides,
  otherRects,
  selectedId,
  state,
  updateItemRect,
  viewport,
} from "@/newtab/store";
import { getItemConstraints } from "@/newtab/module-host/constraints";
import { WidgetHost } from "@/newtab/module-host/WidgetHost";
import { openContextMenu } from "./ContextMenu";

type Dir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const HANDLES: Dir[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const AXIS_BY_DIR: Record<Dir, SnapActiveEdges> = {
  n: { top: true, left: false, centerX: false, right: false, centerY: false, bottom: false },
  s: { bottom: true, left: false, centerX: false, right: false, centerY: false, top: false },
  e: { right: true, left: false, centerX: false, top: false, centerY: false, bottom: false },
  w: { left: true, centerX: false, right: false, top: false, centerY: false, bottom: false },
  ne: { right: true, top: true, left: false, centerX: false, centerY: false, bottom: false },
  nw: { left: true, top: true, centerX: false, right: false, centerY: false, bottom: false },
  se: { right: true, bottom: true, left: false, centerX: false, centerY: false, top: false },
  sw: { left: true, bottom: true, centerX: false, right: false, centerY: false, top: false },
};

function applyRect(el: HTMLElement, r: Rect): void {
  el.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`;
  el.style.width = `${r.w}px`;
  el.style.height = `${r.h}px`;
}

interface GestureHandlers {
  onFrame: (ev: PointerEvent, delta: { dx: number; dy: number }) => void;
  onDone: () => void;
}

function runPointerGesture(el: HTMLElement, ev: PointerEvent, handlers: GestureHandlers): void {
  const startX = ev.clientX;
  const startY = ev.clientY;
  let raf = 0;
  let lastEv = ev;

  el.setPointerCapture(ev.pointerId);
  el.style.willChange = "transform";

  const frame = () => {
    raf = 0;
    handlers.onFrame(lastEv, { dx: lastEv.clientX - startX, dy: lastEv.clientY - startY });
  };

  const onMove = (e: PointerEvent) => {
    lastEv = e;
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const finish = () => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      handlers.onFrame(lastEv, { dx: lastEv.clientX - startX, dy: lastEv.clientY - startY });
    }
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    el.style.willChange = "";
    handlers.onDone();
  };

  const onUp = () => finish();

  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
}

function resizeRect(start: Rect, dir: Dir, dx: number, dy: number): Rect {
  let { x, y, w, h } = start;
  if (dir.includes("e")) w = start.w + dx;
  if (dir.includes("s")) h = start.h + dy;
  if (dir.includes("w")) {
    x = start.x + dx;
    w = start.w - dx;
  }
  if (dir.includes("n")) {
    y = start.y + dy;
    h = start.h - dy;
  }
  return { x, y, w, h };
}

function enforceAspect(start: Rect, r: Rect, dir: Dir): Rect {
  const ratio = start.w / start.h;
  let { x, y, w, h } = r;
  const horizontal = dir.includes("e") || dir.includes("w");
  const vertical = dir.includes("n") || dir.includes("s");
  if (horizontal && vertical) {
    if (Math.abs(w - start.w) >= Math.abs(h - start.h)) h = w / ratio;
    else w = h * ratio;
  } else if (horizontal) {
    h = w / ratio;
  } else if (vertical) {
    w = h * ratio;
  }
  if (dir.includes("w")) x = start.x + start.w - w;
  if (dir.includes("n")) y = start.y + start.h - h;
  return { x, y, w, h };
}

function enforceBounds(start: Rect, r: Rect, dir: Dir, minW: number, minH: number, maxW: number | null, maxH: number | null): Rect {
  let { x, y, w, h } = r;
  if (w < minW) {
    if (dir.includes("w")) x = start.x + start.w - minW;
    w = minW;
  }
  if (h < minH) {
    if (dir.includes("n")) y = start.y + start.h - minH;
    h = minH;
  }
  if (maxW != null && w > maxW) {
    if (dir.includes("w")) x = start.x + start.w - maxW;
    w = maxW;
  }
  if (maxH != null && h > maxH) {
    if (dir.includes("n")) y = start.y + start.h - maxH;
    h = maxH;
  }
  return { x, y, w, h };
}

export function CanvasItem({ item }: { item: WidgetInstance }) {
  const elRef = useRef<HTMLDivElement>(null);
  const vp = viewport.value;
  const rect = instanceRect(item, vp);
  const isSelected = selectedId.value === item.id;

  const startMove = (e: PointerEvent) => {
    if (!editing.value || item.locked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    selectedId.value = item.id;

    const el = elRef.current;
    if (!el) return;
    const startRect = rect;
    let latest: Rect = startRect;

    runPointerGesture(el, e, {
      onFrame: (ev, { dx, dy }) => {
        let r: Rect = { ...startRect, x: startRect.x + dx, y: startRect.y + dy };
        let nextGuides: GuideLine[] = [];
        if (!ev.altKey) {
          const prefs = state.value.settings.editorPrefs;
          const snap = computeSnap(r, {
            threshold: prefs.snapThreshold,
            viewport: vp,
            others: otherRects(item.id),
            grid: prefs.grid,
          });
          r = { ...r, x: r.x + snap.dx, y: r.y + snap.dy };
          nextGuides = snap.guides;
        }
        const c = clampToViewport(r.x, r.y, r, vp);
        r = { ...r, x: c.x, y: c.y };
        latest = r;
        applyRect(el, r);
        guides.value = nextGuides;
      },
      onDone: () => {
        guides.value = [];
        if (latest.x !== startRect.x || latest.y !== startRect.y) {
          updateItemRect(item.id, latest);
        }
      },
    });
  };

  const startResize = (dir: Dir) => (e: PointerEvent) => {
    if (!editing.value || item.locked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    selectedId.value = item.id;

    const el = elRef.current;
    if (!el) return;
    const startRect = rect;
    const constraints = getItemConstraints(item.type);
    let latest: Rect = startRect;

    runPointerGesture(el, e, {
      onFrame: (ev, { dx, dy }) => {
        let r = resizeRect(startRect, dir, dx, dy);
        const aspectLocked = constraints.aspectLocked !== ev.shiftKey;
        if (aspectLocked) r = enforceAspect(startRect, r, dir);

        let nextGuides: GuideLine[] = [];
        if (!ev.altKey) {
          const prefs = state.value.settings.editorPrefs;
          const snap = computeSnap(r, {
            threshold: prefs.snapThreshold,
            viewport: vp,
            others: otherRects(item.id),
            grid: prefs.grid,
            active: AXIS_BY_DIR[dir],
          });
          if (dir.includes("e")) r.w += snap.dx;
          else if (dir.includes("w")) {
            r.x += snap.dx;
            r.w -= snap.dx;
          }
          if (dir.includes("s")) r.h += snap.dy;
          else if (dir.includes("n")) {
            r.y += snap.dy;
            r.h -= snap.dy;
          }
          nextGuides = snap.guides;
        }

        r = enforceBounds(startRect, r, dir, constraints.minW, constraints.minH, constraints.maxW, constraints.maxH);
        latest = r;
        applyRect(el, r);
        guides.value = nextGuides;
      },
      onDone: () => {
        guides.value = [];
        if (latest.w !== startRect.w || latest.h !== startRect.h || latest.x !== startRect.x || latest.y !== startRect.y) {
          updateItemRect(item.id, latest);
        }
      },
    });
  };

  return (
    <div
      ref={elRef}
      class="kt-item"
      data-item-id={item.id}
      data-widget-type={item.type}
      data-editing={editing.value ? "true" : "false"}
      data-selected={isSelected ? "true" : "false"}
      data-locked={item.locked ? "true" : "false"}
      style={{
        transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
        width: `${rect.w}px`,
        height: `${rect.h}px`,
        zIndex: item.z,
      }}
      onPointerDown={() => {
        if (!editing.value) return;
        selectedId.value = item.id;
      }}
      onContextMenu={(e) => {
        if (!editing.value) return;
        e.preventDefault();
        e.stopPropagation();
        openContextMenu(item.id, e.clientX, e.clientY);
      }}
    >
      <WidgetHost item={item} />

      {editing.value ? (
        <>
          <div class="kt-drag-layer" onPointerDown={startMove} data-testid="drag-layer" />
          {isSelected && !item.locked
            ? HANDLES.map((dir) => (
                <div
                  key={dir}
                  class={`kt-handle kt-handle-${dir}`}
                  data-handle={dir}
                  onPointerDown={startResize(dir)}
                />
              ))
            : null}
        </>
      ) : null}
    </div>
  );
}
