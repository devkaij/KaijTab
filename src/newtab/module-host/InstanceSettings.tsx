import { useState } from "preact/hooks";
import type { FieldSchema } from "./types";
import { getModule } from "./registry";
import { moduleSettingsFor, updateItemProps } from "@/newtab/store";
import type { WidgetInstance } from "@/shared/types";

/** 实例级配置面板：由模块的 settingsSchema 自动生成。 */
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

/** 模块实例设置弹窗（从右键菜单进入）。 */
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
        <h3>{definition?.name ?? instance.type} · 设置</h3>
        {schema.length > 0 ? (
          <FieldEditor schema={schema} value={values} onChange={(patch) => setDraft({ ...values, ...patch })} />
        ) : (
          <p class="kt-panel-hint">该模块没有可配置项。</p>
        )}
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

export function hasSettings(instance: WidgetInstance): boolean {
  const definition = getModule(instance.type);
  return (definition?.settingsSchema?.length ?? 0) > 0;
}
