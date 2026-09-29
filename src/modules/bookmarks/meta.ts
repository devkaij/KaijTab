import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "bookmarks",
  name: "浏览器书签",
  description: "展示书签栏/其他书签，支持逐层进入文件夹",
  icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M6 2h12v20l-6-4.5L6 22V2Z"/></svg>`,
  category: "效率",
  defaultSize: { w: 420, h: 220 },
  minSize: { w: 260, h: 130 },
  defaultProps: { source: "toolbar", showIcons: true },
  settingsSchema: [
    {
      key: "source",
      label: "来源",
      type: "select",
      options: [
        { value: "toolbar", label: "书签栏" },
        { value: "other", label: "其他书签" },
        { value: "mobile", label: "移动设备书签" },
      ],
    },
    { key: "showIcons", label: "显示网站图标", type: "boolean" },
  ],
  load: () => import("./index"),
} satisfies ModuleDefinition;
