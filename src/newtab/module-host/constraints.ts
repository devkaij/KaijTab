/** 元件尺寸约束：核心内置元件在此声明，模块元件由注册表提供（M5 接入）。 */

export interface ItemConstraints {
  minW: number;
  minH: number;
  maxW: number | null;
  maxH: number | null;
  aspectLocked: boolean;
}

const DEFAULTS: ItemConstraints = {
  minW: 80,
  minH: 56,
  maxW: null,
  maxH: null,
  aspectLocked: false,
};

const coreConstraints: Record<string, Partial<ItemConstraints>> = {
  "core:search": { minW: 280, minH: 44, maxW: 1200 },
  "core:shortcuts": { minW: 240, minH: 84 },
};

export function getItemConstraints(type: string): ItemConstraints {
  return { ...DEFAULTS, ...(coreConstraints[type] ?? {}) };
}
