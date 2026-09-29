import { useState } from "preact/hooks";
import {
  addInstance,
  commit,
  moduleCenterOpen,
  state,
  viewport,
} from "@/newtab/store";
import { clampToViewport, instanceRect, rectsIntersect, type Rect } from "@/newtab/canvas/geometry";
import { getModule, moduleRegistry } from "./registry";

/** 螺旋探测第一个不压住已有元件的落点。 */
function findSpot(w: number, h: number): Rect {
  const vp = viewport.value;
  const others = state.value.layout.items.map((i) => instanceRect(i, vp));
  const baseX = vp.w / 2 - w / 2;
  const baseY = vp.h / 2 - h / 2;
  const step = 40;

  for (let ring = 0; ring <= 24; ring++) {
    for (let rx = -ring; rx <= ring; rx++) {
      for (let ry = -ring; ry <= ring; ry++) {
        if (Math.max(Math.abs(rx), Math.abs(ry)) !== ring) continue;
        const preferred = { x: baseX + rx * step, y: baseY + ry * step, w, h };
        const clamped = clampToViewport(preferred.x, preferred.y, preferred, vp, 12);
        const candidate: Rect = { ...preferred, x: clamped.x, y: clamped.y };
        if (!others.some((other) => rectsIntersect(candidate, other, 8))) return candidate;
      }
    }
  }

  const fallback = clampToViewport(baseX, baseY, { w, h }, vp, 12);
  return { x: fallback.x, y: fallback.y, w, h };
}

function setEnabled(id: string, enabled: boolean): void {
  commit((s) => ({
    ...s,
    modules: {
      ...s.modules,
      enabled: enabled
        ? Array.from(new Set([...s.modules.enabled, id]))
        : s.modules.enabled.filter((m) => m !== id),
    },
  }));
}

function addToCanvas(id: string): void {
  const definition = getModule(id);
  if (!definition) return;
  if (!state.value.modules.enabled.includes(id)) setEnabled(id, true);
  const { w, h } = definition.defaultSize;
  const spot = findSpot(w, h);
  addInstance(id, spot, { ...definition.defaultProps });
  moduleCenterOpen.value = false;
}

function ModuleCard({ id, enabled }: { id: string; enabled: boolean }) {
  const definition = getModule(id);
  const [busy, setBusy] = useState(false);

  if (!definition) return null;

  const instanceCount = state.value.layout.items.filter((i) => i.type === id).length;

  return (
    <div class="kt-mod-card" data-testid={`module-card-${id}`}>
      <div class="kt-mod-icon" dangerouslySetInnerHTML={{ __html: definition.icon }} />
      <div class="kt-mod-info">
        <div class="kt-mod-name">
          {definition.name}
          <span class="kt-mod-size">
            {definition.defaultSize.w}×{definition.defaultSize.h}
          </span>
        </div>
        {definition.description ? <div class="kt-mod-desc">{definition.description}</div> : null}
      </div>
      <div class="kt-mod-actions">
        <button
          class="kt-btn kt-btn-primary"
          onClick={() => addToCanvas(id)}
          data-testid={`module-add-${id}`}
        >
          添加
        </button>
        <button
          class="kt-btn"
          disabled={busy}
          onClick={() => {
            if (enabled && instanceCount > 0) {
              if (
                !window.confirm(
                  `停用「${definition.name}」会删除画布上的 ${instanceCount} 个实例，继续？`,
                )
              ) {
                return;
              }
              setBusy(true);
              commit((s) => ({
                ...s,
                layout: { ...s.layout, items: s.layout.items.filter((i) => i.type !== id) },
                modules: {
                  ...s.modules,
                  enabled: s.modules.enabled.filter((m) => m !== id),
                },
              }));
              setBusy(false);
            } else {
              setEnabled(id, !enabled);
            }
          }}
          data-testid={`module-toggle-${id}`}
        >
          {enabled ? "停用" : "启用"}
        </button>
      </div>
    </div>
  );
}

export function ModuleCenter() {
  if (!moduleCenterOpen.value) return null;

  const enabled = state.value.modules.enabled;
  const myModules = moduleRegistry.filter((m) => enabled.includes(m.id));
  const available = moduleRegistry.filter((m) => !enabled.includes(m.id));

  return (
    <>
      <div class="kt-panel-backdrop" onPointerDown={() => (moduleCenterOpen.value = false)} />
      <aside class="kt-panel" data-testid="module-center">
        <header class="kt-panel-head">
          <h3>模块中心</h3>
          <button class="kt-panel-close" onClick={() => (moduleCenterOpen.value = false)}>
            ✕
          </button>
        </header>

        <section class="kt-panel-section">
          <h4>我的模块</h4>
          {myModules.length === 0 ? (
            <p class="kt-panel-hint">还没有启用任何模块。从下方列表里挑一个开始。</p>
          ) : (
            myModules.map((m) => <ModuleCard key={m.id} id={m.id} enabled />)
          )}
        </section>

        <section class="kt-panel-section">
          <h4>可用模块</h4>
          {available.length === 0 ? (
            <p class="kt-panel-hint">所有模块都已启用。</p>
          ) : (
            available.map((m) => <ModuleCard key={m.id} id={m.id} enabled={false} />)
          )}
        </section>
      </aside>
    </>
  );
}
