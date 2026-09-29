import { signal } from "@preact/signals";

/** 轻量全局提示（同步状态、错误等），4 秒自动消失。 */
export const toastMessage = signal<string | null>(null);

let timer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string, durationMs = 4000): void {
  toastMessage.value = message;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    toastMessage.value = null;
    timer = null;
  }, durationMs);
}

export function Toasts() {
  const message = toastMessage.value;
  if (!message) return null;
  return (
    <div class="kt-toast" role="status" data-testid="toast" onClick={() => (toastMessage.value = null)}>
      {message}
    </div>
  );
}
