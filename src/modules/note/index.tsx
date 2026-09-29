import { useEffect, useRef, useState } from "preact/hooks";
import type { ModuleProps } from "@/newtab/module-host/types";
import "./note.css";

const SAVE_DELAY = 400;

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function Note({ props, runtime }: ModuleProps) {
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const [text, setText] = useState(() => runtime.data.get<string>("text") ?? "");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const firstRun = useRef(true);

  const fontSize = typeof props.fontSize === "number" ? props.fontSize : 14;
  const align = props.align === "center" ? "center" : "left";

  // 输入防抖自动保存（跳过首次挂载，避免无意义写入）
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(() => {
      runtimeRef.current.data.set("text", text);
      setSavedAt(new Date());
    }, SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div class="kt-note">
      <textarea
        class="kt-note-area"
        style={{ fontSize: `${fontSize}px`, textAlign: align }}
        value={text}
        placeholder="写点什么…（自动保存）"
        spellcheck={false}
        data-testid="note-area"
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
      />
      <div class="kt-note-foot" data-testid="note-foot">
        {savedAt ? `已保存 ${formatTime(savedAt)}` : "自动保存"}
      </div>
    </div>
  );
}
