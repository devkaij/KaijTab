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
  THUMB_DIR,
  writeBlob,
  type StorageUsage,
} from "./opfs";
import {
  formatBytes,
  formatDuration,
  importWallpaperFile,
  isSupported,
  makePlaceholderThumb,
  makeThumbnail,
  scanWallpaperEngineFolder,
} from "./importer";
import {
  collectDirectoryEntries,
  entriesFromFileList,
  externalizeInlineScripts,
  findPreview,
  validateWebProject,
  WEB_ROOT,
  writeWebProject,
  type WebEntry,
} from "./web";
import { newId } from "@/shared/utils/ids";
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
  const webInputRef = useRef<HTMLInputElement>(null);

  const refreshUsage = useCallback(() => {
    void estimateUsage()
      .then(setUsage)
      .catch(() => setUsage(null));
  }, []);

  useEffect(() => {
    if (!open) return;
    refreshUsage();
    // 通过属性打开目录选择（JSX 里写非标准属性会被类型系统拦下）
    const input = webInputRef.current as (HTMLInputElement & { webkitdirectory: boolean }) | null;
    if (input) input.webkitdirectory = true;
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

  /** 网页壁纸（WE 的 web / application 工程）导入 */
  const importWeb = async (
    entries: WebEntry[],
    displayName: string,
    source: "we" | "file",
    onProgressStep?: (written: number, total: number) => void,
  ): Promise<void> => {
    try {
      const validated = validateWebProject(entries);
      if ("error" in validated) throw new Error(validated.error);

      // 内联脚本外置：绕开扩展 CSP 对 inline script 的限制
      const prepared = await externalizeInlineScripts(entries, validated.entry);
      if (prepared.extracted > 0) {
        setNotice(`已把 ${prepared.extracted} 段内联脚本外置为文件（扩展 CSP 不允许内联脚本）`);
      }

      const id = newId("wp");
      setTask({ fileName: displayName, written: 0, total: 1, phase: "copying" });
      const { fileCount, bytes } = await writeWebProject(id, prepared.entries, (written, total) => {
        setTask({ fileName: displayName, written, total, phase: "copying" });
        onProgressStep?.(written, total);
      });

      setTask({ fileName: displayName, written: bytes, total: bytes, phase: "thumbnail" });
      const preview = findPreview(prepared.entries);
      const thumb = preview
        ? await makeThumbnail(preview.file, "image")
        : await makePlaceholderThumb(displayName);
      await writeBlob(THUMB_DIR, `${id}.jpg`, thumb);

      addWallpaperRecord({
        id,
        kind: "web",
        name: displayName,
        file: `${WEB_ROOT}/${id}`,
        thumb: `${THUMB_DIR}/${id}.jpg`,
        size: bytes,
        entry: validated.entry,
        fileCount,
        addedAt: Date.now(),
        source,
      });
    } catch (error) {
      setErrors((prev) => [
        ...prev,
        `${displayName}：${String((error as Error).message ?? error)}`,
      ]);
    }
  };

  const handleWebFiles = async (files: File[]): Promise<void> => {
    const entries = entriesFromFileList(files);
    const topName =
      (files[0] as File & { webkitRelativePath?: string })?.webkitRelativePath?.split("/")[0] ??
      "网页壁纸";
    await importWeb(entries, topName, "file");
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
        setErrors((prev) => [...prev, "该目录下没有找到可识别的壁纸（视频 / 图片 / 网页工程）"]);
        return;
      }
      setQueue(scanned.length);
      for (const item of scanned) {
        setQueue((q) => Math.max(0, q - 1));
        if (item.kind === "web" && item.dir) {
          const entries = await collectDirectoryEntries(item.dir);
          await importWeb(entries, item.displayName, "we");
        } else if (item.file) {
          await importOne(item.file, "we", item.displayName);
        }
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
            <button
              class="kt-btn"
              onClick={() => webInputRef.current?.click()}
              data-testid="import-web"
              title="选择含 index.html 的网页壁纸工程文件夹"
            >
              导入网页壁纸
            </button>
          </div>
          <p class="kt-panel-hint">
            支持 mp4 / webm / mov / mkv / gif / svg 等视频与图片（能不能解码交给浏览器判断）；
            网页壁纸请选择工程文件夹（含 index.html）。从壁纸引擎（Steam 创意工坊 431960
            目录）导入时可批量识别，社区工程里依赖 WE 专有接口的部分可能显示不完整。
          </p>
          <input
            ref={webInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            data-testid="web-file-input"
            onChange={(e) => {
              const files = Array.from((e.target as HTMLInputElement).files ?? []);
              (e.target as HTMLInputElement).value = "";
              if (files.length === 0) return;
              void handleWebFiles(files);
            }}
          />
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
