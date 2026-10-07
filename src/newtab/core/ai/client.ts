/**
 * 共享的 OpenAI 兼容调用客户端。
 * 统一处理：配置解析、"低思考档位"字段与 400 自动降级、超时与中止。
 */
import { commit, state } from "@/newtab/store";
import {
  AI_SETTINGS_NAMESPACE,
  chatCompletionsUrl,
  DEFAULT_MAX_OUTPUT_TOKENS,
  isThinkingFallback,
  readAiConfig,
  THINKING_OFF_FIELDS,
  type AiSettings,
} from "./config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 45_000;

export class AiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

interface ResponseShape {
  choices?: Array<{ message?: { content?: string } }>;
}

async function send(
  messages: ChatMessage[],
  options: ChatOptions,
  lowThinking: boolean,
  apiKey: string,
  baseUrl: string,
  model: string,
  controller: AbortController,
): Promise<Response> {
  const body: Record<string, unknown> = {
    model,
    temperature: options.temperature ?? 0.5,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    messages,
  };
  if (lowThinking) Object.assign(body, THINKING_OFF_FIELDS);

  return fetch(chatCompletionsUrl(baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
}

/** 走用户配置的接口做一次对话，返回文本内容 */
export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  const config = readAiConfig(state.value);
  if (!config.apiKey) throw new Error("还没有配置 AI 接口（在 AI 推荐模块或热榜的翻译设置里填）");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const lowThinking = !isThinkingFallback(state.value);
    let response = await send(
      messages,
      options,
      lowThinking,
      config.apiKey,
      config.baseUrl,
      config.model,
      controller,
    );

    if (!response.ok && lowThinking && response.status === 400) {
      // 该接口不认识思考控制字段：去掉后重试一次，并记住结论
      commit(
        (s) => ({
          ...s,
          modules: {
            ...s.modules,
            settings: {
              ...s.modules.settings,
              [AI_SETTINGS_NAMESPACE]: {
                ...(s.modules.settings[AI_SETTINGS_NAMESPACE] as AiSettings | undefined),
                thinkingFallback: true,
              },
            },
          },
        }),
        { skipHistory: true },
      );
      response = await send(
        messages,
        options,
        false,
        config.apiKey,
        config.baseUrl,
        config.model,
        controller,
      );
    }

    if (!response.ok) {
      const hint =
        response.status === 401 || response.status === 403 ? "（API Key 或权限可能不对）" : "";
      throw new AiRequestError(response.status, `接口返回 HTTP ${response.status}${hint}`);
    }

    const data = (await response.json()) as ResponseShape;
    return data.choices?.[0]?.message?.content ?? "";
  } catch (error) {
    if (controller.signal.aborted && !options.signal?.aborted) {
      throw new Error("请求超时");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
