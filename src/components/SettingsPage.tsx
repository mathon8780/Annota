import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Claude,
  DeepSeek,
  Gemini,
  Kimi,
  OpenAI,
  Zhipu
} from "@lobehub/icons";
import {
  ArchiveRestore,
  ArrowDownUp,
  BrainCircuit,
  BookOpenText,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Database,
  Eye,
  EyeOff,
  Info,
  Keyboard,
  Landmark,
  LayoutTemplate,
  Network,
  Orbit,
  Palette,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
  Sprout,
  Trash2,
  Wrench
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  codeFontOptions,
  codeFontSizes,
  interfaceFontOptions,
  interfaceFontSizes,
  loadFontPreferences,
  readingFontOptions,
  readingFontSizes,
  resolveFontStack,
  saveFontPreferences
} from "../utils/fontPreferences";
import type { FontPreferences } from "../utils/fontPreferences";
import {
  initialSystemFontCatalog,
  loadSystemFontCatalog
} from "../utils/systemFonts";
import type { SystemFontCatalog } from "../utils/systemFonts";
import {
  contentStyleDefinition,
  contentStyles,
  contentTermLabels
} from "../utils/contentDisplay";
import type {
  ContentStyleId,
  CustomContentStyle
} from "../utils/contentDisplay";
import {
  conflictingShortcut,
  formatShortcut,
  shortcutDefinitions,
  shortcutFromKeyboardEvent
} from "../utils/shortcuts";
import type {
  ShortcutActionId,
  ShortcutBinding,
  ShortcutPreferences
} from "../utils/shortcuts";
import { discoverModels } from "../utils/modelDiscovery";
import {
  BUILT_IN_MODEL_CATALOG_UPDATED_AT,
  getBuiltInModels
} from "../data/builtInModelCatalog";

interface SettingsPageProps {
  contentStyle: ContentStyleId;
  customContentStyle: CustomContentStyle;
  shortcuts: ShortcutPreferences;
  onContentStyleChange: (style: ContentStyleId) => void;
  onCustomContentStyleChange: (style: CustomContentStyle) => void;
  onShortcutChange: (
    actionId: ShortcutActionId,
    binding: ShortcutBinding
  ) => void;
  onResetShortcuts: () => void;
}

type SettingSlotSize = "compact" | "medium" | "wide";

interface SettingItem {
  label: string;
  scope: string;
  slot?: SettingSlotSize;
}

interface SettingGroup {
  title: string;
  items: SettingItem[];
}

interface SettingCategory {
  id: string;
  label: string;
  eyebrow: string;
  description: string;
  icon: LucideIcon;
  groups: SettingGroup[];
}

type ProviderTone = "cobalt" | "indigo" | "cyan" | "violet" | "slate";
type ProviderBrand =
  | "chatgpt"
  | "gemini"
  | "kimi"
  | "deepseek"
  | "claude"
  | "zhipu"
  | "custom";
type ProviderProtocol = "openai-compatible" | "anthropic-messages";

interface ModelProvider {
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
  enabled: boolean;
  isDefault: boolean;
}

type ModelCatalogStatus = "idle" | "loading" | "ready" | "error";

interface ModelCatalog {
  status: ModelCatalogStatus;
  models: string[];
  error?: string;
}

type ConnectionTestStatus = "idle" | "loading" | "success" | "error";

interface ConnectionTest {
  status: ConnectionTestStatus;
  message?: string;
}

export const MODEL_PROVIDERS_STORAGE_KEY = "annota:model-providers.v1";

const initialModelProviders: ModelProvider[] = [
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
    model: "gpt-5-mini",
    availableModels: [],
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
    model: "gemini-3.6-flash",
    availableModels: [],
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
    model: "kimi-k3",
    availableModels: [],
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
    model: "deepseek-v4-flash",
    availableModels: [],
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
    model: "claude-sonnet-5",
    availableModels: [],
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
    model: "glm-5.2",
    availableModels: [],
    enabled: false,
    isDefault: false
  },
  {
    id: "custom-1",
    name: "本地兼容接口",
    shortName: "API",
    kind: "custom",
    tone: "slate",
    brand: "custom",
    protocol: "openai-compatible",
    baseUrl: "http://127.0.0.1:11434/v1",
    modelsPath: "/models",
    endpointPath: "/chat/completions",
    apiKey: "",
    model: "",
    availableModels: [],
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

function normalizeDefaultProvider(providers: ModelProvider[]) {
  const defaultProviderId =
    providers.find((provider) => provider.isDefault)?.id ??
    initialModelProviders[0].id;
  return providers.map((provider) => ({
    ...provider,
    isDefault: provider.id === defaultProviderId
  }));
}

function loadModelProviders() {
  const fallback = initialModelProviders.map((provider) => ({ ...provider }));

  try {
    const raw = window.localStorage.getItem(MODEL_PROVIDERS_STORAGE_KEY);
    if (!raw) return fallback;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;

    const storedProviders = parsed.filter(isStoredModelProvider);
    const storedById = new Map(
      storedProviders.map((provider) => [provider.id, provider])
    );
    const builtInIds = new Set(
      initialModelProviders
        .filter((provider) => provider.kind === "default")
        .map((provider) => provider.id)
    );
    const builtInProviders = initialModelProviders
      .filter((provider) => provider.kind === "default")
      .map((provider) => {
        const stored = storedById.get(provider.id);
        if (!stored) return { ...provider };
        return {
          ...provider,
          protocol: stored.protocol,
          endpointPath: stored.endpointPath,
          apiKey: stored.apiKey,
          model: stored.model,
          availableModels: Array.isArray(stored.availableModels)
            ? stored.availableModels
            : [],
          enabled: stored.enabled,
          isDefault: stored.isDefault
        };
      });
    const customProviders = storedProviders
      .filter(
        (provider) =>
          provider.kind === "custom" && !builtInIds.has(provider.id)
      )
      .map((provider) => ({
        ...provider,
        availableModels: Array.isArray(provider.availableModels)
          ? provider.availableModels
          : []
      }));

    return normalizeDefaultProvider([...builtInProviders, ...customProviders]);
  } catch {
    return fallback;
  }
}

function saveModelProviders(providers: ModelProvider[]) {
  try {
    window.localStorage.setItem(
      MODEL_PROVIDERS_STORAGE_KEY,
      JSON.stringify(providers)
    );
  } catch {
    // Storage can be unavailable in restricted previews; keep the page usable.
  }
}

function getNextCustomProviderNumber(providers: ModelProvider[]) {
  return (
    providers.reduce((largest, provider) => {
      const match = /^custom-(\d+)$/.exec(provider.id);
      return match ? Math.max(largest, Number(match[1])) : largest;
    }, 1) + 1
  );
}

function ModelProviderMark({
  provider,
  large = false
}: {
  provider: ModelProvider;
  large?: boolean;
}) {
  const iconSize = large ? 30 : 22;
  let icon;

  switch (provider.brand) {
    case "chatgpt":
      icon = <OpenAI size={iconSize} />;
      break;
    case "gemini":
      icon = <Gemini.Color size={iconSize} />;
      break;
    case "kimi":
      icon = <Kimi.Color size={iconSize} />;
      break;
    case "deepseek":
      icon = <DeepSeek.Color size={iconSize} />;
      break;
    case "claude":
      icon = <Claude.Color size={iconSize} />;
      break;
    case "zhipu":
      icon = (
        <Zhipu.Color
          className="model-provider-brand-icon is-zhipu"
          size={iconSize}
        />
      );
      break;
    default:
      icon = provider.shortName;
  }

  return (
    <span
      className={`model-provider-mark is-${provider.tone}${
        provider.brand !== "custom" ? " has-brand" : ""
      }${large ? " is-large" : ""}`}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

const settingCategories: SettingCategory[] = [
  {
    id: "appearance",
    label: "外观与交互",
    eyebrow: "阅读体验",
    description: "调整字体、字号、标注样式与应用中的动态效果。",
    icon: Palette,
    groups: [
      {
        title: "字体",
        items: [
          { label: "界面字体", scope: "全局", slot: "wide" },
          { label: "正文字体", scope: "全局", slot: "wide" },
          { label: "代码字体", scope: "全局", slot: "wide" },
          { label: "界面字号", scope: "全局" },
          { label: "正文字号", scope: "全局" },
          { label: "代码字号", scope: "全局" }
        ]
      },
      {
        title: "阅读与标注",
        items: [
          { label: "正文行高", scope: "全局" },
          { label: "默认标注颜色", scope: "全局", slot: "compact" },
          { label: "减少动态效果", scope: "全局", slot: "compact" }
        ]
      }
    ]
  },
  {
    id: "shortcuts",
    label: "快捷键",
    eyebrow: "操作效率",
    description: "查看并管理应用中的键盘操作。",
    icon: Keyboard,
    groups: []
  },
  {
    id: "models",
    label: "AI 模型服务",
    eyebrow: "模型连接",
    description: "为模型服务配置 API Key，并检测联通状态与可用模型。",
    icon: Bot,
    groups: []
  },
  {
    id: "storage",
    label: "知识库与存储",
    eyebrow: "本地工作区",
    description: "查看当前知识库的位置、占用情况与数据健康状态。",
    icon: Database,
    groups: [
      {
        title: "当前知识库",
        items: [
          { label: "名称", scope: "当前 Vault", slot: "wide" },
          { label: "数据目录", scope: "当前 Vault", slot: "wide" },
          { label: "存储占用", scope: "当前 Vault", slot: "wide" },
          { label: "工作区状态", scope: "当前 Vault", slot: "wide" }
        ]
      },
      {
        title: "维护",
        items: [
          { label: "打开知识库目录", scope: "当前 Vault", slot: "medium" },
          { label: "检查数据完整性", scope: "当前 Vault", slot: "medium" },
          { label: "清理可重建缓存", scope: "当前 Vault", slot: "medium" }
        ]
      },
      {
        title: "路径与工作区",
        items: [
          { label: "迁移知识库位置", scope: "后续增强", slot: "wide" },
          { label: "切换或新增工作区", scope: "后续增强", slot: "wide" }
        ]
      }
    ]
  },
  {
    id: "backup",
    label: "备份与恢复",
    eyebrow: "资产保护",
    description: "规划自动备份、保留策略、校验与安全恢复流程。",
    icon: ArchiveRestore,
    groups: [
      {
        title: "自动备份",
        items: [
          { label: "启用自动备份", scope: "当前 Vault", slot: "compact" },
          { label: "备份位置", scope: "当前 Vault", slot: "wide" },
          { label: "每日备份数量", scope: "当前 Vault" },
          { label: "每周备份数量", scope: "当前 Vault" },
          { label: "清理规则", scope: "当前 Vault", slot: "wide" }
        ]
      },
      {
        title: "备份与校验",
        items: [
          { label: "立即备份", scope: "当前 Vault", slot: "medium" },
          { label: "历史备份", scope: "当前 Vault", slot: "wide" },
          { label: "验证备份完整性", scope: "单个备份", slot: "medium" }
        ]
      },
      {
        title: "恢复与敏感信息",
        items: [
          { label: "从备份恢复", scope: "单个备份", slot: "medium" },
          { label: "备份 API Key", scope: "当前 Vault", slot: "compact" },
          { label: "加密口令", scope: "当前 Vault", slot: "wide" }
        ]
      }
    ]
  },
  {
    id: "transfer",
    label: "导入、导出与迁移",
    eyebrow: "内容流转",
    description: "集中展示材料导入、知识包导出和版本迁移入口。",
    icon: ArrowDownUp,
    groups: [
      {
        title: "导入",
        items: [
          { label: "导入文本材料", scope: "当前 Vault", slot: "wide" },
          { label: "导入 .annota 包", scope: "当前 Vault", slot: "wide" },
          { label: "重复内容处理", scope: "单次导入", slot: "wide" },
          { label: "安全校验", scope: "单次导入", slot: "wide" }
        ]
      },
      {
        title: "导出",
        items: [
          { label: "导出纯文本", scope: "单次导出", slot: "wide" },
          { label: "导出 .annota v2", scope: "单次导出", slot: "wide" },
          { label: "默认导出内容", scope: "单次导出", slot: "wide" },
          { label: "包含 API Key", scope: "单次导出", slot: "compact" }
        ]
      },
      {
        title: "版本兼容",
        items: [
          { label: "数据与包格式版本", scope: "当前 Vault", slot: "wide" },
          { label: "旧版本迁移状态", scope: "当前 Vault", slot: "wide" }
        ]
      }
    ]
  },
  {
    id: "privacy",
    label: "隐私与安全",
    eyebrow: "安全边界",
    description: "明确本地数据、模型请求、密钥与诊断日志的边界。",
    icon: ShieldCheck,
    groups: [
      {
        title: "本地数据与模型请求",
        items: [
          { label: "本地优先说明", scope: "全局", slot: "wide" },
          { label: "发送内容说明", scope: "全局", slot: "wide" },
          { label: "目标服务说明", scope: "全局", slot: "wide" },
          { label: "遥测状态", scope: "全局", slot: "medium" }
        ]
      },
      {
        title: "密钥与导出",
        items: [
          { label: "已保存密钥状态", scope: "全局", slot: "wide" },
          { label: "安全存储状态", scope: "全局", slot: "wide" },
          { label: "删除全部模型密钥", scope: "全局", slot: "medium" },
          { label: "加密 secrets 规则", scope: "单次操作", slot: "wide" }
        ]
      },
      {
        title: "日志与本地清理",
        items: [
          { label: "日志隐私说明", scope: "全局", slot: "wide" },
          { label: "离开应用前确认", scope: "全局", slot: "compact" },
          { label: "清理可重建临时数据", scope: "全局", slot: "medium" }
        ]
      }
    ]
  },
  {
    id: "maintenance",
    label: "更新、诊断与关于",
    eyebrow: "应用维护",
    description: "查看应用版本、更新状态、运行环境与诊断信息。",
    icon: Wrench,
    groups: [
      {
        title: "更新",
        items: [
          { label: "自动检查更新", scope: "全局", slot: "compact" },
          { label: "检查更新", scope: "全局", slot: "medium" },
          { label: "更新通道", scope: "全局", slot: "medium" },
          { label: "更新安全", scope: "单次更新", slot: "wide" }
        ]
      },
      {
        title: "日志",
        items: [
          { label: "日志保留时间", scope: "全局", slot: "medium" },
          { label: "导出脱敏诊断日志", scope: "单次导出", slot: "medium" },
          { label: "打开日志目录", scope: "全局", slot: "medium" },
          { label: "清理诊断日志", scope: "全局", slot: "medium" }
        ]
      },
      {
        title: "诊断与关于",
        items: [
          { label: "运行环境信息", scope: "全局", slot: "wide" },
          { label: "工作区诊断", scope: "当前 Vault", slot: "wide" },
          { label: "应用版本", scope: "全局", slot: "medium" },
          { label: "许可证与第三方组件", scope: "全局", slot: "wide" }
        ]
      }
    ]
  }
];

export function SettingsPage({
  contentStyle,
  customContentStyle,
  shortcuts,
  onContentStyleChange,
  onCustomContentStyleChange,
  onShortcutChange,
  onResetShortcuts
}: SettingsPageProps) {
  const [activeCategoryId, setActiveCategoryId] = useState(
    settingCategories[0].id
  );
  const activeCategory =
    settingCategories.find((category) => category.id === activeCategoryId) ??
    settingCategories[0];
  const ActiveIcon = activeCategory.icon;
  const [fontPreferences, setFontPreferences] = useState(loadFontPreferences);
  const [fontCatalog, setFontCatalog] = useState<SystemFontCatalog>(
    initialSystemFontCatalog
  );
  const [fontQuery, setFontQuery] = useState("");

  useEffect(() => {
    saveFontPreferences(fontPreferences);
  }, [fontPreferences]);

  useEffect(() => {
    let disposed = false;
    void loadSystemFontCatalog().then((catalog) => {
      if (!disposed) setFontCatalog(catalog);
    });
    return () => {
      disposed = true;
    };
  }, []);

  const updateFontPreference = <Key extends keyof FontPreferences>(
    key: Key,
    value: FontPreferences[Key]
  ) => {
    setFontPreferences((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="home-main settings-home-main" aria-label="设置内容">
      <div className="settings-canvas">
        <aside className="settings-sidebar" aria-label="设置分类">
          <div className="settings-sidebar-intro">
            <span>SETTINGS INDEX</span>
            <p>管理 Annota 在这台设备上的阅读、模型与数据边界。</p>
          </div>
          <nav className="settings-category-list">
            {settingCategories.map((category) => {
              const Icon = category.icon;
              const isActive = category.id === activeCategory.id;
              return (
                <button
                  key={category.id}
                  className={`settings-category${isActive ? " is-active" : ""}`}
                  type="button"
                  aria-label={category.label}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setActiveCategoryId(category.id)}
                >
                  <Icon aria-hidden="true" size={17} />
                  <span>{category.label}</span>
                  <ChevronRight
                    className="settings-category-chevron"
                    aria-hidden="true"
                    size={15}
                  />
                </button>
              );
            })}
          </nav>
        </aside>

        <section
          className="settings-workspace"
          aria-labelledby={`settings-title-${activeCategory.id}`}
        >
          <div
            className={`settings-workspace-inner${
              activeCategory.id === "models" ? " is-models" : ""
            }`}
          >
            <header className="settings-section-hero">
              <div className="settings-section-icon">
                <ActiveIcon aria-hidden="true" size={21} />
              </div>
              <div>
                <span>{activeCategory.eyebrow}</span>
                <h2 id={`settings-title-${activeCategory.id}`}>
                  {activeCategory.label}
                </h2>
                <p>{activeCategory.description}</p>
              </div>
            </header>

            {activeCategory.id === "models" ? (
              <ModelProviderSettings />
            ) : activeCategory.id === "shortcuts" ? (
              <ShortcutSettings
                shortcuts={shortcuts}
                onChange={onShortcutChange}
                onReset={onResetShortcuts}
              />
            ) : (
              <>
                {activeCategory.groups.length > 0 && (
                  <div className="settings-preview-note" role="note">
                    {activeCategory.id === "appearance"
                      ? "字体与内容显示风格现已可用；阅读与标注项目仍为结构预览。"
                      : "当前项目暂为结构预览，不会更改应用数据。"}
                  </div>
                )}

                <div className="settings-groups">
                  {activeCategory.groups.map((group) => (
                    <section className="settings-group" key={group.title}>
                      <header>
                        <h3>{group.title}</h3>
                        <span>
                          {String(group.items.length).padStart(2, "0")} 项
                        </span>
                      </header>
                      {activeCategory.id === "appearance" &&
                        group.title === "字体" && (
                          <FontCatalogToolbar
                            catalog={fontCatalog}
                            query={fontQuery}
                            onQueryChange={setFontQuery}
                          />
                        )}
                      <div className="settings-group-rows">
                        {group.items.map((item) => (
                          <div
                            className={`settings-row${
                              activeCategory.id === "appearance" &&
                              group.title === "字体"
                                ? " is-functional"
                                : ""
                            }`}
                            key={item.label}
                          >
                            <div className="settings-row-copy">
                              <strong>{item.label}</strong>
                            </div>
                            {activeCategory.id === "appearance" &&
                            group.title === "字体" ? (
                              <FontControl
                                label={item.label}
                                preferences={fontPreferences}
                                systemFonts={fontCatalog.families}
                                query={fontQuery}
                                onChange={updateFontPreference}
                              />
                            ) : (
                              <div
                                className={`settings-value-slot is-${item.slot ?? "medium"}`}
                                data-setting-slot
                                aria-hidden="true"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>

                {activeCategory.id === "appearance" && (
                  <ContentStyleSettings
                    customStyle={customContentStyle}
                    value={contentStyle}
                    onChange={onContentStyleChange}
                    onCustomChange={onCustomContentStyleChange}
                  />
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

const shortcutGroupIcons: Record<
  (typeof shortcutDefinitions)[number]["group"],
  LucideIcon
> = {
  全局: Keyboard,
  阅读: BookOpenText,
  拓扑: Network
};

function ShortcutSettings({
  shortcuts,
  onChange,
  onReset
}: {
  shortcuts: ShortcutPreferences;
  onChange: (
    actionId: ShortcutActionId,
    binding: ShortcutBinding
  ) => void;
  onReset: () => void;
}) {
  const [recordingActionId, setRecordingActionId] =
    useState<ShortcutActionId | null>(null);
  const [shortcutError, setShortcutError] = useState("");
  const groups = ["全局", "阅读", "拓扑"] as const;

  const recordShortcut = (
    actionId: ShortcutActionId,
    event: ReactKeyboardEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecordingActionId(null);
      setShortcutError("");
      return;
    }
    const binding = shortcutFromKeyboardEvent(event);
    if (!binding) {
      setShortcutError("请同时按下一个非修饰键；Windows 键不可用于快捷键。");
      return;
    }
    const conflict = conflictingShortcut(shortcuts, actionId, binding);
    if (conflict) {
      setShortcutError(
        `${formatShortcut(binding)} 已用于“${conflict.label}”，请使用其他组合。`
      );
      return;
    }
    onChange(actionId, binding);
    setRecordingActionId(null);
    setShortcutError("");
  };

  return (
    <div className="shortcut-settings">
      <div className="shortcut-settings-toolbar">
        <div>
          <strong>应用快捷键</strong>
          <span>点击快捷键后，直接按下新的组合键。</span>
        </div>
        <button
          type="button"
          onClick={() => {
            onReset();
            setRecordingActionId(null);
            setShortcutError("");
          }}
        >
          <RotateCcw aria-hidden="true" size={15} />
          恢复默认
        </button>
      </div>

      <div className="shortcut-settings-note" role="note">
        <Info aria-hidden="true" size={15} />
        <span>
          此处管理应用命令；Enter、Backspace、Escape 和控件方向键保留系统标准行为。
        </span>
      </div>

      {shortcutError && (
        <div className="shortcut-settings-error" role="alert">
          {shortcutError}
        </div>
      )}

      <div className="shortcut-settings-groups">
        {groups.map((group) => {
          const GroupIcon = shortcutGroupIcons[group];
          const definitions = shortcutDefinitions.filter(
            (definition) => definition.group === group
          );
          return (
            <section className="shortcut-settings-group" key={group}>
              <header>
                <span>
                  <GroupIcon aria-hidden="true" size={17} />
                </span>
                <div>
                  <h3>{group}</h3>
                  <small>{definitions.length} 项命令</small>
                </div>
              </header>
              <div className="shortcut-settings-list">
                {definitions.map((definition) => {
                  const isRecording = recordingActionId === definition.id;
                  return (
                    <div className="shortcut-settings-row" key={definition.id}>
                      <div>
                        <strong>{definition.label}</strong>
                        <span>{definition.description}</span>
                      </div>
                      <button
                        className={`shortcut-recorder${
                          isRecording ? " is-recording" : ""
                        }`}
                        type="button"
                        aria-label={`修改快捷键：${definition.label}`}
                        aria-pressed={isRecording}
                        onClick={() => {
                          setRecordingActionId(definition.id);
                          setShortcutError("");
                        }}
                        onBlur={() =>
                          setRecordingActionId((current) =>
                            current === definition.id ? null : current
                          )
                        }
                        onKeyDown={(event) =>
                          isRecording &&
                          recordShortcut(definition.id, event)
                        }
                      >
                        <kbd>
                          {isRecording
                            ? "请按下新组合键"
                            : formatShortcut(shortcuts[definition.id])}
                        </kbd>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

const contentStyleIcons: Record<ContentStyleId, LucideIcon> = {
  traditional: LayoutTemplate,
  "digital-garden": Sprout,
  "cognitive-neural": BrainCircuit,
  "cosmic-atlas": Orbit,
  "academic-curation": Landmark,
  custom: Plus
};

function ContentStyleSettings({
  customStyle,
  value,
  onChange,
  onCustomChange
}: {
  customStyle: CustomContentStyle;
  value: ContentStyleId;
  onChange: (style: ContentStyleId) => void;
  onCustomChange: (style: CustomContentStyle) => void;
}) {
  const activeStyle = contentStyleDefinition(value, customStyle);
  const ActiveStyleIcon = contentStyleIcons[activeStyle.id];

  return (
    <section
      className="settings-content-style"
      aria-labelledby="content-style-title"
    >
      <header>
        <div>
          <span>内容显示</span>
          <h3 id="content-style-title">风格切换</h3>
        </div>
        <small>当前：{activeStyle.name}</small>
      </header>

      <div className="content-style-layout">
        <div
          className="content-style-options"
          role="radiogroup"
          aria-label="内容显示风格"
        >
          {contentStyles.map((style) => {
            const StyleIcon = contentStyleIcons[style.id];
            const isSelected = style.id === value;
            return (
              <label
                className={`content-style-option${
                  isSelected ? " is-selected" : ""
                }`}
                key={style.id}
              >
                <input
                  type="radio"
                  name="content-style"
                  value={style.id}
                  checked={isSelected}
                  onChange={() => onChange(style.id)}
                />
                <span className="content-style-option-icon">
                  <StyleIcon aria-hidden="true" size={18} />
                </span>
                <span className="content-style-option-copy">
                  <strong>{style.name}</strong>
                  <small>{style.englishName}</small>
                </span>
                <Check
                  className="content-style-option-check"
                  aria-hidden="true"
                  size={16}
                />
              </label>
            );
          })}
          <label
            className={`content-style-option is-custom${
              value === "custom" ? " is-selected" : ""
            }`}
          >
            <input
              type="radio"
              name="content-style"
              value="custom"
              checked={value === "custom"}
              aria-label="添加并使用自定义风格"
              onChange={() => onChange("custom")}
            />
            <span className="content-style-option-icon">
              <Plus aria-hidden="true" size={18} />
            </span>
            <span className="content-style-option-copy">
              <strong>
                {customStyle.name.trim() || "自定义风格"}
              </strong>
              <small>Custom</small>
            </span>
            <Check
              className="content-style-option-check"
              aria-hidden="true"
              size={16}
            />
          </label>
        </div>

        <div className="content-style-preview" aria-live="polite">
          <header>
            <span className="content-style-preview-icon">
              <ActiveStyleIcon aria-hidden="true" size={21} />
            </span>
            <div>
              <span>当前风格</span>
              <h4>{activeStyle.name}</h4>
            </div>
          </header>
          <p>{activeStyle.description}</p>
          {value === "custom" ? (
            <div className="content-style-custom-form">
              <label className="content-style-name-field">
                <span>风格名称</span>
                <input
                  value={customStyle.name}
                  aria-label="自定义风格名称"
                  placeholder="例如：我的工作台"
                  onChange={(event) =>
                    onCustomChange({
                      ...customStyle,
                      name: event.target.value
                    })
                  }
                />
              </label>
              <div className="content-style-custom-terms">
                {contentTermLabels.map(({ key, label }) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      value={customStyle.terms[key]}
                      aria-label={`自定义${label}表述`}
                      placeholder={contentStyles[0].terms[key]}
                      onChange={(event) =>
                        onCustomChange({
                          ...customStyle,
                          terms: {
                            ...customStyle.terms,
                            [key]: event.target.value
                          }
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <small className="content-style-custom-hint">
                留空的项目会使用传统模式表述；修改会即时应用。
              </small>
            </div>
          ) : (
            <dl>
              {contentTermLabels.map(({ key, label }) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{activeStyle.terms[key]}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </section>
  );
}

function ModelProviderSettings() {
  const [providers, setProviders] = useState(loadModelProviders);
  const [selectedProviderId, setSelectedProviderId] = useState("chatgpt");
  const [showApiKey, setShowApiKey] = useState(false);
  const [nextCustomProviderNumber, setNextCustomProviderNumber] = useState(
    () => getNextCustomProviderNumber(providers)
  );
  const [modelCatalogs, setModelCatalogs] = useState<
    Record<string, ModelCatalog>
  >({});
  const [connectionTests, setConnectionTests] = useState<
    Record<string, ConnectionTest>
  >({});
  const [openModelPickerId, setOpenModelPickerId] = useState<string | null>(
    null
  );
  const [modelQuery, setModelQuery] = useState("");
  const modelRequestIds = useRef<Record<string, number>>({});
  const connectionRequestIds = useRef<Record<string, number>>({});
  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ??
    providers[0];
  const selectedCatalog = modelCatalogs[selectedProvider.id] ?? {
    status: "idle",
    models: []
  };
  const selectedBuiltInModels = getBuiltInModels(selectedProvider.id);
  const hasApiKey = Boolean(selectedProvider.apiKey.trim());
  const activeCatalogModels =
    selectedCatalog.status === "ready" && selectedCatalog.models.length > 0
      ? selectedCatalog.models
      : selectedBuiltInModels;
  const selectableModels = Array.from(
    new Set(
      [...activeCatalogModels, selectedProvider.model].filter(Boolean)
    )
  );
  const normalizedModelQuery = modelQuery.trim().toLocaleLowerCase("en-US");
  const filteredModels = selectableModels.filter((model) =>
    model.toLocaleLowerCase("en-US").includes(normalizedModelQuery)
  );
  const modelPickerOpen = openModelPickerId === selectedProvider.id;
  const selectedConnectionTest = connectionTests[selectedProvider.id] ?? {
    status: "idle"
  };
  const connectionTestLabel =
    selectedConnectionTest.status === "loading"
      ? "正在测试"
      : selectedConnectionTest.status === "success"
        ? "连接正常"
        : selectedConnectionTest.status === "error"
          ? "连接失败"
          : "测试连接";
  const modelCatalogMessage =
    selectedCatalog.status === "loading"
      ? "正在读取服务商的云端模型列表…"
      : selectedCatalog.status === "ready"
        ? selectedCatalog.models.length > 0
          ? `云端返回 ${selectedCatalog.models.length} 个可用模型`
          : `云端未返回模型，继续显示 ${selectedBuiltInModels.length} 个内置模型`
        : selectedCatalog.status === "error"
          ? `${selectedCatalog.error ?? "模型列表读取失败"}；继续显示 ${
              selectedBuiltInModels.length
            } 个内置模型`
          : selectedBuiltInModels.length > 0
            ? `内置目录（${BUILT_IN_MODEL_CATALOG_UPDATED_AT}），共 ${selectedBuiltInModels.length} 个模型；填写 API Key 后可读取云端列表`
            : hasApiKey
              ? "展开后读取云端模型列表"
              : "暂无内置目录；填写 API Key 后可读取云端列表，也可输入自定义模型 ID";
  const defaultProviders = providers.filter(
    (provider) => provider.kind === "default"
  );
  const customProviders = providers.filter(
    (provider) => provider.kind === "custom"
  );

  useEffect(() => {
    saveModelProviders(providers);
  }, [providers]);

  const resetConnectionTest = (providerId: string) => {
    connectionRequestIds.current[providerId] =
      (connectionRequestIds.current[providerId] ?? 0) + 1;
    setConnectionTests((current) => ({
      ...current,
      [providerId]: { status: "idle" }
    }));
  };

  const updateProvider = (
    providerId: string,
    patch: Partial<ModelProvider>
  ) => {
    if (
      "baseUrl" in patch ||
      "modelsPath" in patch ||
      "apiKey" in patch ||
      "protocol" in patch
    ) {
      resetConnectionTest(providerId);
    }
    setProviders((current) =>
      current.map((provider) => {
        if (patch.isDefault && provider.id !== providerId) {
          return { ...provider, isDefault: false };
        }
        return provider.id === providerId ? { ...provider, ...patch } : provider;
      })
    );
  };

  const resetModelCatalog = (providerId: string) => {
    modelRequestIds.current[providerId] =
      (modelRequestIds.current[providerId] ?? 0) + 1;
    setModelCatalogs((current) => ({
      ...current,
      [providerId]: { status: "idle", models: [] }
    }));
    setOpenModelPickerId((current) =>
      current === providerId ? null : current
    );
  };

  const loadProviderModels = async (provider: ModelProvider) => {
    if (!provider.apiKey.trim()) {
      setModelCatalogs((current) => ({
        ...current,
        [provider.id]: { status: "idle", models: [] }
      }));
      return;
    }

    const requestId = (modelRequestIds.current[provider.id] ?? 0) + 1;
    modelRequestIds.current[provider.id] = requestId;
    setModelCatalogs((current) => ({
      ...current,
      [provider.id]: {
        status: "loading",
        models: current[provider.id]?.models ?? []
      }
    }));

    try {
      const models = await discoverModels({
        baseUrl: provider.baseUrl,
        modelsPath: provider.modelsPath,
        apiKey: provider.apiKey,
        protocol: provider.protocol
      });
      if (modelRequestIds.current[provider.id] !== requestId) return;
      setModelCatalogs((current) => ({
        ...current,
        [provider.id]: { status: "ready", models }
      }));
    } catch (error) {
      if (modelRequestIds.current[provider.id] !== requestId) return;
      setModelCatalogs((current) => ({
        ...current,
        [provider.id]: {
          status: "error",
          models: current[provider.id]?.models ?? [],
          error: error instanceof Error ? error.message : String(error)
        }
      }));
    }
  };

  const testProviderConnection = async (provider: ModelProvider) => {
    const requestId = (connectionRequestIds.current[provider.id] ?? 0) + 1;
    connectionRequestIds.current[provider.id] = requestId;
    setConnectionTests((current) => ({
      ...current,
      [provider.id]: { status: "loading" }
    }));

    try {
      const models = await discoverModels({
        baseUrl: provider.baseUrl,
        modelsPath: provider.modelsPath,
        apiKey: provider.apiKey,
        protocol: provider.protocol
      });
      if (connectionRequestIds.current[provider.id] !== requestId) return;

      setModelCatalogs((current) => ({
        ...current,
        [provider.id]: { status: "ready", models }
      }));
      updateProvider(provider.id, {
        availableModels: models,
        model: models.includes(provider.model) ? provider.model : models[0]
      });
      setConnectionTests((current) => ({
        ...current,
        [provider.id]: {
          status: "success",
          message: `已连接，发现 ${models.length} 个可用模型`
        }
      }));
    } catch (error) {
      if (connectionRequestIds.current[provider.id] !== requestId) return;
      updateProvider(provider.id, {
        availableModels: [],
        model: ""
      });
      setConnectionTests((current) => ({
        ...current,
        [provider.id]: {
          status: "error",
          message: error instanceof Error ? error.message : String(error)
        }
      }));
    }
  };

  const toggleModelPicker = () => {
    if (modelPickerOpen) {
      setOpenModelPickerId(null);
      return;
    }

    setOpenModelPickerId(selectedProvider.id);
    setModelQuery("");
    if (
      hasApiKey &&
      selectedCatalog.status !== "loading" &&
      selectedCatalog.status !== "ready"
    ) {
      void loadProviderModels(selectedProvider);
    }
  };

  const chooseModel = (model: string) => {
    updateProvider(selectedProvider.id, { model });
    setOpenModelPickerId(null);
    setModelQuery("");
  };

  const addCustomProvider = () => {
    const id = `custom-${nextCustomProviderNumber}`;
    const customProvider: ModelProvider = {
      id,
      name: `自定义服务 ${nextCustomProviderNumber}`,
      shortName: "API",
      kind: "custom",
      tone: "slate",
      brand: "custom",
      protocol: "openai-compatible",
      baseUrl: "",
      modelsPath: "/models",
      endpointPath: "/chat/completions",
      apiKey: "",
      model: "",
      availableModels: [],
      enabled: false,
      isDefault: false
    };
    setProviders((current) => [...current, customProvider]);
    setNextCustomProviderNumber((current) => current + 1);
    setSelectedProviderId(id);
    setShowApiKey(false);
  };

  const removeSelectedProvider = () => {
    if (selectedProvider.kind !== "custom") return;
    setProviders((current) =>
      current.filter((provider) => provider.id !== selectedProvider.id)
    );
    setSelectedProviderId(defaultProviders[0].id);
    setShowApiKey(false);
  };

  const renderProviderList = (
    title: string,
    providerList: ModelProvider[],
    allowAdd = false
  ) => (
    <section className="model-provider-section">
      <header>
        <span>{title}</span>
        {false && allowAdd && (
          <button
            className="model-provider-add"
            type="button"
            aria-label="添加自定义服务商"
            onClick={addCustomProvider}
          >
            <Plus aria-hidden="true" size={14} />
            添加
          </button>
        )}
      </header>
      <div className="model-provider-list">
        {providerList.map((provider) => {
          const isSelected = provider.id === selectedProvider.id;
          return (
            <div
              className={`model-provider-item${isSelected ? " is-selected" : ""}`}
              key={provider.id}
            >
              <button
                className="model-provider-select"
                type="button"
                aria-label={`配置 ${provider.name}`}
                aria-current={isSelected ? "page" : undefined}
                onClick={() => {
                  setSelectedProviderId(provider.id);
                  setShowApiKey(false);
                  setOpenModelPickerId(null);
                  setModelQuery("");
                }}
              >
                <ModelProviderMark provider={provider} />
                <span className="model-provider-copy">
                  <strong>{provider.name}</strong>
                  <small>
                    {provider.isDefault
                      ? "当前默认"
                      : provider.apiKey
                        ? "密钥已填写"
                        : "等待配置"}
                  </small>
                </span>
              </button>
              {false && <label className="model-provider-switch">
                <span className="sr-only">启用 {provider.name}</span>
                <input
                  type="checkbox"
                  checked={provider.enabled}
                  onChange={(event) =>
                    updateProvider(provider.id, {
                      enabled: event.target.checked
                    })
                  }
                />
                <span aria-hidden="true" />
              </label>}
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="model-provider-layout">
      <aside className="model-provider-rail" aria-label="模型服务列表">
        <div className="model-provider-rail-intro">
          <Server aria-hidden="true" size={16} />
          <div>
            <h3>模型服务列表</h3>
            <p>选择服务商，填写 API Key 并检测可用模型。</p>
          </div>
        </div>
        {renderProviderList("默认服务商", defaultProviders)}
        {renderProviderList("自定义服务商", customProviders, true)}
      </aside>

      <section
        className="model-provider-detail"
        aria-labelledby="model-provider-detail-title"
      >
        <header className="model-provider-detail-header">
          <ModelProviderMark provider={selectedProvider} large />
          <div>
            <div className="model-provider-title-line">
              <h3 id="model-provider-detail-title">{selectedProvider.name}</h3>
              <span>
                {selectedProvider.kind === "default" ? "内置服务" : "自定义服务"}
              </span>
            </div>
            <p>API Key 仅用于检测联通并执行阅读页生成。</p>
          </div>
          <button
            className={`model-provider-test is-${selectedConnectionTest.status}`}
            type="button"
            aria-label={`${connectionTestLabel}${
              selectedConnectionTest.message
                ? `：${selectedConnectionTest.message}`
                : ""
            }`}
            disabled={
              !selectedProvider.apiKey.trim() ||
              selectedConnectionTest.status === "loading"
            }
            title={
              !selectedProvider.apiKey.trim()
                ? "请先填写 API Key"
                : selectedConnectionTest.message ??
                  "使用模型列表接口测试连通性与鉴权"
            }
            onClick={() => void testProviderConnection(selectedProvider)}
          >
            {selectedConnectionTest.status === "loading" ? (
              <RefreshCw aria-hidden="true" className="is-spinning" size={15} />
            ) : selectedConnectionTest.status === "success" ? (
              <Check aria-hidden="true" size={15} />
            ) : selectedConnectionTest.status === "error" ? (
              <CircleAlert aria-hidden="true" size={15} />
            ) : (
              <Radio aria-hidden="true" size={15} />
            )}
            <span aria-live="polite">{connectionTestLabel}</span>
          </button>
        </header>

        <form className="model-provider-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset className="model-provider-key-only">
            <legend>API Key</legend>
            <label className="model-field is-wide">
              <span>API Key</span>
              <span className="model-secret-input">
                <input
                  aria-label="API Key"
                  type={showApiKey ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  value={selectedProvider.apiKey}
                  placeholder={`输入 ${selectedProvider.name} API Key`}
                  onChange={(event) => {
                    updateProvider(selectedProvider.id, {
                      apiKey: event.target.value,
                      availableModels: [],
                      model: ""
                    });
                    resetModelCatalog(selectedProvider.id);
                  }}
                />
                <button
                  type="button"
                  aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                  onClick={() => setShowApiKey((current) => !current)}
                >
                  {showApiKey ? (
                    <EyeOff aria-hidden="true" size={16} />
                  ) : (
                    <Eye aria-hidden="true" size={16} />
                  )}
                </button>
              </span>
              <small>
                密钥保存在当前设备；测试成功后，可用模型会同步到“生成与提示词”。
              </small>
            </label>
          </fieldset>

          {false && (
          <>
          <fieldset>
            <legend>服务身份</legend>
            <div className="model-provider-form-grid">
              <label className="model-field">
                <span>服务名称</span>
                <input
                  aria-label="服务名称"
                  value={selectedProvider.name}
                  readOnly={selectedProvider.kind === "default"}
                  onChange={(event) =>
                    updateProvider(selectedProvider.id, {
                      name: event.target.value
                    })
                  }
                />
                <small>
                  {selectedProvider.kind === "default"
                    ? "内置服务名称保持固定"
                    : "用于在服务商列表中识别这套接口"}
                </small>
              </label>

              <label className="model-field">
                <span>接口协议</span>
                <select
                  aria-label="接口协议"
                  value={selectedProvider.protocol}
                  onChange={(event) => {
                    const protocol = event.target.value as ProviderProtocol;
                    updateProvider(selectedProvider.id, {
                      protocol,
                      endpointPath:
                        protocol === "anthropic-messages"
                          ? "/messages"
                          : "/chat/completions"
                    });
                    resetModelCatalog(selectedProvider.id);
                  }}
                >
                  <option value="openai-compatible">OpenAI Compatible</option>
                  <option value="anthropic-messages">Anthropic Messages</option>
                </select>
                <small>
                  {selectedProvider.protocol === "anthropic-messages"
                    ? "Claude 官方接口使用 Messages 请求格式"
                    : "使用兼容的 Chat Completions 请求格式"}
                </small>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>接口定义</legend>
            <div className="model-provider-form-grid model-provider-address-grid">
              <label className="model-field">
                <span>Base URL</span>
                <input
                  aria-label="Base URL"
                  type="url"
                  spellCheck={false}
                  readOnly={selectedProvider.kind === "default"}
                  value={selectedProvider.baseUrl}
                  placeholder="https://api.example.com/v1"
                  onChange={(event) => {
                    updateProvider(selectedProvider.id, {
                      baseUrl: event.target.value
                    });
                    resetModelCatalog(selectedProvider.id);
                  }}
                />
                <small>
                  {selectedProvider.kind === "default"
                    ? "默认服务商地址由应用内置"
                    : "填写 API 根地址，不包含具体请求路径"}
                </small>
              </label>

              <div className="model-field">
                <label htmlFor={`models-path-${selectedProvider.id}`}>
                  模型列表地址
                </label>
                <input
                  id={`models-path-${selectedProvider.id}`}
                  aria-label="模型列表地址"
                  type="text"
                  spellCheck={false}
                  readOnly={selectedProvider.kind === "default"}
                  value={selectedProvider.modelsPath}
                  placeholder="/models 或完整 URL"
                  onChange={(event) => {
                    updateProvider(selectedProvider.id, {
                      modelsPath: event.target.value
                    });
                    resetModelCatalog(selectedProvider.id);
                  }}
                />
                <small>
                  {selectedProvider.kind === "default"
                    ? "默认服务商模型目录地址由应用内置"
                    : "支持相对路径或完整 URL"}
                </small>
              </div>
            </div>

            <div className="model-provider-form-grid">
              <label className="model-field">
                <span>请求路径</span>
                <input
                  aria-label="请求路径"
                  spellCheck={false}
                  readOnly={selectedProvider.kind === "default"}
                  value={selectedProvider.endpointPath}
                  onChange={(event) =>
                    updateProvider(selectedProvider.id, {
                      endpointPath: event.target.value
                    })
                  }
                />
                <small>
                  {selectedProvider.protocol === "anthropic-messages"
                    ? "Anthropic Messages 默认使用 /messages"
                    : "默认使用 /chat/completions"}
                </small>
              </label>

              <div className="model-field">
                <label htmlFor={`default-model-${selectedProvider.id}`}>
                  使用模型
                </label>
                <div
                  className={`model-picker${modelPickerOpen ? " is-open" : ""}`}
                  onBlur={(event) => {
                    if (
                      !event.currentTarget.contains(
                        event.relatedTarget as Node | null
                      )
                    ) {
                      setOpenModelPickerId(null);
                      setModelQuery("");
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setOpenModelPickerId(null);
                      setModelQuery("");
                    }
                  }}
                >
                  <button
                    id={`default-model-${selectedProvider.id}`}
                    className="model-picker-trigger"
                    type="button"
                    role="combobox"
                    aria-label="使用模型"
                    aria-expanded={modelPickerOpen}
                    aria-controls={`model-options-${selectedProvider.id}`}
                    aria-haspopup="listbox"
                    onClick={toggleModelPicker}
                  >
                    <span
                      className={
                        selectedProvider.model ? undefined : "is-placeholder"
                      }
                    >
                      {selectedProvider.model || "选择服务商模型"}
                    </span>
                    {modelPickerOpen &&
                    selectedCatalog.status === "loading" ? (
                      <RefreshCw
                        aria-hidden="true"
                        className="is-spinning"
                        size={16}
                      />
                    ) : (
                      <ChevronDown aria-hidden="true" size={16} />
                    )}
                  </button>

                  {modelPickerOpen && (
                    <div className="model-picker-popover">
                      <div className="model-picker-status">
                        <span
                          className={`is-${selectedCatalog.status}`}
                          role={
                            selectedCatalog.status === "error"
                              ? "alert"
                              : "status"
                          }
                        >
                          {modelCatalogMessage}
                        </span>
                        <button
                          type="button"
                          aria-label={`刷新 ${selectedProvider.name} 模型列表`}
                          title={
                            hasApiKey
                              ? "重新读取云端模型列表"
                              : "填写 API Key 后可读取云端模型列表"
                          }
                          disabled={
                            selectedCatalog.status === "loading" || !hasApiKey
                          }
                          onClick={() =>
                            void loadProviderModels(selectedProvider)
                          }
                        >
                          <RefreshCw
                            aria-hidden="true"
                            className={
                              selectedCatalog.status === "loading"
                                ? "is-spinning"
                                : undefined
                            }
                            size={14}
                          />
                        </button>
                      </div>

                      <label className="model-picker-search">
                        <Search aria-hidden="true" size={14} />
                        <span className="sr-only">搜索或输入模型 ID</span>
                        <input
                          aria-label="搜索或输入模型 ID"
                          autoComplete="off"
                          spellCheck={false}
                          value={modelQuery}
                          placeholder="搜索或输入模型 ID"
                          onChange={(event) =>
                            setModelQuery(event.target.value)
                          }
                        />
                      </label>

                      <div
                        id={`model-options-${selectedProvider.id}`}
                        className="model-picker-options"
                        role="listbox"
                        aria-label={`${selectedProvider.name} 可用模型`}
                      >
                        {filteredModels.map((model) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={model === selectedProvider.model}
                            key={model}
                            onClick={() => chooseModel(model)}
                          >
                            <span>{model}</span>
                            {model === selectedProvider.model && (
                              <Check aria-hidden="true" size={14} />
                            )}
                          </button>
                        ))}
                        {selectedCatalog.status !== "loading" &&
                          filteredModels.length === 0 && (
                            <div className="model-picker-empty">
                              没有匹配的模型，可以直接使用输入的模型 ID。
                            </div>
                          )}
                      </div>

                      {modelQuery.trim() &&
                        !selectableModels.some(
                          (model) =>
                            model.toLocaleLowerCase("en-US") ===
                            normalizedModelQuery
                        ) && (
                          <button
                            className="model-picker-custom"
                            type="button"
                            onClick={() => chooseModel(modelQuery.trim())}
                          >
                            使用自定义模型 ID
                            <strong>{modelQuery.trim()}</strong>
                          </button>
                        )}
                    </div>
                  )}
                </div>
                <small>
                  无 API Key 时使用内置目录；填写后展开会读取云端列表，也可输入自定义模型 ID
                </small>
              </div>
            </div>

            <label className="model-field is-wide">
              <span>API Key</span>
              <span className="model-secret-input">
                <input
                  aria-label="API Key"
                  type={showApiKey ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  value={selectedProvider.apiKey}
                  placeholder="输入服务商密钥"
                  onChange={(event) => {
                    updateProvider(selectedProvider.id, {
                      apiKey: event.target.value
                    });
                    resetModelCatalog(selectedProvider.id);
                  }}
                />
                <button
                  type="button"
                  aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                  onClick={() => setShowApiKey((current) => !current)}
                >
                  {showApiKey ? (
                    <EyeOff aria-hidden="true" size={16} />
                  ) : (
                    <Eye aria-hidden="true" size={16} />
                  )}
                </button>
              </span>
              <small>正式实现将交由 Windows 安全存储管理</small>
            </label>
          </fieldset>

          <fieldset className="model-provider-behavior">
            <legend>服务行为</legend>
            <label className="model-provider-check">
              <input
                type="checkbox"
                checked={selectedProvider.enabled}
                onChange={(event) =>
                  updateProvider(selectedProvider.id, {
                    enabled: event.target.checked
                  })
                }
              />
              <span>
                <strong>启用此服务</strong>
                <small>关闭后不会出现在生成动作的可用服务列表中</small>
              </span>
            </label>
            <label className="model-provider-check">
              <input
                type="checkbox"
                checked={selectedProvider.isDefault}
                onChange={(event) =>
                  updateProvider(selectedProvider.id, {
                    isDefault: event.target.checked
                  })
                }
              />
              <span>
                <strong>设为默认服务</strong>
                <small>未指定服务商的生成动作将使用它</small>
              </span>
            </label>
          </fieldset>
          </>
          )}
        </form>

        {false && selectedProvider.kind === "custom" && (
          <div className="model-provider-danger">
            <div>
              <strong>移除自定义服务</strong>
              <span>只移除此页面中的临时配置。</span>
            </div>
            <button type="button" onClick={removeSelectedProvider}>
              <Trash2 aria-hidden="true" size={15} />
              删除服务
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function FontControl({
  label,
  preferences,
  systemFonts,
  query,
  onChange
}: {
  label: string;
  preferences: FontPreferences;
  systemFonts: string[];
  query: string;
  onChange: <Key extends keyof FontPreferences>(
    key: Key,
    value: FontPreferences[Key]
  ) => void;
}) {
  if (label === "界面字体") {
    const options = createFontChoices(
      interfaceFontOptions,
      systemFonts,
      query,
      preferences.interfaceFamily
    );
    return (
      <select
        className="settings-font-control"
        aria-label={label}
        value={preferences.interfaceFamily}
        onChange={(event) =>
          onChange(
            "interfaceFamily",
            event.target.value as FontPreferences["interfaceFamily"]
          )
        }
      >
        {options.map((option) => (
          <option
            key={option.id}
            value={option.id}
            style={{ fontFamily: option.stack }}
          >
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (label === "正文字体") {
    const options = createFontChoices(
      readingFontOptions,
      systemFonts,
      query,
      preferences.readingFamily
    );
    return (
      <select
        className="settings-font-control"
        aria-label={label}
        value={preferences.readingFamily}
        onChange={(event) =>
          onChange(
            "readingFamily",
            event.target.value as FontPreferences["readingFamily"]
          )
        }
      >
        {options.map((option) => (
          <option
            key={option.id}
            value={option.id}
            style={{ fontFamily: option.stack }}
          >
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (label === "代码字体") {
    const options = createFontChoices(
      codeFontOptions,
      systemFonts,
      query,
      preferences.codeFamily
    );
    return (
      <select
        className="settings-font-control is-mono"
        aria-label={label}
        value={preferences.codeFamily}
        onChange={(event) =>
          onChange(
            "codeFamily",
            event.target.value as FontPreferences["codeFamily"]
          )
        }
      >
        {options.map((option) => (
          <option
            key={option.id}
            value={option.id}
            style={{ fontFamily: option.stack }}
          >
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  const sizeConfig = {
    界面字号: {
      key: "interfaceSize",
      value: preferences.interfaceSize,
      options: interfaceFontSizes
    },
    正文字号: {
      key: "readingSize",
      value: preferences.readingSize,
      options: readingFontSizes
    },
    代码字号: {
      key: "codeSize",
      value: preferences.codeSize,
      options: codeFontSizes
    }
  } as const;
  const config = sizeConfig[label as keyof typeof sizeConfig];

  if (!config) return null;

  return (
    <select
      className="settings-font-control is-size"
      aria-label={label}
      value={config.value}
      onChange={(event) =>
        onChange(
          config.key,
          Number(event.target.value) as FontPreferences[typeof config.key]
        )
      }
    >
      {config.options.map((size) => (
        <option key={size} value={size}>{size} px</option>
      ))}
    </select>
  );
}

function FontCatalogToolbar({
  catalog,
  query,
  onQueryChange
}: {
  catalog: SystemFontCatalog;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const status =
    catalog.source === "loading"
      ? "正在读取系统字体"
      : catalog.source === "system"
        ? `${catalog.families.length} 个系统字体`
        : catalog.source === "error"
          ? "读取失败，使用内置字体"
          : "浏览器预览使用内置字体";

  return (
    <div className="settings-font-catalog">
      <label>
        <Search aria-hidden="true" size={15} />
        <span className="sr-only">筛选系统字体</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="筛选系统字体"
          disabled={catalog.source !== "system"}
        />
      </label>
      <span
        className={`settings-font-source is-${catalog.source}`}
        title={catalog.error}
      >
        <span aria-hidden="true" />
        {status}
      </span>
    </div>
  );
}

function createFontChoices(
  presets: readonly { id: string; label: string; stack: string }[],
  systemFonts: string[],
  query: string,
  selectedId: string
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const presetLabels = new Set(
    presets.map((option) => option.label.toLocaleLowerCase("zh-CN"))
  );
  const systemChoices = systemFonts
    .filter((family) => !presetLabels.has(family.toLocaleLowerCase("zh-CN")))
    .filter(
      (family) =>
        !normalizedQuery ||
        family.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
    )
    .map((family) => {
      const id = `system:${family}`;
      return {
        id,
        label: family,
        stack: resolveFontStack(presets, id)
      };
    });

  if (
    selectedId.startsWith("system:") &&
    !systemChoices.some((option) => option.id === selectedId)
  ) {
    const family = selectedId.slice("system:".length);
    systemChoices.unshift({
      id: selectedId,
      label: family,
      stack: resolveFontStack(presets, selectedId)
    });
  }

  return [...presets, ...systemChoices];
}
