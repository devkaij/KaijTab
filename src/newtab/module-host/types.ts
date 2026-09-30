/** 模块契约：模块只依赖本文件的类型，不依赖宿主实现。 */
import type { ComponentType } from "preact";

export interface Size {
  w: number;
  h: number;
}

export type FieldSchema =
  | {
      key: string;
      label: string;
      type: "boolean";
      help?: string;
    }
  | {
      key: string;
      label: string;
      type: "number";
      min?: number;
      max?: number;
      step?: number;
      help?: string;
    }
  | {
      key: string;
      label: string;
      type: "text";
      placeholder?: string;
      help?: string;
    }
  | {
      key: string;
      label: string;
      type: "date";
      help?: string;
    }
  | {
      key: string;
      label: string;
      type: "select";
      options: Array<{ value: string; label: string }>;
      help?: string;
    };

export interface ModuleMeta {
  id: string;
  name: string;
  description?: string;
  /** 内联 SVG 字符串 */
  icon: string;
  category?: string;
  defaultSize: Size;
  minSize?: Size;
  maxSize?: Size;
  aspectLocked?: boolean;
  defaultProps: Record<string, unknown>;
  /** 实例级配置面板的字段定义 */
  settingsSchema?: FieldSchema[];
}

export interface ModuleProps<P = Record<string, unknown>> {
  instanceId: string;
  props: P;
  updateProps: (patch: Partial<P>) => void;
  runtime: ModuleRuntime;
}

export interface ModuleDefinition<P = Record<string, unknown>> extends ModuleMeta {
  /** 动态 import 组件 chunk；只有画布上存在实例时才会调用 */
  load: () => Promise<{ default: ComponentType<ModuleProps<P>> }>;
}

export interface ModuleRuntime {
  /** 按 模块id:实例id 命名空间的私有数据（默认只存本地、不同步） */
  data: {
    get<T>(key: string): T | null;
    set(key: string, value: unknown): void;
    remove(key: string): void;
  };
  /** 页面可见性 */
  visibility: {
    visible(): boolean;
    onChange(callback: (visible: boolean) => void): () => void;
  };
  /** 主题令牌（CSS 变量） */
  theme: {
    getVar(name: string): string;
    /** 模块根元素上应使用的 class，保证模块只消费主题变量 */
    rootClass: string;
  };
  /** 宿主提供的只读应用数据（模块无需直接访问 chrome.*） */
  app: {
    shortcuts(): Array<{ title: string; url: string }>;
  };
  /** 模块级设置（跨实例共享） */
  settings: {
    get<T extends Record<string, unknown>>(): T;
    set(patch: Record<string, unknown>): void;
  };
  /**
   * 模块级敏感数据（API Key、令牌等）：
   * 只写本地存储，**永不参与账号同步**。
   */
  secrets: {
    get<T>(key: string): T | null;
    set(key: string, value: unknown): void;
    remove(key: string): void;
  };
}
