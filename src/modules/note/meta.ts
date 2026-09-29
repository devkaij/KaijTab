import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "note",
  name: "便签",
  description: "随手记录，自动保存到本地",
  icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M5 3h11l3 3v15H5V3Zm2 4v2h8V7H7Zm0 5v2h10v-2H7Zm0 5v2h10v-2H7Z"/></svg>`,
  category: "效率",
  defaultSize: { w: 320, h: 220 },
  minSize: { w: 180, h: 120 },
  defaultProps: { fontSize: 14, align: "left" },
  settingsSchema: [
    { key: "fontSize", label: "字号（px）", type: "number", min: 12, max: 28, step: 1 },
    {
      key: "align",
      label: "对齐",
      type: "select",
      options: [
        { value: "left", label: "左对齐" },
        { value: "center", label: "居中" },
      ],
    },
  ],
  load: () => import("./index"),
} satisfies ModuleDefinition;
