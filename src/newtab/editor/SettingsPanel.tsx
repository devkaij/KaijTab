import { settingsPanelOpen, setSyncEnabled, state, syncEnabled, updateSettings } from "@/newtab/store";
import type { GlassEffect, ThemeMode } from "@/shared/types";

const GLASS_OPTIONS: Array<{ value: GlassEffect; label: string; hint: string }> = [
  { value: "none", label: "无", hint: "元件使用自身卡片样式" },
  { value: "frost", label: "磨砂玻璃", hint: "柔和磨砂 + 降噪" },
  { value: "liquid", label: "液态玻璃", hint: "强折射 + 顶部高光" },
];

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; hint: string }> = [
  { value: "system", label: "跟随系统", hint: "随系统深浅色自动切换" },
  { value: "light", label: "浅色", hint: "始终浅色" },
  { value: "dark", label: "深色", hint: "始终深色" },
];

export function SettingsPanel() {
  if (!settingsPanelOpen.value) return null;

  const settings = state.value.settings;
  const glass = settings.glassEffect;
  const theme = settings.theme ?? "system";

  const close = () => (settingsPanelOpen.value = false);

  return (
    <>
      <div class="kt-panel-backdrop" onPointerDown={close} />
      <aside class="kt-panel" data-testid="settings-panel">
        <header class="kt-panel-head">
          <h3>设置</h3>
          <button class="kt-panel-close" onClick={close}>
            ✕
          </button>
        </header>

        <section class="kt-panel-section">
          <h4>外观 · 主题</h4>
          <div class="kt-segmented" data-testid="theme-selector">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                class={`kt-segmented-item ${theme === option.value ? "kt-segmented-active" : ""}`}
                title={option.hint}
                onClick={() => updateSettings({ theme: option.value })}
                data-testid={`theme-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p class="kt-panel-hint">
            浅色/深色会影响界面、玻璃质感与默认背景；选择"跟随系统"时随系统设置自动切换。
          </p>
        </section>

        <section class="kt-panel-section">
          <h4>外观 · 玻璃效果</h4>
          <div class="kt-segmented" data-testid="glass-selector">
            {GLASS_OPTIONS.map((option) => (
              <button
                key={option.value}
                class={`kt-segmented-item ${glass === option.value ? "kt-segmented-active" : ""}`}
                title={option.hint}
                onClick={() => updateSettings({ glassEffect: option.value })}
                data-testid={`glass-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p class="kt-panel-hint">
            全局默认效果；单个元件可在右键「设置 → 玻璃效果」里单独覆盖。切到「无」时保留元件自带样式。
          </p>
        </section>

        <section class="kt-panel-section">
          <h4>编辑</h4>
          <label class="kt-field">
            <span>网格吸附</span>
            <select
              value={settings.editorPrefs.grid == null ? "off" : String(settings.editorPrefs.grid)}
              onChange={(e) => {
                const value = (e.target as HTMLSelectElement).value;
                updateSettings({
                  editorPrefs: {
                    ...settings.editorPrefs,
                    grid: value === "off" ? null : Number(value),
                  },
                });
              }}
            >
              <option value="off">关闭</option>
              <option value="4">4 px</option>
              <option value="8">8 px</option>
              <option value="16">16 px</option>
            </select>
          </label>
          <label class="kt-field">
            <span>吸附阈值（px）</span>
            <input
              type="number"
              min={2}
              max={20}
              value={settings.editorPrefs.snapThreshold}
              onInput={(e) =>
                updateSettings({
                  editorPrefs: {
                    ...settings.editorPrefs,
                    snapThreshold: Number((e.target as HTMLInputElement).value) || 6,
                  },
                })
              }
            />
          </label>
        </section>

        <section class="kt-panel-section">
          <h4>同步</h4>
          <button
            class={`kt-btn ${syncEnabled.value ? "kt-btn-primary" : ""}`}
            onClick={() => void setSyncEnabled(!syncEnabled.value)}
            data-testid="sync-toggle"
            style={{ alignSelf: "flex-start" }}
          >
            {syncEnabled.value ? "同步已开启 · 点击关闭" : "开启浏览器账号同步"}
          </button>
          <p class="kt-panel-hint">
            通过浏览器账号同步布局 / 快捷方式 / 设置；壁纸与模块私有数据只存本地。超出同步配额时会自动关闭。
          </p>
        </section>

        <section class="kt-panel-section">
          <h4>关于</h4>
          <p class="kt-panel-hint">
            KaijTab {chrome.runtime.getManifest().version} · 自由画布新标签页。拖拽移动、角/边缩放、按住 Alt
            关闭吸附、方向键微调、Ctrl+Z 撤销。
          </p>
        </section>
      </aside>
    </>
  );
}
