import { useState } from "preact/hooks";
import type { FieldSchema } from "./types";
import { getModule } from "./registry";
import { moduleSettingsFor, updateItemGlass, updateItemProps } from "@/newtab/store";
import type { GlassEffect } from "@/shared/types";

/** 通用字段渲染：由模块的 settingsSchema 自动生成。 */
export function FieldEditor({
  schema,
  value,
  onChange,
}: {
  schema: FieldSchema[];
  value: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div class="kt-fields">
      {schema.map((field) => {
        const current = value[field.key];
        if (field.type === "boolean") {
          return (
            <label key={field.key} class="kt-check">
              <input
                type="checkbox"
                checked={current === true}
                onChange={(e) => onChange({ [field.key]: (e.target as HTMLInputElement).checked })}
                data-testid={`field-${field.key}`}
              />
              <span>{field.label}</span>
            </label>
          );
        }
        if (field.type === "number") {
          return (
            <label key={field.key} class="kt-field">
              <span>{field.label}</span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step}
                value={typeof current === "number" ? current : ""}
                onInput={(e) =>
                  onChange({ [field.key]: Number((e.target as HTMLInputElement).value) })
                }
                data-testid={`field-${field.key}`}
              />
            </label>
          );
        }
        if (field.type === "select") {
          return (
            <label key={field.key} class="kt-field">
              <span>{field.label}</span>
              <select
                value={typeof current === "string" ? current : (field.options[0]?.value ?? "")}
                onChange={(e) => onChange({ [field.key]: (e.target as HTMLSelectElement).value })}
                data-testid={`field-${field.key}`}
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        if (field.type === "date") {
          return (
            <label key={field.key} class="kt-field">
              <span>{field.label}</span>
              <input
                type="date"
                value={typeof current === "string" ? current : ""}
                onInput={(e) => onChange({ [field.key]: (e.target as HTMLInputElement).value })}
                data-testid={`field-${field.key}`}
              />
            </label>
          );
        }
        return (
          <label key={field.key} class="kt-field">
            <span>{field.label}</span>
            <input
              type="text"
              placeholder={field.placeholder}
              value={typeof current === "string" ? current : ""}
              onInput={(e) => onChange({ [field.key]: (e.target as HTMLInputElement).value })}
              data-testid={`field-${field.key}`}
            />
          </label>
        );
      })}
    </div>
  );
}

/** 模块实例设置弹窗（右键菜单进入）：模块配置 + 外观（玻璃效果）。 */
export function InstanceSettingsDialog() {
  const instance = moduleSettingsFor.value;
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);

  if (!instance) {
    if (draft) setDraft(null);
    return null;
  }

  const definition = getModule(instance.type);
  const schema = definition?.settingsSchema ?? [];
  const values = draft ?? instance.props;
  const glassValue = instance.glass ?? "inherit";

  const close = () => {
    moduleSettingsFor.value = null;
    setDraft(null);
  };

  const apply = () => {
    updateItemProps(instance.id, values);
    close();
  };

  return (
    <>
      <div class="kt-modal-backdrop" onPointerDown={close} />
      <div class="kt-modal" data-testid="instance-settings">
        <h3>{definition?.name ?? "元件"} · 设置</h3>

        {schema.length > 0 ? (
          <FieldEditor
            schema={schema}
            value={values}
            onChange={(patch) => setDraft({ ...values, ...patch })}
          />
        ) : (
          <p class="kt-panel-hint">该元件没有模块配置项。</p>
        )}

        <label class="kt-field">
          <span>玻璃效果</span>
          <select
            value={glassValue}
            data-testid="item-glass"
            onChange={(e) =>
              updateItemGlass(
                instance.id,
                (e.target as HTMLSelectElement).value as GlassEffect | "inherit",
              )
            }
          >
            <option value="inherit">跟随全局</option>
            <option value="none">无</option>
            <option value="frost">磨砂玻璃</option>
            <option value="liquid">液态玻璃</option>
          </select>
        </label>

        <div class="kt-modal-actions">
          <button class="kt-btn" onClick={close}>
            取消
          </button>
          <button class="kt-btn kt-btn-primary" onClick={apply} data-testid="instance-settings-save">
            保存
          </button>
        </div>
      </div>
    </>
  );
}
