/** KaijTab 全局类型定义。schema 结构变更时必须同步提升 SCHEMA_VERSION 并补迁移。 */

export const SCHEMA_VERSION = 1;

export type SearchEngine = "bing" | "baidu" | "google";

export interface WidgetInstance {
  /** 实例 id，形如 inst_xxx */
  id: string;
  /** 模块 id */
  type: string;
  /** 归一化坐标 0~1，相对视口 */
  x: number;
  y: number;
  /** 像素尺寸 */
  w: number;
  h: number;
  /** 叠放层级，越大越靠上 */
  z: number;
  locked?: boolean;
  /** 实例级配置 */
  props: Record<string, unknown>;
}

export interface LayoutState {
  /** 首次编辑时记录的基准视口，仅用于新元件默认落点与未来迁移 */
  base: { w: number; h: number };
  items: WidgetInstance[];
}

export interface ShortcutGroup {
  id: string;
  name: string;
}

export interface Shortcut {
  id: string;
  groupId: string;
  title: string;
  url: string;
  /** 自定义图标（data URL 或 OPFS 路径），缺省走 favicon 链 */
  icon?: string;
}

export interface ShortcutsState {
  groups: ShortcutGroup[];
  items: Shortcut[];
}

export interface ModulesState {
  /** 模块中心里"我的模块"，即已启用列表 */
  enabled: string[];
  /** 模块级设置（如未来的 API key），键为模块 id */
  settings: Record<string, unknown>;
}

export type WallpaperKind = "video" | "image";

export interface WallpaperRecord {
  id: string;
  kind: WallpaperKind;
  name: string;
  /** OPFS 路径，形如 wallpapers/wp_xxx.webm */
  file: string;
  /** OPFS 缩略图路径 */
  thumb: string;
  /** 字节数 */
  size: number;
  /** 秒，仅视频 */
  duration?: number;
  addedAt: number;
  source: "we" | "file";
}

export interface SettingsState {
  searchEngine: SearchEngine;
  /** 页面隐藏时暂停动态壁纸 */
  pauseWhenHidden: boolean;
  /** 仅窗口聚焦时播放动态壁纸 */
  playOnlyWhenFocused: boolean;
  /** 编辑态壁纸变暗 */
  dimWallpaperInEditor: boolean;
  /** 启用浏览器账号同步（仅同步小配置，壁纸永不上云） */
  syncEnabled: boolean;
  editorPrefs: {
    /** 网格吸附步长 px，null 为关闭 */
    grid: number | null;
    /** 吸附阈值 px */
    snapThreshold: number;
  };
}

export interface RootState {
  schemaVersion: number;
  layout: LayoutState;
  shortcuts: ShortcutsState;
  modules: ModulesState;
  /** 模块私有数据，键为 `模块id:实例id`，默认不同步 */
  moduleData: Record<string, unknown>;
  wallpaperLibrary: WallpaperRecord[];
  /** 当前壁纸 id */
  wallpaperCurrent: string | null;
  settings: SettingsState;
}

/** 参与浏览器账号同步的部分（壁纸与私有数据永远只存本地） */
export interface SyncableSnapshot {
  layout: LayoutState;
  shortcuts: ShortcutsState;
  modules: ModulesState;
  settings: SettingsState;
}
