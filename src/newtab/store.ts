/**
 * 新标签页的应用状态与动作层。
 * 约定：所有变更走 commit()，保证「压快照 → 不可变更新 → 保存」三件事不遗漏。
 */
import { computed, signal } from "@preact/signals";
import type { RootState, WidgetInstance } from "@/shared/types";
import { createDefaultState } from "@/shared/storage/defaults";
import { createAutoSaver, loadState } from "@/shared/storage/state";
import { newId } from "@/shared/utils/ids";
import { createHistory } from "./canvas/history";
import { instanceRect, toNormalized, type Rect, type Size } from "./canvas/geometry";
import type { GuideLine } from "./canvas/snapping";
import { removeWallpaperFiles } from "./core/wallpaper/opfs";
import { removeWebProject } from "./core/wallpaper/web";
import { nextFreePos } from "./core/shortcut-layout";
import { defaultSyncStore, isExtensionContext } from "@/shared/storage/kv";
import {
  applySyncSnapshot,
  packForSync,
  staleChunkKeys,
  SyncQuotaError,
  SYNC_META_KEY,
  toSyncSnapshot,
  unpackSync,
} from "@/shared/storage/sync";
import { toast } from "./ui/toast";

export const state = signal<RootState>(createDefaultState());
export const viewport = signal<Size>({
  w: typeof window !== "undefined" ? window.innerWidth : 1440,
  h: typeof window !== "undefined" ? window.innerHeight : 900,
});
export const editing = signal(false);
export const selectedId = signal<string | null>(null);
export const guides = signal<GuideLine[]>([]);
export const booted = signal(false);
export const canUndo = signal(false);
export const canRedo = signal(false);
export const contextMenu = signal<{ itemId: string; x: number; y: number } | null>(null);
/** 运行模式：扩展 / 纯网页（PWA） */
export const extensionMode = isExtensionContext();

export const selectedItem = computed(() =>
  state.value.layout.items.find((i) => i.id === selectedId.value) ?? null,
);

const history = createHistory<RootState>(50);
const saver = createAutoSaver(() => state.value);

let lastCommit = { key: "", at: 0 };

export interface CommitOptions {
  /** 同一 key 在 600ms 内的连续提交只记一次历史（如方向键微调） */
  key?: string;
  /** 显式跳过历史压栈 */
  skipHistory?: boolean;
  /** 跳过同步推送（模块私有数据等无需同步的写入） */
  skipSync?: boolean;
  /** 立即落盘（模块数据等耐久性敏感的写入），不走防抖 */
  flush?: boolean;
}

export function commit(mutate: (draft: RootState) => RootState, opts: CommitOptions = {}): void {
  const now = Date.now();
  const coalesce =
    opts.key != null && opts.key === lastCommit.key && now - lastCommit.at < 600;
  if (!opts.skipHistory && !coalesce) {
    history.push(state.value);
  }
  lastCommit = { key: opts.key ?? "", at: now };
  state.value = mutate(state.value);
  if (opts.flush) void saver.flush();
  else saver.save();
  if (!opts.skipSync) scheduleSyncPush();
  canUndo.value = history.canUndo();
  canRedo.value = history.canRedo();
}

export function undo(): void {
  const prev = history.undo(state.value);
  if (prev == null) return;
  state.value = prev;
  saver.save();
  selectedId.value = null;
  canUndo.value = history.canUndo();
  canRedo.value = history.canRedo();
}

export function redo(): void {
  const next = history.redo(state.value);
  if (next == null) return;
  state.value = next;
  saver.save();
  selectedId.value = null;
  canUndo.value = history.canUndo();
  canRedo.value = history.canRedo();
}

/** 其他元件的渲染矩形（吸附用） */
export function otherRects(excludeId: string): Rect[] {
  const vp = viewport.value;
  return state.value.layout.items
    .filter((i) => i.id !== excludeId)
    .map((i) => instanceRect(i, vp));
}

/** 删除指定的模块私有数据（元件消失时同步清理，避免残留垃圾数据） */
function pruneModuleData(
  data: Record<string, unknown>,
  items: Array<{ id: string; type: string }>,
): Record<string, unknown> {
  if (items.length === 0) return data;
  const stale = new Set(items.map((item) => `${item.type}:${item.id}`));
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const [key, value] of Object.entries(data)) {
    if (stale.has(key)) {
      changed = true;
      continue;
    }
    next[key] = value;
  }
  return changed ? next : data;
}

function withItems(s: RootState, items: WidgetInstance[]): RootState {
  return { ...s, layout: { ...s.layout, items } };
}

export function updateItemRect(id: string, rect: Rect, opts: CommitOptions = {}): void {
  const vp = viewport.value;
  const norm = toNormalized(rect.x, rect.y, vp);
  commit(
    (s) =>
      withItems(
        s,
        s.layout.items.map((i) =>
          i.id === id
            ? { ...i, x: norm.x, y: norm.y, w: Math.round(rect.w), h: Math.round(rect.h) }
            : i,
        ),
      ),
    opts,
  );
}

export function updateItemProps(id: string, patch: Record<string, unknown>): void {
  commit((s) =>
    withItems(
      s,
      s.layout.items.map((i) => (i.id === id ? { ...i, props: { ...i.props, ...patch } } : i)),
    ),
  );
}

export function addInstance(
  type: string,
  rect: Rect,
  props: Record<string, unknown> = {},
): string {
  const vp = viewport.value;
  const norm = toNormalized(rect.x, rect.y, vp);
  const id = newId("inst");
  const maxZ = state.value.layout.items.reduce((m, i) => Math.max(m, i.z), 0);
  commit((s) =>
    withItems(s, [
      ...s.layout.items,
      {
        id,
        type,
        x: norm.x,
        y: norm.y,
        w: Math.round(rect.w),
        h: Math.round(rect.h),
        z: maxZ + 1,
        props,
      },
    ]),
  );
  selectedId.value = id;
  return id;
}

export function removeInstance(id: string): void {
  const item = state.value.layout.items.find((i) => i.id === id);
  commit((s) => ({
    ...s,
    layout: { ...s.layout, items: s.layout.items.filter((i) => i.id !== id) },
    moduleData: item ? pruneModuleData(s.moduleData, [item]) : s.moduleData,
  }));
  if (selectedId.value === id) selectedId.value = null;
}

/** 删除某个类型的所有元件（停用模块时用），同时清理它们的私有数据 */
export function removeInstancesByType(type: string): void {
  const removed = state.value.layout.items.filter((i) => i.type === type);
  if (removed.length === 0) return;
  commit((s) => ({
    ...s,
    layout: { ...s.layout, items: s.layout.items.filter((i) => i.type !== type) },
    moduleData: pruneModuleData(s.moduleData, removed),
  }));
  if (removed.some((i) => i.id === selectedId.value)) selectedId.value = null;
}

export function duplicateInstance(id: string): string | null {
  const item = state.value.layout.items.find((i) => i.id === id);
  if (!item) return null;
  const vp = viewport.value;
  const rect = instanceRect(item, vp);
  const newItem: WidgetInstance = {
    ...item,
    id: newId("inst"),
    x: item.x,
    y: item.y,
    z: state.value.layout.items.reduce((m, i) => Math.max(m, i.z), 0) + 1,
    props: { ...item.props },
  };
  // 偏移一点，避免完全重叠
  const shifted = {
    ...newItem,
    ...(() => {
      const n = toNormalized(rect.x + 24, rect.y + 24, vp);
      return { x: n.x, y: n.y };
    })(),
  };
  commit((s) => withItems(s, [...s.layout.items, shifted]));
  selectedId.value = shifted.id;
  return shifted.id;
}

export function bringToFront(id: string): void {
  const maxZ = state.value.layout.items.reduce((m, i) => Math.max(m, i.z), 0);
  commit((s) => withItems(s, s.layout.items.map((i) => (i.id === id ? { ...i, z: maxZ + 1 } : i))));
}

export function sendToBack(id: string): void {
  const minZ = state.value.layout.items.reduce((m, i) => Math.min(m, i.z), 0);
  commit((s) => withItems(s, s.layout.items.map((i) => (i.id === id ? { ...i, z: minZ - 1 } : i))));
}

export function toggleLock(id: string): void {
  commit((s) => withItems(s, s.layout.items.map((i) => (i.id === id ? { ...i, locked: !i.locked } : i))));
}

/** 实例级玻璃效果覆盖 */
export function updateItemGlass(id: string, glass: WidgetInstance["glass"]): void {
  commit((s) => withItems(s, s.layout.items.map((i) => (i.id === id ? { ...i, glass } : i))));
}

/* ---------- 快捷方式 ---------- */

export const shortcutEditor = signal<{
  id: string | null;
  title: string;
  url: string;
  icon?: string;
} | null>(null);

export function normalizeShortcutUrl(url: string): string {
  const trimmed = url.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** 快捷方式新增/编辑时，若导航已进入自由摆放模式，新图标自动落到下方一行 */
export function saveShortcut(input: {
  id: string | null;
  title: string;
  url: string;
  icon?: string;
}): void {
  const url = normalizeShortcutUrl(input.url);
  const title = input.title.trim() || url;
  const icon = input.icon?.trim() ? input.icon.trim() : undefined;
  if (input.id) {
    commit((s) => ({
      ...s,
      shortcuts: {
        ...s.shortcuts,
        items: s.shortcuts.items.map((i) =>
          i.id === input.id ? { ...i, title, url, icon } : i,
        ),
      },
    }));
  } else {
    const groupId = s0GroupId();
    const pos = nextFreePos(state.value.shortcuts.items);
    commit((s) => ({
      ...s,
      shortcuts: {
        ...s.shortcuts,
        items: [...s.shortcuts.items, { id: newId("sc"), groupId, title, url, icon, ...(pos ? { pos } : {}) }],
      },
    }));
  }
}

function s0GroupId(): string {
  return state.value.shortcuts.groups[0]?.id ?? "grp_default";
}

export function removeShortcut(id: string): void {
  commit((s) => ({
    ...s,
    shortcuts: { ...s.shortcuts, items: s.shortcuts.items.filter((i) => i.id !== id) },
  }));
}

/* ---------- 网站导航图标摆放 ---------- */

/** 正在"排列图标"的网站导航元件实例 id */
export const arrangingShortcuts = signal<string | null>(null);

export function setShortcutPositions(
  updates: Array<{ id: string; pos: { x: number; y: number } }>,
): void {
  if (updates.length === 0) return;
  const map = new Map(updates.map((u) => [u.id, u.pos]));
  commit((s) => ({
    ...s,
    shortcuts: {
      ...s.shortcuts,
      items: s.shortcuts.items.map((i) => {
        const pos = map.get(i.id);
        return pos ? { ...i, pos } : i;
      }),
    },
  }));
}

export function setShortcutPos(id: string, pos: { x: number; y: number }): void {
  setShortcutPositions([{ id, pos }]);
}

/** 恢复自动网格排列 */
export function clearShortcutPositions(): void {
  commit((s) => ({
    ...s,
    shortcuts: {
      ...s.shortcuts,
      items: s.shortcuts.items.map((item) => {
        if (item.pos == null) return item;
        const next = { ...item };
        delete next.pos;
        return next;
      }),
    },
  }));
}

/* ---------- 壁纸 ---------- */

export const wallpaperPanelOpen = signal(false);

/* ---------- 模块 ---------- */

export const moduleCenterOpen = signal(false);
/** 全局设置面板 */
export const settingsPanelOpen = signal(false);
/** 正在打开设置弹窗的模块实例（右键菜单进入） */
export const moduleSettingsFor = signal<WidgetInstance | null>(null);

export function updateSettings(patch: Partial<import("@/shared/types").SettingsState>): void {
  commit((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function addWallpaperRecord(record: import("@/shared/types").WallpaperRecord): void {
  commit((s) => ({
    ...s,
    wallpaperLibrary: [...s.wallpaperLibrary, record],
    wallpaperCurrent: record.id,
  }));
}

export function setCurrentWallpaper(id: string | null): void {
  commit((s) => ({ ...s, wallpaperCurrent: id }));
}

export async function dropWallpaper(id: string): Promise<void> {
  const record = state.value.wallpaperLibrary.find((w) => w.id === id);
  if (!record) return;
  if (record.kind === "web") {
    await removeWebProject(record.id);
    await removeWallpaperFiles(record);
  } else {
    await removeWallpaperFiles(record);
  }
  commit((s) => ({
    ...s,
    wallpaperLibrary: s.wallpaperLibrary.filter((w) => w.id !== id),
    wallpaperCurrent: s.wallpaperCurrent === id ? null : s.wallpaperCurrent,
  }));
}

export function setEditing(value: boolean): void {
  editing.value = value;
  if (!value) selectedId.value = null;
  if (value) {
    // 首次进入编辑态记录设计基准
    const s = state.value;
    if (s.layout.base.w === 0) {
      commit(
        (d) => ({ ...d, layout: { ...d.layout, base: { w: viewport.value.w, h: viewport.value.h } } }),
        { skipHistory: true },
      );
    }
  }
}

export function nudgeSelected(dx: number, dy: number): void {
  const item = selectedItem.value;
  if (!item || item.locked) return;
  const vp = viewport.value;
  const rect = instanceRect(item, vp);
  updateItemRect(item.id, { ...rect, x: rect.x + dx, y: rect.y + dy }, { key: "nudge" });
}

/** 首次运行播种：搜索框 + 快捷方式居中排布（按当前视口自适应，手机上也能直接看） */
export function seedDefaultLayout(): void {
  const s = state.value;
  if (s.layout.items.length > 0 || s.layout.base.w > 0) return;

  const vp = viewport.value;
  const wide = vp.w >= 720;
  const searchW = Math.min(560, Math.round(vp.w * (wide ? 0.4 : 0.9)));
  const searchH = wide ? 56 : 48;
  const shortcutsW = Math.min(760, Math.round(vp.w * (wide ? 0.55 : 0.94)));
  const shortcutsH = wide ? 180 : 150;
  const top = wide ? 140 : 84;

  const items: WidgetInstance[] = [
    {
      id: newId("inst"),
      type: "core:search",
      x: (vp.w - searchW) / 2 / vp.w,
      y: top / vp.h,
      w: searchW,
      h: searchH,
      z: 1,
      props: {},
    },
    {
      id: newId("inst"),
      type: "core:shortcuts",
      x: (vp.w - shortcutsW) / 2 / vp.w,
      y: (top + searchH + (wide ? 64 : 36)) / vp.h,
      w: shortcutsW,
      h: shortcutsH,
      z: 2,
      props: {},
    },
  ];

  commit((d) => withItems({ ...d, layout: { base: { w: vp.w, h: vp.h }, items } }, items), {
    skipHistory: true,
  });
}

/* ---------- 浏览器账号同步 ---------- */

export const syncEnabled = signal(false);

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** 变更后延迟推送，避免高频写入触发 sync 写配额。 */
export function scheduleSyncPush(): void {
  if (!syncEnabled.value) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushToSync();
  }, 800);
}

export async function pushToSync(): Promise<void> {
  const store = defaultSyncStore();
  try {
    const packed = packForSync(toSyncSnapshot(state.value));
    const existing = await store.get(null);
    const prevRaw = existing[SYNC_META_KEY];
    let prevChunks = 0;
    if (typeof prevRaw === "string") {
      try {
        prevChunks = (JSON.parse(prevRaw) as { chunks?: number }).chunks ?? 0;
      } catch {
        prevChunks = 0;
      }
    }
    const stale = staleChunkKeys(prevChunks, packed.meta.chunks);
    if (stale.length > 0) await store.remove(stale);
    await store.set(packed.items);
  } catch (error) {
    if (error instanceof SyncQuotaError) {
      syncEnabled.value = false;
      commit((s) => ({ ...s, settings: { ...s.settings, syncEnabled: false } }), {
        skipHistory: true,
      });
      toast(`同步已自动关闭：数据 ${Math.round(error.bytes / 1024)}KB 超出浏览器同步配额。本地数据不受影响。`);
    } else {
      toast(`同步失败：${String((error as Error).message ?? error)}`);
    }
  }
}

export async function setSyncEnabled(enabled: boolean): Promise<void> {
  if (!isExtensionContext()) {
    toast("网页模式下没有账号同步通道（用扩展版可用）");
    return;
  }
  syncEnabled.value = enabled;
  commit((s) => ({ ...s, settings: { ...s.settings, syncEnabled: enabled } }), {
    skipHistory: true,
  });

  const store = defaultSyncStore();
  if (enabled) {
    await pushToSync();
    if (syncEnabled.value) {
      toast("已开启账号同步：布局 / 快捷方式 / 设置跨设备同步，壁纸与模块私有数据只存本地");
    }
  } else {
    try {
      const keys = Object.keys(await store.get(null)).filter((k) => k.startsWith("sync:"));
      if (keys.length > 0) await store.remove(keys);
      toast("已关闭账号同步，云端副本已清除");
    } catch (error) {
      toast(`清理云端副本失败：${String((error as Error).message ?? error)}`);
    }
  }
}

/* ---------- 启动 ---------- */

export async function bootstrap(): Promise<void> {
  const { state: loaded, migratedFrom } = await loadState();
  state.value = loaded;
  if (migratedFrom != null) {
    toast(`数据已从 v${migratedFrom} 迁移到 v${loaded.schemaVersion}`);
  }

  // 浏览器账号同步：存在云端快照则以云端为准（壁纸与私有数据仍用本地）
  if (isExtensionContext()) {
    try {
      const snapshot = unpackSync(await defaultSyncStore().get(null));
      if (snapshot) {
        state.value = applySyncSnapshot(state.value, snapshot);
        await saver.flush();
      }
    } catch {
      // 同步不可用不影响本地使用
    }
  }
  syncEnabled.value = isExtensionContext() && state.value.settings.syncEnabled === true;

  seedDefaultLayout();
  booted.value = true;

  window.addEventListener("resize", () => {
    viewport.value = { w: window.innerWidth, h: window.innerHeight };
  });

  // 关闭/刷新前尽力把未落盘的变更写出去
  window.addEventListener("pagehide", () => {
    void saver.flush();
  });
}
