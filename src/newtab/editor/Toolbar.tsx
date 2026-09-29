import { canRedo, canUndo, editing, redo, setEditing, undo } from "@/newtab/store";

export function Toolbar() {
  if (!editing.value) {
    return (
      <button
        class="kt-edit-entry"
        title="编辑布局"
        aria-label="编辑布局"
        onClick={() => setEditing(true)}
        data-testid="edit-entry"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5Zm7.43-2.53a7.7 7.7 0 0 0 0-1.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.68-.97l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.3 7.3 0 0 0-1.68.97l-2.39-.96a.5.5 0 0 0-.61.22L2.42 8.81a.5.5 0 0 0 .12.64l2.03 1.58a7.7 7.7 0 0 0 0 1.94L2.54 14.55a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96a7.3 7.3 0 0 0 1.68.97l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7.3 7.3 0 0 0 1.68-.97l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64Z"
          />
        </svg>
      </button>
    );
  }

  return (
    <div class="kt-toolbar" data-testid="editor-toolbar">
      <button class="kt-btn kt-btn-primary" onClick={() => setEditing(false)} data-testid="edit-done">
        完成
      </button>
      <div class="kt-toolbar-sep" />
      <button class="kt-btn" disabled={!canUndo.value} onClick={undo} data-testid="undo">
        撤销
      </button>
      <button class="kt-btn" disabled={!canRedo.value} onClick={redo} data-testid="redo">
        重做
      </button>
      <span class="kt-toolbar-hint">拖动移动 · 角/边缩放 · 按住 Alt 关闭吸附 · 方向键微调</span>
    </div>
  );
}
