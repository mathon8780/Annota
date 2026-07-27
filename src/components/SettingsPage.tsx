import { useEffect, useState } from "react";
import {
  ArchiveRestore,
  ArrowDownUp,
  ArrowLeft,
  Bot,
  ChevronRight,
  Database,
  Info,
  Palette,
  Search,
  Settings2,
  ShieldCheck,
  WandSparkles,
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

interface SettingsPageProps {
  onBack: () => void;
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
      },
      {
        title: "快捷键",
        items: [
          { label: "快捷键一览", scope: "全局", slot: "wide" },
          { label: "自定义快捷键", scope: "后续增强", slot: "wide" }
        ]
      }
    ]
  },
  {
    id: "models",
    label: "AI 模型服务",
    eyebrow: "模型连接",
    description: "管理由你提供密钥的 OpenAI Compatible 模型服务。",
    icon: Bot,
    groups: [
      {
        title: "服务",
        items: [
          { label: "模型服务列表", scope: "全局", slot: "wide" },
          { label: "服务名称", scope: "单个 Provider", slot: "wide" },
          { label: "服务类型", scope: "单个 Provider", slot: "wide" },
          { label: "默认模型服务", scope: "全局", slot: "wide" }
        ]
      },
      {
        title: "连接",
        items: [
          { label: "Base URL", scope: "单个 Provider", slot: "wide" },
          { label: "API Key", scope: "单个 Provider", slot: "wide" },
          { label: "模型名称", scope: "单个 Provider", slot: "wide" },
          { label: "测试连接", scope: "单个 Provider", slot: "medium" }
        ]
      },
      {
        title: "默认参数",
        items: [
          { label: "Temperature", scope: "单个 Provider" },
          { label: "最大输出 Token", scope: "单个 Provider" },
          { label: "请求超时", scope: "单个 Provider" },
          { label: "最大并发生成数", scope: "全局", slot: "compact" },
          { label: "自动重试规则", scope: "全局", slot: "wide" }
        ]
      },
      {
        title: "服务管理",
        items: [
          { label: "复制服务配置", scope: "单个 Provider", slot: "medium" },
          { label: "删除服务", scope: "单个 Provider", slot: "medium" }
        ]
      }
    ]
  },
  {
    id: "generation",
    label: "生成类型与提示词",
    eyebrow: "生成动作",
    description: "组织解释、翻译与自定义动作的外观、语义和提示词。",
    icon: WandSparkles,
    groups: [
      {
        title: "类型列表",
        items: [
          { label: "内置类型", scope: "全局", slot: "wide" },
          { label: "自定义类型", scope: "全局", slot: "wide" },
          { label: "动作栏顺序", scope: "全局", slot: "wide" },
          { label: "显示在动作栏", scope: "单个生成类型", slot: "compact" }
        ]
      },
      {
        title: "基本信息与语义",
        items: [
          { label: "名称", scope: "单个生成类型", slot: "wide" },
          { label: "图标", scope: "单个生成类型", slot: "compact" },
          { label: "颜色", scope: "单个生成类型", slot: "compact" },
          { label: "关系语义", scope: "单个生成类型", slot: "wide" },
          { label: "分类信息", scope: "单个生成类型", slot: "wide" }
        ]
      },
      {
        title: "提示词",
        items: [
          { label: "提示词模板", scope: "单个类型版本", slot: "wide" },
          { label: "可用上下文说明", scope: "单个生成类型", slot: "wide" },
          { label: "输出预览", scope: "单个生成类型", slot: "wide" }
        ]
      },
      {
        title: "恢复与迁移",
        items: [
          { label: "恢复内置默认", scope: "单个内置类型", slot: "medium" },
          { label: "复制类型", scope: "单个生成类型", slot: "medium" },
          { label: "删除自定义类型", scope: "单个生成类型", slot: "medium" },
          { label: "导入或导出模板", scope: "全局", slot: "wide" }
        ]
      }
    ]
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

export function SettingsPage({ onBack }: SettingsPageProps) {
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
    <>
      <header className="home-topbar settings-home-topbar">
        <button className="settings-back-button" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={16} />
          返回主页
        </button>
        <div className="settings-heading">
          <Settings2 aria-hidden="true" size={17} />
          <h1>设置</h1>
        </div>
      </header>

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
          <div className="settings-local-note">
            <ShieldCheck aria-hidden="true" size={17} />
            <span>
              <strong>保存在本机</strong>
              字体偏好会即时应用，并保存在当前设备
            </span>
          </div>
        </aside>

        <section
          className="settings-workspace"
          aria-labelledby={`settings-title-${activeCategory.id}`}
        >
          <div className="settings-workspace-inner">
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
              <div className="settings-display-badge">
                <Info aria-hidden="true" size={14} />
                {activeCategory.id === "appearance" ? "字体已启用" : "页面展示"}
              </div>
            </header>

            <div className="settings-preview-note" role="note">
              字体设置现已可用；其他项目暂为结构预览，不会更改应用数据。
            </div>

            <div className="settings-groups">
              {activeCategory.groups.map((group) => (
                <section className="settings-group" key={group.title}>
                  <header>
                    <h3>{group.title}</h3>
                    <span>{String(group.items.length).padStart(2, "0")} 项</span>
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
          </div>
        </section>
      </div>
      </section>
    </>
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
