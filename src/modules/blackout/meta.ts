import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "blackout",
  name: "熄屏模式",
  description: "一键全屏纯黑，网页层面能压到的最低亮度（OLED 友好）",
  icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M13 3a9 9 0 1 0 8.5 12.3 7 7 0 0 1-8.9-8.9A9 9 0 0 0 13 3Zm-3.4 3.6a9 9 0 0 0 7.8 7.8 7 7 0 1 1-7.8-7.8Z"/></svg>`,
  category: "工具",
  defaultSize: { w: 300, h: 190 },
  minSize: { w: 200, h: 120 },
  defaultProps: { showClock: false, keepAwake: true },
  settingsSchema: [
    { key: "showClock", label: "角落显示极暗时钟", type: "boolean" },
    { key: "keepAwake", label: "保持屏幕常亮（避免系统休眠）", type: "boolean" },
  ],
  load: () => import("./index"),
} satisfies ModuleDefinition;
