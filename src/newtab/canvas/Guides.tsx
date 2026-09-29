import type { GuideLine } from "@/newtab/canvas/snapping";

/** 对齐参考线覆盖层：只画线，不拦截指针。lines 为空或未提供时不渲染。 */
export function GuidesOverlay({ lines }: { lines: GuideLine[] }) {
  if (lines.length === 0) return null;

  return (
    <svg class="kt-guides" aria-hidden="true">
      {lines.map((g, index) =>
        g.axis === "x" ? (
          <line key={index} x1={g.pos} y1={g.start} x2={g.pos} y2={g.end} class="kt-guide-line" />
        ) : (
          <line key={index} x1={g.start} y1={g.pos} x2={g.end} y2={g.pos} class="kt-guide-line" />
        ),
      )}
    </svg>
  );
}
