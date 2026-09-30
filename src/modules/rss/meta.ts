import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "rss",
  name: "RSS 订阅",
  description: "订阅 RSS / Atom 源，拉取最新条目（首次使用需授权订阅域名）",
  icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M6 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-3-6v3a9 9 0 0 1 9 9h3A12 12 0 0 0 3 11Zm0-6v3c8.3 0 15 6.7 15 15h3C18 8.9 11.1 2 3 2Z"/></svg>`,
  category: "信息",
  defaultSize: { w: 400, h: 320 },
  minSize: { w: 260, h: 160 },
  defaultProps: { feeds: "", limit: 12 },
  settingsSchema: [
    {
      key: "feeds",
      label: "订阅地址（逗号分隔，最多 5 个）",
      type: "text",
      placeholder: "https://example.com/feed.xml",
    },
    { key: "limit", label: "显示条数", type: "number", min: 3, max: 30, step: 1 },
  ],
  load: () => import("./index"),
} satisfies ModuleDefinition;
