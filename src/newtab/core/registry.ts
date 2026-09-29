/** 核心内置元件注册表：随核心一起打包，不走模块的按需加载体系。 */
import type { ComponentType } from "preact";
import { Search } from "./Search";
import { Shortcuts } from "./Shortcuts";

export interface CoreWidgetProps {
  instanceId: string;
  props: Record<string, unknown>;
}

export interface CoreWidget {
  type: string;
  component: ComponentType<CoreWidgetProps>;
}

export const coreWidgets: Record<string, CoreWidget> = {
  "core:search": { type: "core:search", component: Search },
  "core:shortcuts": { type: "core:shortcuts", component: Shortcuts },
};
