import { useEffect, useRef, useState } from "preact/hooks";
import type { ModuleProps } from "@/newtab/module-host/types";
import "./todo.css";

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

function newItem(text: string): TodoItem {
  return {
    id: `td_${Math.random().toString(36).slice(2, 9)}`,
    text,
    done: false,
  };
}

export default function Todo({ props, runtime }: ModuleProps) {
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const [items, setItems] = useState<TodoItem[]>(() => {
    const stored = runtime.data.get<TodoItem[]>("items");
    return Array.isArray(stored) ? stored : [];
  });
  const [draft, setDraft] = useState("");
  const firstRun = useRef(true);

  const showDone = props.showDone !== false;
  const hideProgress = props.hideProgress === true;

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    runtimeRef.current.data.set("items", items);
  }, [items]);

  const visible = showDone ? items : items.filter((item) => !item.done);
  const doneCount = items.filter((item) => item.done).length;

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    setItems((current) => [...current, newItem(text)]);
    setDraft("");
  };

  return (
    <div class="kt-todo">
      {!hideProgress && items.length > 0 ? (
        <div class="kt-todo-head" data-testid="todo-progress">
          <span>
            {doneCount} / {items.length} 已完成
          </span>
          {doneCount > 0 ? (
            <button
              class="kt-todo-clear"
              title="清除已完成"
              onClick={() => setItems((current) => current.filter((item) => !item.done))}
            >
              清除已完成
            </button>
          ) : null}
        </div>
      ) : null}

      <div class="kt-todo-list">
        {visible.map((item) => (
          <div class="kt-todo-row" key={item.id} data-testid={`todo-row-${item.id}`}>
            <input
              type="checkbox"
              class="kt-todo-check"
              checked={item.done}
              onChange={() =>
                setItems((current) =>
                  current.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)),
                )
              }
            />
            <span class={`kt-todo-text ${item.done ? "kt-todo-done" : ""}`}>{item.text}</span>
            <button
              class="kt-todo-remove"
              title="删除"
              onClick={() => setItems((current) => current.filter((i) => i.id !== item.id))}
            >
              ✕
            </button>
          </div>
        ))}
        {visible.length === 0 ? (
          <p class="kt-todo-empty">暂无待办，下面添加一条。</p>
        ) : null}
      </div>

      <div class="kt-todo-add">
        <input
          class="kt-todo-input"
          type="text"
          value={draft}
          placeholder="添加待办，回车确认"
          spellcheck={false}
          data-testid="todo-input"
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button class="kt-todo-add-btn" onClick={add} title="添加" data-testid="todo-add">
          +
        </button>
      </div>
    </div>
  );
}
