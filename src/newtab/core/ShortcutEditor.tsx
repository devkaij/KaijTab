import { saveShortcut, shortcutEditor } from "@/newtab/store";

/** 快捷方式新增/编辑弹窗：挂在 App 顶层，避免被元件容器裁切。 */
export function ShortcutEditor() {
  const draft = shortcutEditor.value;
  if (!draft) return null;

  const close = () => (shortcutEditor.value = null);
  const isNew = draft.id == null;

  const submit = () => {
    const title = draft.title.trim() || draft.url.trim();
    const url = draft.url.trim();
    if (!url) return;
    saveShortcut({ id: draft.id, title, url });
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
