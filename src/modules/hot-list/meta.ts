import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "hot-list",
  name: "今日热榜",
  description: "百度 / 头条 / B站 / 掘金 / GitHub 趋势，点一条直接跳转",
  icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M4 20h16v-2H4v2Zm1-4h3V7H5v9Zm5 0h3V4h-3v12Zm5 0h3v-6h-3v6Z"/></svg>`,
  category: "信息",
  defaultSize: { w: 380, h: 330 },
  minSize: { w: 260, h: 180 },
  defaultProps: { source: "baidu", limit: 10, showRank: true },
  settingsSchema: [
    {
      key: "source",
      label: "数据源",
      type: "select",
      options: [
        { value: "baidu", label: "百度热搜" },
        { value: "toutiao", label: "今日头条" },
        { value: "bilibili", label: "B站热搜" },
        { value: "juejin", label: "掘金" },
        { value: "github", label: "GitHub 趋势（近 7 天）" },
      ],
    },
    { key: "limit", label: "显示条数", type: "number", min: 3, max: 20, step: 1 },
    { key: "showRank", label: "显示排名", type: "boolean" },
  ],
  load: () => import("./index"),
} satisfies ModuleDefinition;
