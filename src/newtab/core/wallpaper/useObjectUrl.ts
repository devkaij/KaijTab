import { useEffect, useState } from "preact/hooks";
import { readBlob, splitPath } from "./opfs";

/** 把 OPFS 路径转成会话内有效的 object URL；路径变化即回收旧 URL。 */
export function useObjectUrl(path: string | null | undefined, enabled = true): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setUrl(null);
    if (!path || !enabled) return;

    void (async () => {
      try {
        const { dir, name } = splitPath(path);
        const blob = await readBlob(dir, name);
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      } catch {
        // 文件缺失：静默降级
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [path, enabled]);

  return url;
}
