import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "ai-recommend",
  name: "AI 推荐",
  description: "接入你自己的 OpenAI 兼容接口，按近期浏览习惯推荐想打开的链接",
  icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2Zm6 12l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1 1-2.6ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/></svg>`,
  category: "信息",
  defaultSize: { w: 420, h: 280 },
  minSize: { w: 300, h: 200 },
  defaultProps: { count: 5 },
  settingsSchema: [
    { key: "count", label: "推荐数量", type: "number", min: 1, max: 8, step: 1 },
  ],
  load: () => import("./index"),
} satisfies ModuleDefinition;
