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
  saver.save();
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
  commit((s) => withItems(s, s.layout.items.filter((i) => i.id !== id)));
  if (selectedId.value === id) selectedId.value = null;
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

/* ---------- 快捷方式 ---------- */

export const shortcutEditor = signal<{ id: string | null; title: string; url: string } | null>(null);

export function normalizeShortcutUrl(url: string): string {
  const trimmed = url.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function saveShortcut(input: { id: string | null; title: string; url: string }): void {
  const url = normalizeShortcutUrl(input.url);
  const title = input.title.trim() || url;
  if (input.id) {
    commit((s) => ({
      ...s,
      shortcuts: {
        ...s.shortcuts,
        items: s.shortcuts.items.map((i) => (i.id === input.id ? { ...i, title, url } : i)),
      },
    }));
  } else {
    const groupId = s0GroupId();
    commit((s) => ({
      ...s,
      shortcuts: {
        ...s.shortcuts,
        items: [...s.shortcuts.items, { id: newId("sc"), groupId, title, url }],
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

/* ---------- 壁纸 ---------- */

export const wallpaperPanelOpen = signal(false);

/* ---------- 模块 ---------- */

export const moduleCenterOpen = signal(false);
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
  await removeWallpaperFiles(record);
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

/** 首次运行播种：搜索框 + 快捷方式居中排布 */
export function seedDefaultLayout(): void {
  const s = state.value;
  if (s.layout.items.length > 0 || s.layout.base.w > 0) return;
  const vw = 1440;
  const vh = 900;
  const searchW = 560;
  const searchH = 56;
  const scW = 760;
  const scH = 180;
  const items: WidgetInstance[] = [
    {
      id: newId("inst"),
      type: "core:search",
      x: (vw - searchW) / 2 / vw,
      y: 140 / vh,
      w: searchW,
      h: searchH,
      z: 1,
      props: {},
    },
    {
      id: newId("inst"),
      type: "core:shortcuts",
      x: (vw - scW) / 2 / vw,
      y: 260 / vh,
      w: scW,
      h: scH,
      z: 2,
      props: {},
    },
  ];
  commit((d) => withItems({ ...d, layout: { base: { w: vw, h: vh }, items } }, items), {
    skipHistory: true,
  });
}

export async function bootstrap(): Promise<void> {
  const { state: loaded } = await loadState();
  state.value = loaded;
  seedDefaultLayout();
  booted.value = true;

  window.addEventListener("resize", () => {
    viewport.value = { w: window.innerWidth, h: window.innerHeight };
  });
}
