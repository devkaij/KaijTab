import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { commit, state } from "@/newtab/store";
import { ensureHostPermission } from "@/shared/utils/permissions";
import { AI_SECRET_KIND, AI_SETTINGS_NAMESPACE, normalizeBaseUrl, readAiConfig, type AiSettings } from "./config";
import "./ai-form.css";

/**
 * AI 接口配置表单（全应用共享的一份配置）。
 * AI 推荐模块与热榜翻译都用它，字段 testid 保持一致便于测试。
 */
export function AiConfigForm({
  onSaved,
  hint,
  children,
}: {
  onSaved?: () => void;
  hint?: string;
  children?: ComponentChildren;
}) {
  const [draft, setDraft] = useState(() => readAiConfig(state.value));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const baseUrl = normalizeBaseUrl(draft.baseUrl);
    const model = draft.model.trim();
    const apiKey = draft.apiKey.trim();
    if (!baseUrl || !model || !apiKey) {
      setError("接口地址、模型名、API Key 三项都要填");
      return;
    }
    setBusy(true);
    try {
      const permission = await ensureHostPermission(baseUrl);
      if (!permission.ok) {
        setError(`没有获得 ${permission.origin ?? baseUrl} 的访问权限，无法调用你的接口`);
        return;
      }
      commit((s) => ({
        ...s,
        modules: {
          ...s.modules,
          settings: {
            ...s.modules.settings,
            [AI_SETTINGS_NAMESPACE]: {
              ...(s.modules.settings[AI_SETTINGS_NAMESPACE] as AiSettings | undefined),
              baseUrl,
              model,
            },
          },
        },
        localSecrets: {
          ...s.localSecrets,
          [`${AI_SETTINGS_NAMESPACE}:${AI_SECRET_KIND}`]: apiKey,
        },
      }));
      setError(null);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <label class="kt-ai-field">
        <span>接口地址（OpenAI 兼容）</span>
        <input
          type="text"
          value={draft.baseUrl}
          placeholder="https://api.openai.com/v1"
          spellcheck={false}
          data-testid="ai-base-url"
          onInput={(e) => setDraft({ ...draft, baseUrl: (e.target as HTMLInputElement).value })}
        />
      </label>
      <label class="kt-ai-field">
        <span>模型名</span>
        <input
          type="text"
          value={draft.model}
          placeholder="gpt-4o-mini / deepseek-chat"
          spellcheck={false}
          data-testid="ai-model"
          onInput={(e) => setDraft({ ...draft, model: (e.target as HTMLInputElement).value })}
        />
      </label>
      <label class="kt-ai-field">
        <span>API Key（只存在本地，不参与账号同步）</span>
        <input
          type="password"
          value={draft.apiKey}
          placeholder="sk-…"
          spellcheck={false}
          data-testid="ai-api-key"
          onInput={(e) => setDraft({ ...draft, apiKey: (e.target as HTMLInputElement).value })}
        />
      </label>

      <div class="kt-ai-actions">
        <button
          class="kt-ai-btn kt-ai-btn-primary"
          disabled={busy}
          onClick={() => void save()}
          data-testid="ai-save"
        >
          保存并授权
        </button>
        {children}
      </div>

      <p class="kt-ai-note">
        {hint ??
          "配置一次即可全应用共用（AI 推荐、热榜翻译等）；保存时浏览器会弹出一次该域名的访问授权。"}
      </p>

      {error ? <p class="kt-ai-error">{error}</p> : null}
    </>
  );
}
