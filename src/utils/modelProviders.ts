export type ProviderTone = "cobalt" | "indigo" | "cyan" | "violet" | "slate";
export type ProviderBrand =
  | "chatgpt"
  | "gemini"
  | "kimi"
  | "deepseek"
  | "claude"
  | "zhipu"
  | "custom";
export type ProviderProtocol = "openai-compatible" | "anthropic-messages";

export interface ModelProvider {
  id: string;
  name: string;
  shortName: string;
  kind: "default" | "custom";
  tone: ProviderTone;
  brand: ProviderBrand;
  protocol: ProviderProtocol;
  baseUrl: string;
  modelsPath: string;
  endpointPath: string;
  apiKey: string;
  model: string;
  availableModels: string[];
  enabledModels: string[];
  enabled: boolean;
  isDefault: boolean;
}

export interface ConfiguredModel {
  id: string;
  providerId: string;
  providerName: string;
  model: string;
  protocol: ProviderProtocol;
}

export const MODEL_PROVIDERS_STORAGE_KEY = "annota:model-providers.v1";

export const initialModelProviders: ModelProvider[] = [
  {
    id: "chatgpt",
    name: "Chat GPT",
    shortName: "GPT",
    kind: "default",
    tone: "slate",
    brand: "chatgpt",
    protocol: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    modelsPath: "/models",
    endpointPath: "/chat/completions",
    apiKey: "",
    model: "",
    availableModels: [],
    enabledModels: [],
    enabled: true,
    isDefault: true
  },
  {
    id: "gemini",
    name: "Gemini",
    shortName: "GM",
    kind: "default",
    tone: "cyan",
    brand: "gemini",
    protocol: "openai-compatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    modelsPath: "/models",
    endpointPath: "/chat/completions",
    apiKey: "",
    model: "",
    availableModels: [],
    enabledModels: [],
    enabled: false,
    isDefault: false
  },
  {
    id: "kimi",
    name: "Kimi",
    shortName: "KM",
    kind: "default",
    tone: "slate",
    brand: "kimi",
    protocol: "openai-compatible",
    baseUrl: "https://api.moonshot.cn/v1",
    modelsPath: "/models",
    endpointPath: "/chat/completions",
    apiKey: "",
    model: "",
    availableModels: [],
    enabledModels: [],
    enabled: false,
    isDefault: false
  },
  {
    id: "deepseek",
    name: "Deepseek",
    shortName: "DS",
    kind: "default",
    tone: "cobalt",
    brand: "deepseek",
    protocol: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    modelsPath: "/models",
    endpointPath: "/chat/completions",
    apiKey: "",
    model: "",
    availableModels: [],
    enabledModels: [],
    enabled: true,
    isDefault: false
  },
  {
    id: "claude",
    name: "Claude",
    shortName: "CL",
    kind: "default",
    tone: "violet",
    brand: "claude",
    protocol: "anthropic-messages",
    baseUrl: "https://api.anthropic.com/v1",
    modelsPath: "/models",
    endpointPath: "/messages",
    apiKey: "",
    model: "",
    availableModels: [],
    enabledModels: [],
    enabled: false,
    isDefault: false
  },
  {
    id: "glm",
    name: "GLM",
    shortName: "GLM",
    kind: "default",
    tone: "indigo",
    brand: "zhipu",
    protocol: "openai-compatible",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    modelsPath: "/models",
    endpointPath: "/chat/completions",
    apiKey: "",
    model: "",
    availableModels: [],
    enabledModels: [],
    enabled: false,
    isDefault: false
  }
];

const providerTones: ProviderTone[] = [
  "cobalt",
  "indigo",
  "cyan",
  "violet",
  "slate"
];
const providerBrands: ProviderBrand[] = [
  "chatgpt",
  "gemini",
  "kimi",
  "deepseek",
  "claude",
  "zhipu",
  "custom"
];
const providerProtocols: ProviderProtocol[] = [
  "openai-compatible",
  "anthropic-messages"
];

function isStoredModelProvider(value: unknown): value is ModelProvider {
  if (!value || typeof value !== "object") return false;
  const provider = value as Partial<ModelProvider>;
  return (
    typeof provider.id === "string" &&
    typeof provider.name === "string" &&
    typeof provider.shortName === "string" &&
    (provider.kind === "default" || provider.kind === "custom") &&
    providerTones.includes(provider.tone as ProviderTone) &&
    providerBrands.includes(provider.brand as ProviderBrand) &&
    providerProtocols.includes(provider.protocol as ProviderProtocol) &&
    typeof provider.baseUrl === "string" &&
    typeof provider.modelsPath === "string" &&
    typeof provider.endpointPath === "string" &&
    typeof provider.apiKey === "string" &&
    typeof provider.model === "string" &&
    typeof provider.enabled === "boolean" &&
    typeof provider.isDefault === "boolean"
  );
}

function normalizeModels(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .filter((model): model is string => typeof model === "string")
            .map((model) => model.trim())
            .filter(Boolean)
        )
      )
    : [];
}

function normalizeDefaultProvider(providers: ModelProvider[]) {
  const defaultProviderId =
    providers.find((provider) => provider.isDefault)?.id ??
    initialModelProviders[0].id;
  return providers.map((provider) => ({
    ...provider,
    isDefault: provider.id === defaultProviderId
  }));
}

export function loadModelProviders() {
  const fallback = initialModelProviders.map((provider) => ({ ...provider }));
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(MODEL_PROVIDERS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;

    const storedProviders = parsed.filter(isStoredModelProvider);
    const storedById = new Map(
      storedProviders.map((provider) => [provider.id, provider])
    );
    const builtInIds = new Set(initialModelProviders.map((provider) => provider.id));
    const builtInProviders = initialModelProviders.map((provider) => {
      const stored = storedById.get(provider.id);
      if (!stored) return { ...provider };
      const availableModels = normalizeModels(stored.availableModels);
      const storedEnabledModels = Array.isArray(stored.enabledModels)
        ? normalizeModels(stored.enabledModels)
        : [];
      const enabledModels = storedEnabledModels.filter((model) =>
        availableModels.includes(model)
      );
      return {
        ...provider,
        apiKey: stored.apiKey,
        model: enabledModels.includes(stored.model)
          ? stored.model
          : enabledModels[0] ?? "",
        availableModels,
        enabledModels,
        enabled: stored.enabled,
        isDefault: stored.isDefault
      };
    });
    const customProviders = storedProviders
      .filter(
        (provider) =>
          provider.kind === "custom" && !builtInIds.has(provider.id)
      )
      .map((provider) => {
        const availableModels = normalizeModels(provider.availableModels);
        const storedEnabledModels = Array.isArray(provider.enabledModels)
          ? normalizeModels(provider.enabledModels)
          : [];
        const enabledModels = storedEnabledModels.filter((model) =>
          availableModels.includes(model)
        );
        return {
          ...provider,
          model: enabledModels.includes(provider.model)
            ? provider.model
            : enabledModels[0] ?? "",
          availableModels,
          enabledModels
        };
      });

    return normalizeDefaultProvider([...builtInProviders, ...customProviders]);
  } catch {
    return fallback;
  }
}

export function saveModelProviders(providers: ModelProvider[]) {
  try {
    window.localStorage.setItem(
      MODEL_PROVIDERS_STORAGE_KEY,
      JSON.stringify(providers)
    );
  } catch {
    // Restricted previews can disable storage; the active page remains usable.
  }
}

export function configuredModels(providers = loadModelProviders()) {
  return providers.flatMap<ConfiguredModel>((provider) =>
    provider.enabled && provider.apiKey.trim()
      ? provider.enabledModels
          .filter((model) => provider.availableModels.includes(model))
          .map((model) => ({
          id: `${provider.id}:${model}`,
          providerId: provider.id,
          providerName: provider.name,
          model,
          protocol: provider.protocol
        }))
      : []
  );
}

export function resolveConfiguredModel(
  bindingId: string,
  providers = loadModelProviders()
) {
  const availableProviders = providers.filter(
    (provider) =>
      provider.enabled &&
      provider.apiKey.trim() &&
      provider.enabledModels.some((model) =>
        provider.availableModels.includes(model)
      )
  );
  if (!availableProviders.length) return null;

  if (bindingId === "global-default") {
    const provider =
      availableProviders.find((item) => item.isDefault) ?? availableProviders[0];
    const enabledModels = provider.enabledModels.filter((model) =>
      provider.availableModels.includes(model)
    );
    const model = enabledModels.includes(provider.model)
      ? provider.model
      : enabledModels[0];
    return { provider, model };
  }

  const separator = bindingId.indexOf(":");
  if (separator <= 0) return null;
  const providerId = bindingId.slice(0, separator);
  const model = bindingId.slice(separator + 1);
  const provider = availableProviders.find((item) => item.id === providerId);
  return provider?.availableModels.includes(model) &&
    provider.enabledModels.includes(model)
    ? { provider, model }
    : null;
}

export function modelBindingLabel(
  bindingId: string,
  providers = loadModelProviders()
) {
  if (bindingId === "global-default") return "自动选择已联通模型";
  const separator = bindingId.indexOf(":");
  if (separator <= 0) return bindingId;
  const provider = providers.find(
    (item) => item.id === bindingId.slice(0, separator)
  );
  const model = bindingId.slice(separator + 1);
  return provider ? `${provider.name} · ${model}` : model;
}
