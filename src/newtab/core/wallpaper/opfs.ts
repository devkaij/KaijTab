/** OPFS 文件操作：壁纸视频与缩略图的读写删。 */
import type { WallpaperRecord } from "@/shared/types";

export const WALLPAPER_DIR = "wallpapers";
export const THUMB_DIR = "thumbs";

export interface StorageUsage {
  usage: number;
  quota: number;
}

export async function estimateUsage(): Promise<StorageUsage> {
  const est = await navigator.storage.estimate();
  return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
}

async function dir(name: string, create = true): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(name, { create });
}

export async function writeBlob(
  dirName: string,
  fileName: string,
  blob: Blob,
  onProgress?: (written: number, total: number) => void,
): Promise<number> {
  const d = await dir(dirName);
  const handle = await d.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  const reader = blob.stream().getReader();
  let written = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      written += value.byteLength;
      onProgress?.(written, blob.size);
    }
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    await d.removeEntry(fileName).catch(() => undefined);
    throw error;
  }
  return written;
}

export async function readBlob(dirName: string, fileName: string): Promise<Blob> {
  const d = await dir(dirName);
  const handle = await d.getFileHandle(fileName);
  return handle.getFile();
}

export async function removeFile(dirName: string, fileName: string): Promise<void> {
  const d = await dir(dirName);
  await d.removeEntry(fileName).catch(() => undefined);
}

export async function exists(dirName: string, fileName: string): Promise<boolean> {
  try {
    const d = await dir(dirName);
    await d.getFileHandle(fileName);
    return true;
  } catch {
    return false;
  }
}

export async function listFiles(dirName: string): Promise<string[]> {
  const d = await dir(dirName);
  const names: string[] = [];
  for await (const [name, handle] of (d as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
    if (handle.kind === "file") names.push(name);
  }
  return names;
}

/** 从记录里的 OPFS 路径（形如 wallpapers/wp_x.webm）拆出目录与文件名。 */
export function splitPath(path: string): { dir: string; name: string } {
  const index = path.lastIndexOf("/");
  if (index < 0) return { dir: WALLPAPER_DIR, name: path };
  return { dir: path.slice(0, index), name: path.slice(index + 1) };
}

export function removeWallpaperFiles(record: WallpaperRecord): Promise<void[]> {
  const file = splitPath(record.file);
  const thumb = splitPath(record.thumb);
  return Promise.all([removeFile(file.dir, file.name), removeFile(thumb.dir, thumb.name)]);
}

/** 孤儿文件检测：OPFS 里存在但索引中没有的文件。 */
export async function findOrphans(records: WallpaperRecord[]): Promise<string[]> {
  const known = new Set(records.map((r) => splitPath(r.file).name));
  const knownThumbs = new Set(records.map((r) => splitPath(r.thumb).name));
  const [files, thumbs] = await Promise.all([listFiles(WALLPAPER_DIR), listFiles(THUMB_DIR)]);
  return [
    ...files.filter((f) => !known.has(f)).map((f) => `${WALLPAPER_DIR}/${f}`),
    ...thumbs.filter((f) => !knownThumbs.has(f)).map((f) => `${THUMB_DIR}/${f}`),
  ];
}
