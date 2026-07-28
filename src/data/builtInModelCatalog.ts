export const BUILT_IN_MODEL_CATALOG_UPDATED_AT = "2026-07-28";

export const BUILT_IN_MODEL_CATALOG = {
  chatgpt: [
    "gpt-5.6",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.5-pro",
    "gpt-5.4",
    "gpt-5.4-pro",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.3-codex",
    "gpt-5.2",
    "gpt-5.2-pro",
    "gpt-5.1",
    "gpt-5",
    "gpt-5-pro",
    "gpt-5-mini",
    "gpt-5-nano",
    "o3-pro",
    "o3",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4o-mini"
  ],
  gemini: [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
  ],
  kimi: [
    "kimi-k3",
    "kimi-k2.7-code",
    "kimi-k2.7-code-highspeed",
    "kimi-k2.6"
  ],
  deepseek: ["deepseek-v4-flash", "deepseek-v4-pro"],
  claude: [
    "claude-fable-5",
    "claude-opus-4-8",
    "claude-sonnet-5",
    "claude-haiku-4-5-20251001"
  ],
  glm: [
    "glm-5.2",
    "glm-5.1",
    "glm-5",
    "glm-5-turbo",
    "glm-4.7",
    "glm-4.7-flashx",
    "glm-4.7-flash",
    "glm-4.6",
    "glm-4.5-air",
    "glm-4.5-airx",
    "glm-4-long",
    "glm-4-flashx-250414",
    "glm-4-flash-250414"
  ]
} as const;

export function getBuiltInModels(providerId: string): readonly string[] {
  if (providerId in BUILT_IN_MODEL_CATALOG) {
    return BUILT_IN_MODEL_CATALOG[
      providerId as keyof typeof BUILT_IN_MODEL_CATALOG
    ];
  }
  return [];
}
