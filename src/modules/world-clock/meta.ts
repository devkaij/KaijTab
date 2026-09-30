import type { ModuleDefinition } from "@/newtab/module-host/types";

export default {
  id: "world-clock",
  name: "世界时钟",
  description: "同时看几个城市/时区的时间（无需联网）",
  icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2c1.9 0 3.6.6 5 1.7l-5 5V4Zm-2 .3V12l-5 5A8 8 0 0 1 10 4.3Zm0 15.4A8 8 0 0 1 5.7 18l5-5v6.7Z" /></svg>`,
  category: "信息",
  defaultSize: { w: 380, h: 200 },
  minSize: { w: 260, h: 130 },
  defaultProps: {
    zones: "Asia/Shanghai, America/New_York, Europe/London",
    showSeconds: true,
    highlightLocal: true,
  },
  settingsSchema: [
    {
      key: "zones",
      label: "时区列表（IANA，逗号分隔）",
      type: "text",
      placeholder: "Asia/Shanghai, Europe/London, America/Los_Angeles",
    },
    { key: "showSeconds", label: "显示秒", type: "boolean" },
    { key: "highlightLocal", label: "高亮本机时区", type: "boolean" },
  ],
  load: () => import("./index"),
} satisfies ModuleDefinition;
