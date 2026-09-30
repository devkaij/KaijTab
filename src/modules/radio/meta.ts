import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "radio",
  name: "在线电台",
  description: "按标签挑电台直接播放（radio-browser 公开目录，无需 key）",
  icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3 10h18v10H3V10Zm2-3.3 11.6-3.1.5 1.9L10 7h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2Zm2.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7-2.5a3.5 3.5 0 0 0-3.5 3.5h1.8a1.7 1.7 0 0 1 1.7-1.7v-1.8Zm0-3a6.5 6.5 0 0 0-6.5 6.5h1.8a4.7 4.7 0 0 1 4.7-4.7v-1.8Z"/></svg>`,
  category: "媒体",
  defaultSize: { w: 380, h: 260 },
  minSize: { w: 260, h: 150 },
  defaultProps: { tag: "jazz", limit: 12, volume: 0.6 },
  settingsSchema: [
    {
      key: "tag",
      label: "电台类型",
      type: "select",
      options: [
        { value: "jazz", label: "爵士" },
        { value: "classical", label: "古典" },
        { value: "piano", label: "钢琴" },
        { value: "electronic", label: "电子" },
        { value: "lofi", label: "Lo-Fi" },
        { value: "rock", label: "摇滚" },
        { value: "news", label: "新闻" },
        { value: "chinese", label: "中文" },
      ],
    },
    { key: "limit", label: "显示条数", type: "number", min: 3, max: 30, step: 1 },
    { key: "volume", label: "音量（0~1）", type: "number", min: 0, max: 1, step: 0.1 },
  ],
  load: () => import("./index"),
} satisfies ModuleDefinition;
