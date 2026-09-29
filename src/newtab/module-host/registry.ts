/** 模块注册表：meta 静态引入（轻量），组件走各模块自己的动态 import。 */
import type { ItemConstraints } from "./constraints";
import type { ModuleDefinition, ModuleMeta } from "./types";

const metaModules = import.meta.glob<{ default: ModuleDefinition }>("../../modules/*/meta.ts", {
  eager: true,
});

export const moduleRegistry: ModuleDefinition[] = Object.values(metaModules)
  .map((mod) => mod.default)
  .sort((a, b) => a.name.localeCompare(b.name, "zh"));

export function getModule(id: string): ModuleDefinition | null {
  return moduleRegistry.find((m) => m.id === id) ?? null;
}

export function moduleConstraints(meta: ModuleMeta): Partial<ItemConstraints> {
  const out: Partial<ItemConstraints> = { aspectLocked: meta.aspectLocked ?? false };
  if (meta.minSize) {
    out.minW = meta.minSize.w;
    out.minH = meta.minSize.h;
  }
  if (meta.maxSize) {
    out.maxW = meta.maxSize.w;
    out.maxH = meta.maxSize.h;
  }
  return out;
}
