import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "todo",
  name: "待办清单",
  description: "勾选完成、随手增删，数据只存本地",
  icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M4 4h16v3H4V4Zm0 6h16v3H4v-3Zm0 6h16v3H4v-3Z"/></svg>`,
  category: "效率",
  defaultSize: { w: 320, h: 260 },
  minSize: { w: 220, h: 140 },
  defaultProps: { showDone: true, hideProgress: false },
  settingsSchema: [
    { key: "showDone", label: "显示已完成项", type: "boolean" },
    { key: "hideProgress", label: "隐藏完成进度", type: "boolean" },
  ],
  load: () => import("./index"),
} satisfies ModuleDefinition;
