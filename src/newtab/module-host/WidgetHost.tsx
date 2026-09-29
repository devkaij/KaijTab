import type { WidgetInstance } from "@/shared/types";
import { coreWidgets } from "@/newtab/core/registry";

/** 元件渲染分发：核心内置 → 直出；模块 → M5 接入注册表；未知 → 缺失卡片。 */
export function WidgetHost({ item }: { item: WidgetInstance }) {
  const core = coreWidgets[item.type];
  if (core) {
    const Component = core.component;
    return (
      <div class="kt-widget" data-widget-type={item.type}>
        <Component instanceId={item.id} props={item.props} />
      </div>
    );
  }
  return (
    <div class="kt-widget kt-widget-missing" data-widget-type={item.type}>
      <span>未知元件</span>
      <code>{item.type}</code>
    </div>
  );
}
