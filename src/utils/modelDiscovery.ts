import { invoke, isTauri } from "@tauri-apps/api/core";

export type ModelDiscoveryProtocol =
  | "openai-compatible"
  | "anthropic-messages";

export interface ModelDiscoveryRequest {
  baseUrl: string;
  modelsPath: string;
  apiKey: string;
  protocol: ModelDiscoveryProtocol;
}

function modelId(value: unknown) {
  if (typeof value === "string") {
    return value.trim().replace(/^models\//, "");
  }
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  for (const key of ["id", "baseModelId", "name", "model"]) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key].trim().replace(/^models\//, "");
    }
  }
  return "";
}

async function responseErrorMessage(response: Response) {
  let detail = "";
  try {
    const payload = await response.json() as {
      error?: { message?: unknown } | string;
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
  if (response.status === 404) {
    return "没有找到模型列表接口（HTTP 404），请检查模型列表地址";
  }
  return detail
    ? `模型列表接口返回 HTTP ${response.status}：${detail}`
    : `模型列表接口返回 HTTP ${response.status}`;
}

export function resolveModelListUrl(
  baseUrl: string,
  modelsPath: string
) {
  const trimmedBase = baseUrl.trim();
  const trimmedPath = modelsPath.trim();

  if (/^https?:\/\//i.test(trimmedPath)) {
    return trimmedPath;
  }
  if (!trimmedBase) {
    throw new Error("请先填写 Base URL");
  }
  return `${trimmedBase.replace(/\/+$/, "")}/${(
    trimmedPath || "/models"
  ).replace(/^\/+/, "")}`;
}

export function parseModelListPayload(payload: unknown) {
  const candidates = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? (
          (payload as Record<string, unknown>).data ??
          (payload as Record<string, unknown>).models
        )
      : [];

  if (!Array.isArray(candidates)) return [];

  return Array.from(
    new Set(candidates.map(modelId).filter(Boolean))
  ).sort((left, right) =>
    left.localeCompare(right, "en", {
      numeric: true,
      sensitivity: "base"
    })
  );
}

async function discoverModelsInBrowser(
  request: ModelDiscoveryRequest
) {
  const url = resolveModelListUrl(request.baseUrl, request.modelsPath);
  const headers = new Headers({ Accept: "application/json" });

  if (request.apiKey.trim()) {
    if (request.protocol === "anthropic-messages") {
      headers.set("x-api-key", request.apiKey.trim());
      headers.set("anthropic-version", "2023-06-01");
    } else {
      headers.set("Authorization", `Bearer ${request.apiKey.trim()}`);
    }
  }

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch {
    throw new Error(
      "无法访问模型列表，请检查地址、网络连接或浏览器跨域限制"
    );
  }
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }

  const models = parseModelListPayload(await response.json());
  if (!models.length) {
    throw new Error("模型列表接口没有返回可用的模型 ID");
  }
  return models;
}

export async function discoverModels(
  request: ModelDiscoveryRequest
) {
  if (!isTauri()) {
    return discoverModelsInBrowser(request);
  }

  const values = await invoke<unknown>("discover_models", { request });
  if (!Array.isArray(values)) {
    throw new Error("模型列表命令返回了无效数据");
  }

  const models = Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
  if (!models.length) {
    throw new Error("模型列表接口没有返回可用的模型 ID");
  }
  return models;
}
