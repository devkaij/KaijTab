import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "countdown",
  name: "倒计时 / 纪念日",
  description: "距离目标日还有多少天，支持每年重复与「已经过去」模式",
  icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5v5.6l4.2 2.5-1 1.7L11 13.6V7h2Z"/></svg>`,
  category: "效率",
  defaultSize: { w: 300, h: 170 },
  minSize: { w: 200, h: 120 },
  defaultProps: {
    title: "元旦",
    date: "2027-01-01",
    mode: "until",
    repeatYearly: true,
  },
  settingsSchema: [
    { key: "title", label: "名称", type: "text", placeholder: "例如：结婚纪念日" },
    { key: "date", label: "日期", type: "date" },
    {
      key: "mode",
      label: "方向",
      type: "select",
      options: [
        { value: "until", label: "倒数（还有多少天）" },
        { value: "since", label: "累计（已经过去多少天）" },
      ],
    },
    { key: "repeatYearly", label: "每年重复", type: "boolean" },
  ],
  load: () => import("./index"),
} satisfies ModuleDefinition;
