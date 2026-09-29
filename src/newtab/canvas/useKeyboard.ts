import { useEffect } from "preact/hooks";
import {
  editing,
  nudgeSelected,
  redo,
  removeInstance,
  selectedId,
  setEditing,
  state,
  undo,
  contextMenu,
} from "@/newtab/store";

/** 全局键盘操作：撤销/重做、方向键微调、Delete 删除、Esc 退出。 */
export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target != null &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if (e.key === "Escape") {
        if (contextMenu.value) {
          contextMenu.value = null;
          return;
        }
        if (editing.value) {
          if (selectedId.value) selectedId.value = null;
          else setEditing(false);
          return;
        }
      }

      if (isEditable || !editing.value) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        const item = state.value.layout.items.find((i) => i.id === selectedId.value);
        if (item && !item.locked) {
          e.preventDefault();
          if (window.confirm("删除这个元件？")) removeInstance(item.id);
        }
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudgeSelected(-step, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudgeSelected(step, 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeSelected(0, -step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeSelected(0, step);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
