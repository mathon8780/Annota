import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ProviderProtocol } from "./modelProviders";

export interface ModelGenerationRequest {
  baseUrl: string;
  endpointPath: string;
  apiKey: string;
  protocol: ProviderProtocol;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

function resolveEndpointUrl(baseUrl: string, endpointPath: string) {
  const path = endpointPath.trim();
  if (/^https?:\/\//i.test(path)) return path;
  const base = baseUrl.trim();
  if (!base) throw new Error("模型服务缺少请求地址");
  return `${base.replace(/\/+$/, "")}/${(
    path || "/chat/completions"
  ).replace(/^\/+/, "")}`;
}

async function responseError(response: Response) {
  let detail = "";
  try {
    const payload = (await response.json()) as {
      error?: string | { message?: unknown };
      message?: unknown;
    };
    detail =
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.error?.message === "string"
          ? payload.error.message
          : typeof payload.message === "string"
            ? payload.message
            : "";
  } catch {
    detail = "";
  }
  if (response.status === 401 || response.status === 403) {
    return `鉴权失败（HTTP ${response.status}），请检查 API Key`;
  }
  if (response.status === 429) {
    return "模型服务请求过于频繁（HTTP 429），请稍后再试";
  }
  return detail
    ? `模型服务返回 HTTP ${response.status}：${detail}`
    : `模型服务返回 HTTP ${response.status}`;
}

function outputText(payload: unknown, protocol: ProviderProtocol) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  if (protocol === "anthropic-messages") {
    const content = Array.isArray(record.content) ? record.content : [];
    return content
      .map((item) =>
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).text === "string"
          ? ((item as Record<string, unknown>).text as string)
          : ""
      )
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0];
  if (!first || typeof first !== "object") return "";
  const message = (first as Record<string, unknown>).message;
  return message &&
    typeof message === "object" &&
    typeof (message as Record<string, unknown>).content === "string"
    ? ((message as Record<string, unknown>).content as string).trim()
    : "";
}

async function generateInBrowser(request: ModelGenerationRequest) {
  const headers = new Headers({ "Content-Type": "application/json" });
  let body: Record<string, unknown>;
  if (request.protocol === "anthropic-messages") {
    headers.set("x-api-key", request.apiKey.trim());
    headers.set("anthropic-version", "2023-06-01");
    body = {
      model: request.model,
      max_tokens: 2400,
      system: request.systemPrompt,
      messages: [{ role: "user", content: request.userPrompt }]
    };
  } else {
    headers.set("Authorization", `Bearer ${request.apiKey.trim()}`);
    body = {
      model: request.model,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt }
      ]
    };
  }

  let response: Response;
  try {
    response = await fetch(
      resolveEndpointUrl(request.baseUrl, request.endpointPath),
      {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      }
    );
  } catch {
    throw new Error("无法访问模型服务，请检查网络连接或浏览器跨域限制");
  }
  if (!response.ok) throw new Error(await responseError(response));
  const text = outputText(await response.json(), request.protocol);
  if (!text) throw new Error("模型服务没有返回可用内容");
  return text;
}

export async function generateModelText(request: ModelGenerationRequest) {
  if (!request.apiKey.trim()) throw new Error("所选模型没有配置 API Key");
  if (!request.model.trim()) throw new Error("拓扑节点没有选择可用模型");
  if (!isTauri()) return generateInBrowser(request);
  const text = await invoke<unknown>("generate_text", { request });
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("模型生成命令没有返回可用内容");
  }
  return text.trim();
}

export const GENERATION_OUTPUT_INSTRUCTION = `

请只返回一个 JSON 对象，不要使用 Markdown 代码围栏。结构必须为：
{"title":"文章标题","summary":"一句摘要","blocks":[{"type":"heading|paragraph|quote","text":"正文"}]}
blocks 至少包含一项；heading 仅用于小节标题。`;
