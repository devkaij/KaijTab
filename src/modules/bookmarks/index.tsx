import { useEffect, useState } from "preact/hooks";
import type { ModuleProps } from "@/newtab/module-host/types";
import { IconProbe } from "@/shared/ui/IconProbe";
import "./bookmarks.css";

const ROOT_IDS: Record<string, string> = {
  toolbar: "1",
  other: "2",
  mobile: "3",
};

export default function Bookmarks({ props }: ModuleProps) {
  const source =
    typeof props.source === "string" && ROOT_IDS[props.source] ? props.source : "toolbar";
  const showIcons = props.showIcons !== false;

  const [stack, setStack] = useState<Array<{ id: string; title: string }>>([]);
  const [nodes, setNodes] = useState<chrome.bookmarks.BookmarkTreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const currentId = stack.length > 0 ? stack[stack.length - 1]!.id : ROOT_IDS[source]!;

  useEffect(() => {
    setStack([]);
  }, [source]);

  useEffect(() => {
    const api = chrome.bookmarks;
    if (!api) {
      setError("缺少 bookmarks 权限，请在扩展管理页重新加载本扩展");
      return;
    }
    let cancelled = false;
    api
      .getChildren(currentId)
      .then((children) => {
        if (cancelled) return;
        const sorted = [...children].sort((a, b) => {
          const aFolder = a.url ? 1 : 0;
          const bFolder = b.url ? 1 : 0;
          return aFolder - bFolder;
        });
        setNodes(sorted);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(String(err.message ?? err));
      });
    return () => {
      cancelled = true;
    };
  }, [currentId, revision, source]);

  // 书签被增删改时实时刷新
  useEffect(() => {
    const api = chrome.bookmarks;
    if (!api) return;
    const reload = () => setRevision((value) => value + 1);
    const events = [api.onCreated, api.onRemoved, api.onChanged, api.onMoved];
    for (const event of events) event.addListener(reload);
    return () => {
      for (const event of events) event.removeListener(reload);
    };
  }, []);

  const currentTitle = stack.length > 0 ? stack[stack.length - 1]!.title : "书签栏";

  return (
    <div class="kt-bookmarks" data-testid="bookmarks">
      <div class="kt-bm-head">
        {stack.length > 0 ? (
          <button
            class="kt-bm-back"
            title="返回上一层"
            onClick={() => setStack((current) => current.slice(0, -1))}
          >
            ‹
          </button>
        ) : null}
        <span class="kt-bm-crumb">{currentTitle}</span>
        <span class="kt-bm-count">{nodes.length}</span>
      </div>

      <div class="kt-bm-list">
        {error ? <p class="kt-bm-empty">{error}</p> : null}
        {!error && nodes.length === 0 ? <p class="kt-bm-empty">这个文件夹是空的</p> : null}

        {nodes.map((node) =>
          node.url ? (
            <a
              class="kt-bm-row"
              key={node.id}
              href={node.url}
              title={node.url}
              data-testid={`bm-${node.id}`}
            >
              {showIcons ? (
                <span class="kt-bm-icon">
                  <IconProbe url={node.url} letter={node.title} letterClassName="kt-bm-letter" />
                </span>
              ) : null}
              <span class="kt-bm-title">{node.title || node.url}</span>
            </a>
          ) : (
            <button
              class="kt-bm-row kt-bm-folder"
              key={node.id}
              onClick={() => setStack((current) => [...current, { id: node.id, title: node.title }])}
              data-testid={`bm-folder-${node.id}`}
            >
              <span class="kt-bm-icon kt-bm-folder-icon">📁</span>
              <span class="kt-bm-title">{node.title}</span>
              <span class="kt-bm-arrow">›</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}
