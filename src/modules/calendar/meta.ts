import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "calendar",
  name: "日历订阅",
  description: "订阅公开的 ICS 日历（如节假日、课程表），展示近期事件",
  icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm12 8v9H5v-9h14Zm-9 2v2H8v-2h2Zm4 0v2h-2v-2h2Zm-4 3v2H8v-2h2Z"/></svg>`,
  category: "信息",
  defaultSize: { w: 400, h: 300 },
  minSize: { w: 260, h: 150 },
  defaultProps: { url: "", days: 7, limit: 8 },
  settingsSchema: [
    { key: "url", label: "ICS 地址", type: "text", placeholder: "https://example.com/calendar.ics" },
    { key: "days", label: "向后看几天", type: "number", min: 1, max: 30, step: 1 },
    { key: "limit", label: "显示条数", type: "number", min: 3, max: 20, step: 1 },
  ],
  load: () => import("./index"),
} satisfies ModuleDefinition;
