import { useState } from "preact/hooks";
import { saveShortcut, shortcutEditor } from "@/newtab/store";
import { ensureHostPermission } from "@/shared/utils/permissions";
import { IconProbe } from "@/shared/ui/IconProbe";

/** 快捷方式新增/编辑弹窗：挂在 App 顶层，避免被元件容器裁切。 */
export function ShortcutEditor() {
  const draft = shortcutEditor.value;
  // 手动触发一次重新探测（授权新域名后需要重跑整条候选链）
  const [probeNonce, setProbeNonce] = useState(0);

  if (!draft) return null;

  const close = () => (shortcutEditor.value = null);
  const isNew = draft.id == null;

  const submit = () => {
    const title = draft.title.trim() || draft.url.trim();
    const url = draft.url.trim();
    if (!url) return;
    saveShortcut({ id: draft.id, title, url, icon: draft.icon });
    close();
  };

  return (
    <>
      <div class="kt-modal-backdrop" onPointerDown={close} />
      <div class="kt-modal" data-testid="shortcut-editor">
        <h3>{isNew ? "添加快捷方式" : "编辑快捷方式"}</h3>
        <label class="kt-field">
          <span>名称</span>
          <input
            type="text"
            value={draft.title}
            placeholder="例如：B站"
            data-testid="shortcut-title"
            onInput={(e) =>
              (shortcutEditor.value = { ...draft, title: (e.target as HTMLInputElement).value })
            }
          />
        </label>
        <label class="kt-field">
          <span>网址</span>
          <input
            type="text"
            value={draft.url}
            placeholder="例如：bilibili.com"
            spellcheck={false}
            data-testid="shortcut-url"
            onInput={(e) =>
              (shortcutEditor.value = { ...draft, url: (e.target as HTMLInputElement).value })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </label>
        <label class="kt-field">
          <span>图标地址（可选，留空自动识别）</span>
          <div class="kt-icon-input">
            <span class="kt-icon-preview">
              <IconProbe
                key={probeNonce}
                url={draft.url}
                icon={draft.icon || undefined}
                letter={draft.title || draft.url}
              />
            </span>
            <input
              type="text"
              value={draft.icon ?? ""}
              placeholder="https://…/icon.png"
              spellcheck={false}
              data-testid="shortcut-icon"
              onInput={(e) =>
                (shortcutEditor.value = { ...draft, icon: (e.target as HTMLInputElement).value })
              }
            />
            <button
              type="button"
              class="kt-btn kt-btn-probe"
              data-testid="shortcut-icon-refresh"
              title="重新识别图标：抓取站点页面声明与公开图标库；新域名会弹出授权询问"
              onClick={async () => {
                const url = draft.url.trim();
                if (url) await ensureHostPermission(url);
                setProbeNonce((n) => n + 1);
              }}
            >
              识别
            </button>
          </div>
        </label>
        <div class="kt-modal-actions">
          <button class="kt-btn" onClick={close}>
            取消
          </button>
          <button class="kt-btn kt-btn-primary" onClick={submit} data-testid="shortcut-save">
            保存
          </button>
        </div>
      </div>
    </>
  );
}
