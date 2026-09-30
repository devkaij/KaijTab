import { useEffect } from "preact/hooks";
import { state } from "./store";
import type { ThemeMode } from "@/shared/types";

export function resolveTheme(mode: ThemeMode, prefersLight: boolean): "dark" | "light" {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return prefersLight ? "light" : "dark";
}

/** 把主题写到 <html data-theme>，并在"跟随系统"时响应系统切换 */
export function useTheme(): void {
  const mode: ThemeMode = state.value.settings.theme ?? "system";

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(mode, media.matches);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode]);
}
