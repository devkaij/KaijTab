import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "quote",
  name: "每日一句",
  description: "内置诗词与格言，按日期轮换（周四有彩蛋）",
  icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7 6c-2.2 0-4 1.9-4 4.2 0 2.2 1.7 3.8 3.8 3.8.3 0 .6 0 .9-.1-.4 2.3-2.2 4-4.2 4.6l.6 1.5c3.9-1.1 6.9-4.4 6.9-8.9V10c0-2.4-1.7-4-4-4Zm10 0c-2.2 0-4 1.9-4 4.2 0 2.2 1.7 3.8 3.8 3.8.3 0 .6 0 .9-.1-.4 2.3-2.2 4-4.2 4.6l.6 1.5c3.9-1.1 6.9-4.4 6.9-8.9V10c0-2.4-1.7-4-4-4Z"/></svg>`,
  category: "信息",
  defaultSize: { w: 400, h: 170 },
  minSize: { w: 260, h: 110 },
  defaultProps: { mode: "daily", showSource: true },
  settingsSchema: [
    {
      key: "mode",
      label: "轮换方式",
      type: "select",
      options: [
        { value: "daily", label: "每天固定一条（按日期）" },
        { value: "random", label: "每次打开随机" },
      ],
    },
    { key: "showSource", label: "显示出处", type: "boolean" },
  ],
  load: () => import("./index"),
} satisfies ModuleDefinition;
