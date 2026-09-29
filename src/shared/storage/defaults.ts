import { SCHEMA_VERSION, type RootState } from "../types";

export function createDefaultState(): RootState {
  return {
    schemaVersion: SCHEMA_VERSION,
    layout: {
      base: { w: 0, h: 0 },
      items: [],
    },
    shortcuts: {
      groups: [{ id: "grp_default", name: "默认" }],
      items: [
        { id: "sc_baidu", groupId: "grp_default", title: "百度", url: "https://www.baidu.com" },
        {
          id: "sc_bilibili",
          groupId: "grp_default",
          title: "哔哩哔哩",
          url: "https://www.bilibili.com",
        },
        { id: "sc_zhihu", groupId: "grp_default", title: "知乎", url: "https://www.zhihu.com" },
        { id: "sc_weibo", groupId: "grp_default", title: "微博", url: "https://weibo.com" },
        { id: "sc_github", groupId: "grp_default", title: "GitHub", url: "https://github.com" },
      ],
    },
    modules: {
      enabled: [],
      settings: {},
    },
    moduleData: {},
    wallpaperLibrary: [],
    wallpaperCurrent: null,
    settings: {
      searchEngine: "bing",
      pauseWhenHidden: true,
      playOnlyWhenFocused: false,
      dimWallpaperInEditor: true,
      syncEnabled: false,
      editorPrefs: {
        grid: null,
        snapThreshold: 6,
      },
    },
  };
}

/**
 * 用默认值补齐缺失字段：
 * - 顶层字段缺失 → 用默认值
 * - settings / editorPrefs 做一层深合并
 * - 多余字段保留（向前兼容，不丢用户数据）
 */
export function mergeDefaults(stored: Partial<RootState> | null | undefined): RootState {
  const defaults = createDefaultState();
  if (!stored) return defaults;

  const merged: RootState = {
    ...defaults,
    ...stored,
    layout: {
      ...defaults.layout,
      ...(stored.layout ?? {}),
      items: stored.layout?.items ?? defaults.layout.items,
      base: stored.layout?.base ?? defaults.layout.base,
    },
    shortcuts: {
      ...defaults.shortcuts,
      ...(stored.shortcuts ?? {}),
    },
    modules: {
      ...defaults.modules,
      ...(stored.modules ?? {}),
    },
    moduleData: stored.moduleData ?? defaults.moduleData,
    wallpaperLibrary: stored.wallpaperLibrary ?? defaults.wallpaperLibrary,
    settings: {
      ...defaults.settings,
      ...(stored.settings ?? {}),
      editorPrefs: {
        ...defaults.settings.editorPrefs,
        ...(stored.settings?.editorPrefs ?? {}),
      },
    },
  };

  return merged;
}
