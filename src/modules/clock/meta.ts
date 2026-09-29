import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "clock",
  name: "时钟",
  description: "本地时间与日期，支持秒显示与 12/24 小时制",
  icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 11h4v-2h-3V7h-2v6h1Z"/></svg>`,
  category: "效率",
  defaultSize: { w: 320, h: 140 },
  minSize: { w: 200, h: 96 },
  defaultProps: { showSeconds: true, showDate: true, hour12: false },
  settingsSchema: [
    { key: "showSeconds", label: "显示秒", type: "boolean" },
    { key: "showDate", label: "显示日期", type: "boolean" },
    { key: "hour12", label: "12 小时制", type: "boolean" },
  ],
  load: () => import("./index"),
} satisfies ModuleDefinition;
