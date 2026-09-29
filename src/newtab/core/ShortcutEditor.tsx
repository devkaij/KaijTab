import { useEffect, useState } from "preact/hooks";
import { saveShortcut, shortcutEditor } from "@/newtab/store";
import { iconCandidates } from "./icons";

/** 快捷方式新增/编辑弹窗：挂在 App 顶层，避免被元件容器裁切。 */
export function ShortcutEditor() {
  const draft = shortcutEditor.value;
  const [iconFailed, setIconFailed] = useState(false);

  useEffect(() => {
    setIconFailed(false);
  }, [draft?.icon, draft?.url]);

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

  const preview = iconCandidates(
    draft.icon ? { url: draft.url, icon: draft.icon } : { url: draft.url },
  )[0];

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
          <span>图标地址（可选，留空自动获取）</span>
          <div class="kt-icon-input">
            <span class="kt-icon-preview">
              {preview && !iconFailed ? (
                <img src={preview} alt="" onError={() => setIconFailed(true)} />
              ) : (
                <span>{(draft.title || draft.url || "?")[0]?.toUpperCase()}</span>
              )}
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
