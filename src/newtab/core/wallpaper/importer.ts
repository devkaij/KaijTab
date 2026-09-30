/** 壁纸导入流水线：校验 → 流式拷贝进 OPFS → 生成缩略图 → 产出索引记录。 */
import type { WallpaperKind, WallpaperRecord } from "@/shared/types";
import { newId } from "@/shared/utils/ids";
import { THUMB_DIR, WALLPAPER_DIR, estimateUsage, removeFile, writeBlob } from "./opfs";

export const WARN_SIZE = 300 * 1024 * 1024;
export const REFUSE_SIZE = 500 * 1024 * 1024;

/** 视频/图片扩展名（放宽清单：能不能播交给浏览器探测，不再只认白名单） */
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|mkv|avi|ogv|ogg|mpg|mpeg|m2ts|ts|flv|wmv|3gp)$/i;
const IMAGE_EXT = /\.(png|jpe?g|jfif|webp|gif|avif|svg|bmp|ico|heic|heif)$/i;

export interface ImportProgress {
  fileName: string;
  written: number;
  total: number;
  phase: "checking" | "copying" | "thumbnail" | "done";
}

export interface VideoMeta {
  duration: number;
  width: number;
  height: number;
}

export interface ImportOptions {
  source: "we" | "file";
  displayName?: string;
  onProgress?: (progress: ImportProgress) => void;
}

export function kindOf(file: { name: string; type: string }): WallpaperKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return IMAGE_EXT.test(file.name) ? "image" : "video";
}

export function isSupported(file: { name: string; type: string }): boolean {
  return (
    VIDEO_EXT.test(file.name) ||
    IMAGE_EXT.test(file.name) ||
    file.type.startsWith("video/") ||
    file.type.startsWith("image/")
  );
}

/** 用 video 元素探测可播性与元数据；不可播则抛错。 */
export function probeVideo(blob: Blob): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("视频元数据读取超时"));
    }, 15000);

    video.onloadedmetadata = () => {
      clearTimeout(timer);
      const meta: VideoMeta = {
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      cleanup();
      if (meta.width === 0 || meta.height === 0) {
        reject(new Error("视频无法解码（编码不受支持）"));
      } else {
        resolve(meta);
      }
    };
    video.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error("视频无法播放（编码或容器不受支持）"));
    };
    video.src = url;
  });
}

/** 抽首帧生成 JPEG 缩略图。 */
export async function makeThumbnail(blob: Blob, kind: WallpaperKind, atSecond = 0.1): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    if (kind === "image") {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("图片无法解码"));
        img.src = url;
      });
      // SVG 等矢量图可能没有固有尺寸，回退到 16:9 默认值
      return drawToJpeg(img, img.naturalWidth || 480, img.naturalHeight || 270);
    }

    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("视频无法解码"));
      video.src = url;
    });
    if (Number.isFinite(video.duration) && video.duration > atSecond) {
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = atSecond;
        // 某些视频 seek 不触发事件时兜底
        setTimeout(() => resolve(), 1500);
      });
    }
    return drawToJpeg(video, video.videoWidth, video.videoHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxWidth = 480,
): Promise<Blob> {
  const scale = Math.min(1, maxWidth / Math.max(1, width));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(width * scale));
  canvas.height = Math.max(2, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 上下文不可用");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("缩略图生成失败"))),
      "image/jpeg",
      0.72,
    );
  });
}

/** 配额预检：需要 file.size 的 1.3 倍余量。 */
export async function assertQuota(fileSize: number): Promise<void> {
  const { usage, quota } = await estimateUsage();
  if (quota === 0) return;
  const needed = Math.round(fileSize * 1.3);
  if (quota - usage < needed) {
    const freeMb = ((quota - usage) / 1024 / 1024).toFixed(0);
    throw new Error(`存储空间不足：剩余约 ${freeMb}MB，本次需要约 ${(needed / 1024 / 1024).toFixed(0)}MB`);
  }
}

/** 导入单个文件（视频或图片）。 */
export async function importWallpaperFile(
  file: File,
  options: ImportOptions,
): Promise<WallpaperRecord> {
  const { source, onProgress } = options;
  const name = options.displayName ?? file.name;
  const kind = kindOf(file);

  onProgress?.({ fileName: name, written: 0, total: file.size, phase: "checking" });

  if (file.size > REFUSE_SIZE) {
    throw new Error(`文件超过 500MB（${(file.size / 1024 / 1024).toFixed(0)}MB），建议放弃导入`);
  }

  let duration: number | undefined;
  if (kind === "video") {
    const meta = await probeVideo(file);
    duration = meta.duration;
  }

  await assertQuota(file.size);

  const id = newId("wp");
  const extension = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? (kind === "video" ? "mp4" : "jpg")).toLowerCase();
  const filePath = `${WALLPAPER_DIR}/${id}.${extension}`;
  const thumbPath = `${THUMB_DIR}/${id}.jpg`;

  onProgress?.({ fileName: name, written: 0, total: file.size, phase: "copying" });
  await writeBlob(WALLPAPER_DIR, `${id}.${extension}`, file, (written, total) =>
    onProgress?.({ fileName: name, written, total, phase: "copying" }),
  );

  try {
    onProgress?.({ fileName: name, written: file.size, total: file.size, phase: "thumbnail" });
    const thumb = await makeThumbnail(file, kind);
    await writeBlob(THUMB_DIR, `${id}.jpg`, thumb);
  } catch (error) {
    // 缩略图失败不阻断导入，但记录需要缩略图存在；清理后抛错让用户重试
    await removeFile(WALLPAPER_DIR, `${id}.${extension}`);
    throw error;
  }

  const record: WallpaperRecord = {
    id,
    kind,
    name,
    file: filePath,
    thumb: thumbPath,
    size: file.size,
    duration,
    addedAt: Date.now(),
    source,
  };

  onProgress?.({ fileName: name, written: file.size, total: file.size, phase: "done" });
  return record;
}

export interface FolderScanResult {
  displayName: string;
  kind: "video" | "image" | "web";
  /** 视频/图片壁纸的文件 */
  file?: File;
  /** 网页壁纸的工程目录 */
  dir?: FileSystemDirectoryHandle;
}

async function readProjectJson(
  dir: FileSystemDirectoryHandle,
): Promise<{ title?: string; type?: string } | null> {
  try {
    const handle = await dir.getFileHandle("project.json");
    const text = await (await handle.getFile()).text();
    return JSON.parse(text) as { title?: string; type?: string };
  } catch {
    return null;
  }
}

async function hasIndexHtml(dir: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await dir.getFileHandle("index.html");
    return true;
  } catch {
    try {
      await dir.getFileHandle("index.htm");
      return true;
    } catch {
      return false;
    }
  }
}

/** 判断一个目录是不是单个壁纸（视频/图片/网页工程） */
async function inspectWallpaperDir(
  dir: FileSystemDirectoryHandle,
  fallbackName: string,
): Promise<FolderScanResult | null> {
  const project = await readProjectJson(dir);
  const title = project?.title?.trim() || fallbackName;
  const type = project?.type?.toLowerCase() ?? "";

  const isWeb = type === "web" || type === "application" || (await hasIndexHtml(dir));
  if (isWeb && (await hasIndexHtml(dir))) {
    return { displayName: title, kind: "web", dir };
  }

  const iterator = dir as unknown as AsyncIterable<[string, FileSystemHandle]>;
  for await (const [fileName, handle] of iterator) {
    if (handle.kind !== "file") continue;
    if (!VIDEO_EXT.test(fileName) && !IMAGE_EXT.test(fileName)) continue;
    const file = await (handle as FileSystemFileHandle).getFile();
    return { displayName: title, kind: kindOf(file), file };
  }

  return isWeb ? { displayName: title, kind: "web", dir } : null;
}

/**
 * 扫描 Wallpaper Engine 目录（支持两种选法）：
 * - 直接选中单个壁纸目录（含 project.json / index.html / 视频文件）
 * - 选中工坊根目录（431960），逐个识别其中的壁纸
 */
export async function scanWallpaperEngineFolder(
  root: FileSystemDirectoryHandle,
  limit = 200,
): Promise<FolderScanResult[]> {
  const single = await inspectWallpaperDir(root, root.name);
  if (single) return [single];

  const results: FolderScanResult[] = [];
  const iterator = root as unknown as AsyncIterable<[string, FileSystemHandle]>;
  for await (const [name, handle] of iterator) {
    if (handle.kind !== "directory") continue;
    const leaf = await inspectWallpaperDir(handle as FileSystemDirectoryHandle, name);
    if (leaf) results.push(leaf);
    if (results.length >= limit) break;
  }
  return results;
}

/** 网页壁纸没有自带预览图时的占位缩略图 */
export function makePlaceholderThumb(label: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 270;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 上下文不可用");
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#1c2c47");
  gradient.addColorStop(1, "#0d1117");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "600 22px 'Segoe UI', 'Microsoft YaHei UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = label.length > 16 ? `${label.slice(0, 15)}…` : label;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("占位缩略图生成失败"))),
      "image/jpeg",
      0.8,
    );
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
