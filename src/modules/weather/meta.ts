import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "weather",
  name: "天气",
  description: "当前温度与今日高低温（Open-Meteo，免费无需 key）",
  icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M6 19a4 4 0 0 1-.4-7.98A6 6 0 0 1 17.3 9.1 3.8 3.8 0 0 1 17 19H6Zm6-13a1 1 0 0 1 1 1v1.2a6.1 6.1 0 0 0-2 0V7a1 1 0 0 1 1-1ZM5.5 8.9l.85.85a6.2 6.2 0 0 0-1.4 1.4l-.85-.85A1 1 0 0 1 5.5 8.9Zm13 0a1 1 0 0 1 1.4 1.4l-.85.85a6.2 6.2 0 0 0-1.4-1.4l.85-.85Z"/></svg>`,
  category: "信息",
  defaultSize: { w: 320, h: 180 },
  minSize: { w: 220, h: 130 },
  defaultProps: { city: "北京", showDetails: true },
  settingsSchema: [
    { key: "city", label: "城市", type: "text", placeholder: "例如：杭州 / Tokyo" },
    { key: "showDetails", label: "显示体感/湿度/风", type: "boolean" },
  ],
  load: () => import("./index"),
} satisfies ModuleDefinition;
