/** 网页壁纸（WE 的 web / application 类工程）：工程导入、虚拟文件服务、渲染入口。 */

export const WEB_ROOT = "web";
export const WEB_MAX_FILES = 2000;
export const WEB_MAX_BYTES = 300 * 1024 * 1024;

export interface WebEntry {
  file: File;
  /** 相对工程根目录的路径，形如 assets/tex.png */
  path: string;
}

/** 从 <input webkitdirectory> 的文件列表构造工程条目（去掉最外层文件夹名） */
export function entriesFromFileList(files: File[]): WebEntry[] {
  return files.map((file) => {
    const relative =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = relative.split("/").filter(Boolean);
    return {
      file,
      path: parts.length > 1 ? parts.slice(1).join("/") : (parts[0] ?? file.name),
    };
  });
}

/** 找出入口 HTML */
export function findWebEntry(entries: WebEntry[]): string | null {
  for (const name of ["index.html", "index.htm"]) {
    const hit = entries.find((entry) => entry.path.toLowerCase() === name);
    if (hit) return hit.path;
  }
  return entries.find((entry) => /\.html?$/i.test(entry.path))?.path ?? null;
}

/** WE 工程自带的预览图（用作缩略图） */
export function findPreview(entries: WebEntry[]): WebEntry | null {
  return entries.find((entry) => /^preview\.(jpe?g|png|gif|webp)$/i.test(entry.path)) ?? null;
}

/** 递归枚举一个目录（工坊目录扫描用） */
export async function collectDirectoryEntries(
  dir: FileSystemDirectoryHandle,
  depth = 0,
): Promise<WebEntry[]> {
  const out: WebEntry[] = [];
  const iterator = dir as unknown as AsyncIterable<[string, FileSystemHandle]>;
  for await (const [name, handle] of iterator) {
    if (handle.kind === "file") {
      const file = await (handle as FileSystemFileHandle).getFile();
      out.push({ file, path: name });
    } else if (depth < 6) {
      const sub = await collectDirectoryEntries(handle as FileSystemDirectoryHandle, depth + 1);
      for (const entry of sub) out.push({ ...entry, path: `${name}/${entry.path}` });
    }
  }
  return out;
}

async function resolveDir(
  root: FileSystemDirectoryHandle,
  segments: string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create });
  }
  return dir;
}

/** 把工程写进 OPFS：web/<id>/… */
export async function writeWebProject(
  id: string,
  entries: WebEntry[],
  onProgress?: (written: number, total: number) => void,
): Promise<{ fileCount: number; bytes: number }> {
  const root = await navigator.storage.getDirectory();
  const webDir = await root.getDirectoryHandle(WEB_ROOT, { create: true });
  const projectDir = await webDir.getDirectoryHandle(id, { create: true });

  let written = 0;
  const total = entries.reduce((sum, entry) => sum + entry.file.size, 0);

  for (const entry of entries) {
    const segments = entry.path.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    const fileName = segments[segments.length - 1]!;
    const dir = await resolveDir(projectDir, segments.slice(0, -1), true);
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    const reader = entry.file.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      written += value.byteLength;
      onProgress?.(written, total);
    }
    await writable.close();
  }

  return { fileCount: entries.length, bytes: total };
}

export async function readWebFile(id: string, path: string): Promise<File | null> {
  try {
    const root = await navigator.storage.getDirectory();
    let dir = await root.getDirectoryHandle(WEB_ROOT);
    dir = await dir.getDirectoryHandle(id);
    const segments = path.split("/").filter(Boolean);
    for (const segment of segments.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(segment);
    }
    const handle = await dir.getFileHandle(segments[segments.length - 1]!);
    return await handle.getFile();
  } catch {
    return null;
  }
}

export async function removeWebProject(id: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const webDir = await root.getDirectoryHandle(WEB_ROOT);
    await webDir.removeEntry(id, { recursive: true });
  } catch {
    // 目录不存在时忽略
  }
}

/** 校验工程：入口存在且体积/文件数在限制内 */
export function validateWebProject(entries: WebEntry[]): { entry: string } | { error: string } {
  if (entries.length === 0) return { error: "文件夹是空的" };
  if (entries.length > WEB_MAX_FILES) {
    return { error: `文件数 ${entries.length} 超过上限 ${WEB_MAX_FILES}` };
  }
  const bytes = entries.reduce((sum, entry) => sum + entry.file.size, 0);
  if (bytes > WEB_MAX_BYTES) {
    return { error: `工程体积 ${(bytes / 1024 / 1024).toFixed(0)}MB 超过上限 300MB` };
  }
  const entry = findWebEntry(entries);
  if (!entry) return { error: "工程里找不到入口 HTML（index.html）" };
  return { entry };
}

const JS_SCRIPT_TYPES = new Set([
  "",
  "module",
  "text/javascript",
  "application/javascript",
  "text/ecmascript",
  "application/ecmascript",
]);

/**
 * 把入口 HTML 里的内联脚本外置成文件。
 * 原因：MV3 扩展页面的 CSP 为 script-src 'self'，内联脚本一律被拦截；
 * 外置成工程内的 .js 文件后即可正常执行（虚拟文件服务会按相对路径提供）。
 */
export async function externalizeInlineScripts(
  entries: WebEntry[],
  entryPath: string,
): Promise<{ entries: WebEntry[]; extracted: number }> {
  const index = entries.findIndex((entry) => entry.path === entryPath);
  const entry = index >= 0 ? entries[index] : undefined;
  if (!entry) return { entries, extracted: 0 };

  const html = await entry.file.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const scripts = Array.from(doc.querySelectorAll("script"));

  let extracted = 0;
  const extra: WebEntry[] = [];

  for (const script of scripts) {
    if (script.getAttribute("src")) continue;
    const rawType = (script.getAttribute("type") ?? "").toLowerCase().trim();
    if (!JS_SCRIPT_TYPES.has(rawType)) continue; // 例如 type="x-shader" 的数据块保持原样
    const code = script.textContent ?? "";
    if (code.trim() === "") continue;

    extracted += 1;
    const path = `__inline/script-${extracted}.js`;
    extra.push({
      file: new File([code], `script-${extracted}.js`, { type: "text/javascript" }),
      path,
    });
    script.setAttribute("src", `./${path}`);
    if (rawType === "module") script.setAttribute("type", "module");
    else script.removeAttribute("type");
    script.textContent = "";
  }

  if (extracted === 0) return { entries, extracted: 0 };

  const rewritten: WebEntry = {
    file: new File([`<!doctype html>\n${doc.documentElement.outerHTML}`], entry.file.name, {
      type: "text/html",
    }),
    path: entry.path,
  };
  const next = [...entries];
  next[index] = rewritten;
  return { entries: [...next, ...extra], extracted };
}

/* ---------- 虚拟文件服务 ---------- */

let registration: Promise<boolean> | null = null;

export function registerWhost(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return Promise.resolve(false);
  if (!registration) {
    registration = navigator.serviceWorker
      .register(chrome.runtime.getURL("whost-sw.js"), {
        scope: chrome.runtime.getURL("whost/"),
        type: "module",
      })
      .then(async () => {
        await navigator.serviceWorker.ready;
        return true;
      })
      .catch(() => false);
  }
  return registration;
}

export function webWallpaperUrl(id: string, entry = "index.html"): string {
  return `${chrome.runtime.getURL("whost/")}${id}/${entry}`;
}
