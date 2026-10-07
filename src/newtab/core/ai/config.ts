/** 全应用共享的 AI 接口配置（OpenAI 兼容）。AI 推荐与热榜翻译等模块共用一份。 */
import type { RootState } from "@/shared/types";

export interface AiConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export const DEFAULT_AI_BASE = "https://api.openai.com/v1";
export const DEFAULT_AI_MODEL = "gpt-4o-mini";

/** 非敏感配置（接口地址 / 模型名）→ 随设置同步 */
export const AI_SETTINGS_NAMESPACE = "ai";
/** 敏感数据（API Key）→ 仅本地，永不参与同步 */
export const AI_SECRET_KIND = "apiKey";
/** 旧版本把配置放在 ai-recommend 命名空间下，这里做兼容读取 */
export const AI_LEGACY_NAMESPACE = "ai-recommend";

export interface AiSettings {
  baseUrl?: string;
  model?: string;
  /** 该接口不认识"思考控制"字段时置位，后续不再发送 */
  thinkingFallback?: boolean;
}

function settingsOf(state: RootState, namespace: string): AiSettings {
  return (state.modules.settings[namespace] as AiSettings | undefined) ?? {};
}

export function readAiConfig(state: RootState): AiConfig {
  const current = settingsOf(state, AI_SETTINGS_NAMESPACE);
  const legacy = settingsOf(state, AI_LEGACY_NAMESPACE);
  const apiKey =
    (state.localSecrets[`${AI_SETTINGS_NAMESPACE}:${AI_SECRET_KIND}`] as string | undefined) ??
    (state.localSecrets[`${AI_LEGACY_NAMESPACE}:${AI_SECRET_KIND}`] as string | undefined) ??
    "";
  return {
    baseUrl: current.baseUrl ?? legacy.baseUrl ?? DEFAULT_AI_BASE,
    model: current.model ?? legacy.model ?? DEFAULT_AI_MODEL,
    apiKey,
  };
}

export function isAiConfigured(state: RootState): boolean {
  const config = readAiConfig(state);
  return Boolean(config.baseUrl && config.model && config.apiKey);
}

export function isThinkingFallback(state: RootState): boolean {
  return (
    settingsOf(state, AI_SETTINGS_NAMESPACE).thinkingFallback === true ||
    settingsOf(state, AI_LEGACY_NAMESPACE).thinkingFallback === true
  );
}

/** 去掉首尾空白与末尾斜杠（用户常直接粘贴带斜杠的地址） */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

/** 支持填 base（自动补 /chat/completions）或直接填完整端点 */
export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = normalizeBaseUrl(baseUrl);
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

/** 输出上限：短结果足够，限制长度能显著缩短推理模型的思考时间 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 600;

/** 低思考档位需要发出去的字段（各家叫法不同，多写几个；不支持的接口会忽略或 400） */
export const THINKING_OFF_FIELDS: Record<string, unknown> = {
  reasoning_effort: "low",
  enable_thinking: false,
  thinking: { type: "disabled" },
};
