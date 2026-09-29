import type { WidgetInstance } from "@/shared/types";
import { coreWidgets } from "@/newtab/core/registry";
import { ModuleHost } from "./ModuleHost";
import { getModule } from "./registry";

/** 元件渲染分发：核心内置 → 直出；模块 → 按需加载；未知 → 缺失卡片。 */
export function WidgetHost({ item }: { item: WidgetInstance }) {
  const core = coreWidgets[item.type];
  if (core) {
    const Component = core.component;
    return (
      <div class="kt-widget">
        <Component instanceId={item.id} props={item.props} />
      </div>
    );
  }

  const definition = getModule(item.type);
  if (definition) {
    return (
      <div class="kt-widget">
        <ModuleHost moduleId={definition.id} instanceId={item.id} props={item.props} />
      </div>
    );
  }

  return (
    <div class="kt-widget kt-widget-missing" data-testid="missing-widget">
      <span>未知元件</span>
      <code>{item.type}</code>
    </div>
  );
}
