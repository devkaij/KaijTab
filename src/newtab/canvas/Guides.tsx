import { guides } from "@/newtab/store";

/** 对齐参考线覆盖层：只画线，不拦截指针。 */
export function GuidesOverlay() {
  const lines = guides.value;
  if (lines.length === 0) return null;

  return (
    <svg class="kt-guides" aria-hidden="true">
      {lines.map((g, index) =>
        g.axis === "x" ? (
          <line
            key={index}
            x1={g.pos}
            y1={g.start}
            x2={g.pos}
            y2={g.end}
            class="kt-guide-line"
          />
        ) : (
          <line
            key={index}
            x1={g.start}
            y1={g.pos}
            x2={g.end}
            y2={g.pos}
            class="kt-guide-line"
          />
        ),
      )}
    </svg>
  );
}
