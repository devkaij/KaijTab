import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { WallpaperRecord } from "@/shared/types";
import {
  addWallpaperRecord,
  dropWallpaper,
  setCurrentWallpaper,
  state,
  updateSettings,
  wallpaperPanelOpen,
} from "@/newtab/store";
import {
  estimateUsage,
  findOrphans,
  readBlob,
  removeFile,
  splitPath,
  type StorageUsage,
} from "./opfs";
import {
  formatBytes,
  formatDuration,
  importWallpaperFile,
  isSupported,
  scanWallpaperEngineFolder,
} from "./importer";
import { useObjectUrl } from "./useObjectUrl";

interface ImportTask {
  fileName: string;
  written: number;
  total: number;
  phase: string;
}

function Thumb({ record }: { record: WallpaperRecord }) {
  const url = useObjectUrl(record.thumb);
  if (!url) return <div class="kt-wp-thumb kt-wp-thumb-empty" />;
  return <img class="kt-wp-thumb" src={url} alt="" loading="lazy" />;
}

async function downloadWallpaper(record: WallpaperRecord): Promise<void> {
  const { dir, name } = splitPath(record.file);
  const blob = await readBlob(dir, name);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const ext = record.file.slice(record.file.lastIndexOf("."));
  anchor.href = url;
  anchor.download = `${record.name}${ext}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function WallpaperPanel() {
  const open = wallpaperPanelOpen.value;
  const library = state.value.wallpaperLibrary;
  const current = state.value.wallpaperCurrent;
  const settings = state.value.settings;

  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [task, setTask] = useState<ImportTask | null>(null);
  const [queue, setQueue] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshUsage = useCallback(() => {
    void estimateUsage()
      .then(setUsage)
      .catch(() => setUsage(null));
  }, []);

  useEffect(() => {
    if (open) refreshUsage();
  }, [open, refreshUsage]);

  if (!open) return null;

  const importOne = async (
    file: File,
    source: "we" | "file",
    displayName?: string,
  ): Promise<void> => {
    try {
      const record = await importWallpaperFile(file, {
        source,
        displayName,
        onProgress: (p) => setTask({ fileName: p.fileName, written: p.written, total: p.total, phase: p.phase }),
      });
      addWallpaperRecord(record);
    } catch (error) {
      setErrors((prev) => [...prev, `${displayName ?? file.name}：${String((error as Error).message ?? error)}`]);
    }
  };

  const handleFiles = async (files: File[]): Promise<void> => {
    const usable = files.filter((f) => isSupported(f));
    const rejected = files.length - usable.length;
    if (rejected > 0) setErrors((prev) => [...prev, `${rejected} 个文件格式不支持，已跳过`]);
    setQueue(usable.length);
    for (const file of usable) {
      setQueue((q) => Math.max(0, q - 1));
      await importOne(file, "file");
    }
    setTask(null);
    refreshUsage();
  };

  const pickFolder = async (): Promise<void> => {
    const picker = (
      window as unknown as {
        showDirectoryPicker?: (options?: unknown) => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker;
    if (!picker) {
      setErrors((prev) => [...prev, "当前浏览器不支持目录选择（需要 Chromium 内核）"]);
      return;
    }
    try {
      const dir = await picker.call(window, { id: "kaijtab-we-workshop", mode: "read" });
      const scanned = await scanWallpaperEngineFolder(dir);
      if (scanned.length === 0) {
        setErrors((prev) => [...prev, "该目录下没有找到 .mp4 / .webm 视频壁纸"]);
        return;
      }
      setQueue(scanned.length);
      for (const item of scanned) {
        setQueue((q) => Math.max(0, q - 1));
        await importOne(item.file, "we", item.displayName);
      }
      setTask(null);
      refreshUsage();
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") {
        setErrors((prev) => [...prev, `目录读取失败：${String((error as Error).message ?? error)}`]);
      }
    }
  };

  const cleanupOrphans = async (): Promise<void> => {
    const orphans = await findOrphans(library);
    if (orphans.length === 0) {
      setNotice("没有发现孤儿文件");
      return;
    }
    if (!window.confirm(`发现 ${orphans.length} 个孤儿文件（索引中不存在），删除？`)) return;
    for (const path of orphans) {
      const { dir, name } = splitPath(path);
      await removeFile(dir, name);
    }
    setNotice(`已清理 ${orphans.length} 个孤儿文件`);
    refreshUsage();
  };

  const percent = task && task.total > 0 ? Math.round((task.written / task.total) * 100) : 0;

  return (
    <>
      <div class="kt-panel-backdrop" onPointerDown={() => (wallpaperPanelOpen.value = false)} />
      <aside class="kt-panel" data-testid="wallpaper-panel">
        <header class="kt-panel-head">
          <h3>壁纸</h3>
          <button class="kt-panel-close" onClick={() => (wallpaperPanelOpen.value = false)}>
            ✕
          </button>
        </header>

        <section class="kt-panel-section">
          <div class="kt-panel-actions">
            <button
              class="kt-btn kt-btn-primary"
              onClick={() => fileInputRef.current?.click()}
              data-testid="import-files"
            >
              导入文件
            </button>
            <button class="kt-btn" onClick={() => void pickFolder()} data-testid="import-folder">
              从壁纸引擎导入
            </button>
          </div>
          <p class="kt-panel-hint">
            支持 mp4 / webm 动态壁纸与常见图片。从壁纸引擎（Steam 创意工坊 431960 目录）导入时可批量识别视频壁纸。
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,image/*"
            style={{ display: "none" }}
            data-testid="file-input"
            onChange={(e) => {
              const files = Array.from((e.target as HTMLInputElement).files ?? []);
              (e.target as HTMLInputElement).value = "";
              void handleFiles(files);
            }}
          />
        </section>

        {task || queue > 0 ? (
          <section class="kt-panel-section">
            <div class="kt-progress">
              <div class="kt-progress-label">
                <span>{task ? `${task.fileName} · ${task.phase}` : "排队中"}</span>
                <span>{percent}%</span>
              </div>
              <div class="kt-progress-track">
                <div class="kt-progress-bar" style={{ width: `${percent}%` }} />
              </div>
              {queue > 0 ? <p class="kt-panel-hint">队列剩余 {queue} 个</p> : null}
            </div>
          </section>
        ) : null}

        {errors.length > 0 ? (
          <section class="kt-panel-section">
            <div class="kt-alert" data-testid="import-errors">
              {errors.map((message, index) => (
                <div key={index} class="kt-alert-row">
                  <span>{message}</span>
                  <button
                    class="kt-alert-close"
                    onClick={() => setErrors((prev) => prev.filter((_, i) => i !== index))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {notice ? (
          <section class="kt-panel-section">
            <div class="kt-alert" onClick={() => setNotice(null)}>{notice}</div>
          </section>
        ) : null}

        <section class="kt-panel-section kt-panel-grow">
          <h4>壁纸库</h4>
          <div class="kt-wp-grid">
            <button
              class={`kt-wp-card ${current == null ? "kt-wp-card-active" : ""}`}
              onClick={() => setCurrentWallpaper(null)}
              data-testid="wallpaper-default-card"
            >
              <div class="kt-wp-thumb kt-wp-thumb-default" />
              <span class="kt-wp-name">默认渐变</span>
            </button>
            {library.map((record) => (
              <div
                key={record.id}
                class={`kt-wp-card ${current === record.id ? "kt-wp-card-active" : ""}`}
                data-testid={`wp-card-${record.id}`}
              >
                <button class="kt-wp-apply" onClick={() => setCurrentWallpaper(record.id)}>
                  <Thumb record={record} />
                </button>
                <span class="kt-wp-name" title={record.name}>
                  {record.name}
                </span>
                <span class="kt-wp-meta">
                  {record.kind === "video" && record.duration ? `${formatDuration(record.duration)} · ` : ""}
                  {formatBytes(record.size)}
                </span>
                <div class="kt-wp-actions">
                  <button class="kt-wp-action" onClick={() => void downloadWallpaper(record)}>
                    导出
                  </button>
                  <button
                    class="kt-wp-action kt-wp-action-danger"
                    onClick={() => {
                      if (window.confirm(`删除壁纸「${record.name}」？文件会一并删除。`)) {
                        void dropWallpaper(record.id).then(refreshUsage);
                      }
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
          {library.length === 0 ? (
            <p class="kt-panel-hint">还没有导入壁纸。导入的动态壁纸会拷贝到扩展本地存储，不依赖原文件位置。</p>
          ) : null}
        </section>

        <section class="kt-panel-section">
          <h4>播放设置</h4>
          <label class="kt-check">
            <input
              type="checkbox"
              checked={settings.pauseWhenHidden}
              onChange={(e) =>
                updateSettings({ pauseWhenHidden: (e.target as HTMLInputElement).checked })
              }
            />
            <span>页面隐藏时暂停（省电）</span>
          </label>
          <label class="kt-check">
            <input
              type="checkbox"
              checked={settings.playOnlyWhenFocused}
              onChange={(e) =>
                updateSettings({ playOnlyWhenFocused: (e.target as HTMLInputElement).checked })
              }
            />
            <span>仅窗口聚焦时播放</span>
          </label>
          <label class="kt-check">
            <input
              type="checkbox"
              checked={settings.dimWallpaperInEditor}
              onChange={(e) =>
                updateSettings({ dimWallpaperInEditor: (e.target as HTMLInputElement).checked })
              }
            />
            <span>编辑布局时变暗</span>
          </label>
        </section>

        <footer class="kt-panel-foot">
          <span>
            {usage ? `占用 ${formatBytes(usage.usage)} / 配额 ${formatBytes(usage.quota)}` : "占用统计不可用"}
          </span>
          <button class="kt-btn" onClick={() => void cleanupOrphans()}>
            清理孤儿文件
          </button>
        </footer>
      </aside>
    </>
  );
}
