import {
  AlignLeft,
  BookOpenText,
  Bot,
  Braces,
  Check,
  CircleHelp,
  Code2,
  Eye,
  GalleryHorizontalEnd,
  GitCompareArrows,
  Highlighter,
  Info,
  Languages,
  ListChecks,
  LockKeyhole,
  MessageSquareText,
  Network,
  NotebookPen,
  Plus,
  Quote,
  RotateCcw,
  Tag,
  Trash2,
  X,
  type LucideIcon
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  cloneGenerationType,
  explainDefaults,
  initialGenerationTypes,
  loadGenerationTypes,
  saveGenerationTypes,
  type ContextScope,
  type GenerationTypeConfig,
  type GenerationTypeIconId,
  type TopologyCardVariant
} from "../utils/generationConfig";
import {
  configuredModels,
  loadModelProviders,
  modelBindingLabel
} from "../utils/modelProviders";

type PromptTarget = "systemPrompt" | "userPrompt";

type PreviewTab = "messages" | "schema" | "context";

const allowedVariables = [
  "selection.text",
  "selection.prefix",
  "selection.suffix",
  "block.text",
  "section.path",
  "section.text",
  "document.title",
  "document.summary",
  "parent.title",
  "parent.summary",
  "generation.instruction",
  "output.language"
] as const;

const quickVariables = [
  {
    variable: "selection.text",
    label: "选中的正文",
    detail: "用户在阅读器中当前选中的文字"
  },
  {
    variable: "block.text",
    label: "所在段落",
    detail: "包含选区的完整正文段落"
  },
  {
    variable: "section.path",
    label: "章节路径",
    detail: "选区所在章节的层级位置"
  },
  {
    variable: "document.title",
    label: "文档标题",
    detail: "当前阅读文档的标题"
  },
  {
    variable: "output.language",
    label: "输出语言",
    detail: "本次生成内容使用的目标语言"
  },
  {
    variable: "generation.instruction",
    label: "附加要求",
    detail: "用户在本次生成时补充的说明"
  }
] as const;

const contextOptions: Array<{
  value: ContextScope;
  label: string;
  detail: string;
}> = [
  {
    value: "containingParagraph",
    label: "所在段落",
    detail: "仅提供选中内容所在的完整段落"
  },
  {
    value: "nearbyParagraphs",
    label: "附近段落（上三个与下三个段落）",
    detail: "所在段落及其前后三个段落"
  },
  {
    value: "section",
    label: "整个章节",
    detail: "选中内容所属章节的全部内容"
  },
  {
    value: "article",
    label: "整篇文章",
    detail: "当前文章从标题到正文的全部内容"
  },
  {
    value: "parentArticle",
    label: "父一级文章",
    detail: "当前文章及其直接父级文章"
  },
  {
    value: "allParentArticles",
    label: "所有父级文章",
    detail: "当前文章以及向上的全部父级文章"
  }
];

const typeIconOptions: Array<{
  id: GenerationTypeIconId;
  label: string;
  Icon: LucideIcon;
}> = [
  { id: "root", label: "根节点", Icon: BookOpenText },
  { id: "explain", label: "对话解释", Icon: MessageSquareText },
  { id: "translate", label: "语言翻译", Icon: Languages },
  { id: "summary", label: "内容总结", Icon: AlignLeft },
  { id: "highlight", label: "重点引用", Icon: Highlighter },
  { id: "question", label: "启发提问", Icon: CircleHelp },
  { id: "terms", label: "术语提取", Icon: Tag },
  { id: "compare", label: "对比分析", Icon: GitCompareArrows },
  { id: "code", label: "代码示例", Icon: Code2 },
  { id: "checklist", label: "实践清单", Icon: ListChecks },
  { id: "note", label: "个人笔记", Icon: NotebookPen },
  { id: "source", label: "原文来源", Icon: Quote },
  { id: "flashcard", label: "复习闪卡", Icon: GalleryHorizontalEnd }
];

const cardVariantOptions = typeIconOptions.map(({ id, label }) => ({
  id: id as TopologyCardVariant,
  label
}));

const generationColorPresets = [
  { value: "#315fdb", label: "钴蓝" },
  { value: "#6453c6", label: "靛紫" },
  { value: "#a04f86", label: "莓红" },
  { value: "#c05245", label: "朱红" },
  { value: "#b56827", label: "琥珀" },
  { value: "#2f8468", label: "松绿" },
  { value: "#287c91", label: "湖蓝" },
  { value: "#596579", label: "石墨" }
] as const;

const typeIcons: Record<GenerationTypeIconId, LucideIcon> =
  Object.fromEntries(
    typeIconOptions.map(({ id, Icon }) => [id, Icon])
  ) as Record<GenerationTypeIconId, LucideIcon>;

const previewValues: Record<(typeof allowedVariables)[number], string> = {
  "selection.text": "〈阅读器中的选中文字〉",
  "selection.prefix": "〈选区前文〉",
  "selection.suffix": "〈选区后文〉",
  "block.text": "〈选区所在段落〉",
  "section.path": "〈当前章节路径〉",
  "section.text": "〈当前章节正文〉",
  "document.title": "〈当前文档标题〉",
  "document.summary": "〈当前文档摘要〉",
  "parent.title": "〈父级文章标题〉",
  "parent.summary": "〈父级文章摘要〉",
  "generation.instruction": "〈本次附加要求〉",
  "output.language": "〈目标语言〉"
};

const outputSchema = `{
  "title": "string",
  "summary": "string",
  "blocks": [
    { "type": "heading | paragraph | quote", "text": "string" }
  ]
}`;

function extractVariables(value: string) {
  return Array.from(value.matchAll(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g)).map(
    (match) => match[1]
  );
}

function renderPrompt(value: string) {
  return value.replace(
    /{{\s*([a-zA-Z0-9_.]+)\s*}}/g,
    (original, variable: (typeof allowedVariables)[number]) =>
      variable in previewValues ? previewValues[variable] : original
  );
}

function ReviewSection({
  title,
  meta,
  variant,
  disabled = false,
  children
}: {
  title: string;
  meta?: string;
  variant: "context" | "schema" | "card";
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`generation-review-section is-${variant}${disabled ? " is-disabled" : ""}`}
      aria-disabled={disabled || undefined}
    >
      <header>
        <h3>{title}</h3>
        {meta && <span>{meta}</span>}
      </header>
      {children}
    </section>
  );
}

const cardPreviewTitles: Record<TopologyCardVariant, string> = {
  root: "Transformer Architecture",
  explain: "Self-Attention 的直觉",
  translate: "关键段落中文翻译",
  summary: "当前章节总结",
  highlight: "Attention 权重重点句",
  question: "为什么要使用多头注意力？",
  terms: "Query / Key / Value",
  compare: "RNN 与 Transformer",
  code: "PyTorch 注意力实现片段",
  checklist: "实现一个最小注意力模块",
  note: "我的理解：多个观察角度",
  source: "Attention 原文来源",
  flashcard: "多头注意力复习卡"
};

const cardPreviewMeta: Record<
  TopologyCardVariant,
  { origin: string; footerLeft: string; footerRight: string }
> = {
  root: { origin: "集合根节点", footerLeft: "12 个章节", footerRight: "68% 已阅读" },
  explain: { origin: "AI 生成", footerLeft: "来源：第 2 节", footerRight: "2 个子节点" },
  translate: { origin: "AI 翻译", footerLeft: "EN → 中文", footerRight: "可回溯原文" },
  summary: { origin: "AI 总结", footerLeft: "覆盖当前章节", footerRight: "5 条结论" },
  highlight: { origin: "手动标记", footerLeft: "来源：第 2 节", footerRight: "原文定位" },
  question: { origin: "AI 追问", footerLeft: "基于所在段落", footerRight: "1 组问答" },
  terms: { origin: "AI 提取", footerLeft: "3 个术语", footerRight: "可继续展开" },
  compare: { origin: "AI 对比", footerLeft: "2 个对象", footerRight: "差异分析" },
  code: { origin: "AI 示例", footerLeft: "Python", footerRight: "可复制" },
  checklist: { origin: "AI 清单", footerLeft: "3 个步骤", footerRight: "2 / 3 完成" },
  note: { origin: "个人记录", footerLeft: "刚刚编辑", footerRight: "未调用模型" },
  source: { origin: "来源保存", footerLeft: "Vaswani et al.", footerRight: "可回溯" },
  flashcard: { origin: "AI 闪卡", footerLeft: "待复习", footerRight: "点击翻面" }
};

function CardPreviewBody({ variant }: { variant: TopologyCardVariant }) {
  switch (variant) {
    case "translate":
      return (
        <div className="topology-card-preview-bilingual">
          <span><small>原文</small>Attention maps a query and key-value pairs to an output.</span>
          <span><small>译文</small>注意力机制将查询与键值对映射为输出。</span>
        </div>
      );
    case "summary":
      return (
        <>
          <div className="topology-card-preview-metric">
            <strong>5</strong>
            <span>条核心结论</span>
          </div>
          <p>把章节整理为结论、术语和容易混淆的概念。</p>
        </>
      );
    case "highlight":
      return (
        <blockquote>
          The attention weights can change depending on the surrounding context.
        </blockquote>
      );
    case "question":
      return (
        <div className="topology-card-preview-qa">
          <strong>为什么要使用多头注意力？</strong>
          <span>不同注意力头可以从多个关系角度并行观察输入。</span>
        </div>
      );
    case "compare":
      return (
        <div className="topology-card-preview-split">
          <span><strong>RNN</strong>顺序计算</span>
          <span><strong>Transformer</strong>并行建模关系</span>
        </div>
      );
    case "code":
      return <code>scores = query @ key.transpose(-2, -1)</code>;
    case "checklist":
      return (
        <div className="topology-card-preview-checklist">
          <span><Check aria-hidden="true" size={12} />准备 Query / Key / Value</span>
          <span><Check aria-hidden="true" size={12} />计算注意力分数</span>
          <span><i aria-hidden="true" />完成 Softmax 缩放</span>
        </div>
      );
    case "source":
      return (
        <blockquote>
          Attention is a function of a query and a set of key-value pairs.
        </blockquote>
      );
    case "flashcard":
      return (
        <div className="topology-card-preview-flash">
          多头注意力相比单头注意力解决了什么问题？
        </div>
      );
    case "terms":
      return (
        <div className="topology-card-preview-terms">
          <span>Query · 查询</span>
          <span>Key · 键</span>
          <span>Value · 值</span>
        </div>
      );
    case "note":
      return <p>记录自己对不同注意力头分工的理解和后续疑问。</p>;
    case "root":
      return (
        <>
          <p>从一个主题入口展开内容；同一内容集合可以并列存在多个根节点。</p>
          <div className="topology-card-preview-facts">
            <span>6 个核心概念</span>
            <span>14 个派生节点</span>
          </div>
          <div className="topology-card-preview-progress" aria-label="阅读进度 68%">
            <i aria-hidden="true" />
          </div>
        </>
      );
    case "explain":
    default:
      return <p>用直觉和边界解释每个词元如何根据上下文选择信息。</p>;
  }
}

function TopologyCardPreview({ type }: { type: GenerationTypeConfig }) {
  const TypeIcon = typeIcons[type.icon];
  const meta = cardPreviewMeta[type.cardVariant];
  return (
    <article
      className={`topology-card-preview is-${type.cardVariant}`}
      style={{ "--topology-card-color": type.color } as CSSProperties}
      aria-label={`节点样式预览：${type.name}`}
    >
      <header>
        <span className="topology-card-preview-kind">
          <i aria-hidden="true"><TypeIcon size={15} /></i>
          <strong>{type.name}</strong>
        </span>
        <small>{meta.origin}</small>
      </header>
      <h4>{cardPreviewTitles[type.cardVariant]}</h4>
      <div className="topology-card-preview-body">
        <CardPreviewBody variant={type.cardVariant} />
      </div>
      <footer>
        <span>{meta.footerLeft}</span>
        <span>{meta.footerRight}</span>
      </footer>
      {type.cardVariant === "root" && <em>根节点</em>}
    </article>
  );
}

export function GenerationPage() {
  const [types, setTypes] = useState(loadGenerationTypes);
  const [activeTypeId, setActiveTypeId] = useState("explain");
  const [activePromptTarget, setActivePromptTarget] =
    useState<PromptTarget>("userPrompt");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("messages");
  const [liveStatus, setLiveStatus] = useState("");
  const newTypeSequence = useRef(1);
  const modelProviders = useMemo(loadModelProviders, []);
  const behaviorModelOptions = useMemo(
    () => configuredModels(modelProviders),
    [modelProviders]
  );

  useEffect(() => {
    saveGenerationTypes(types);
  }, [types]);

  const activeType =
    types.find((type) => type.id === activeTypeId) ?? types[0];
  const activeModelBindingAvailable = behaviorModelOptions.some(
    (option) => option.id === activeType.modelBindingId
  );
  const promptVariables = useMemo(
    () =>
      extractVariables(
        `${activeType.systemPrompt}\n${activeType.userPrompt}`
      ),
    [activeType.systemPrompt, activeType.userPrompt]
  );
  const unknownVariables = useMemo(
    () =>
      Array.from(
        new Set(
          promptVariables.filter(
            (variable) =>
              !allowedVariables.includes(
                variable as (typeof allowedVariables)[number]
              )
          )
        )
      ),
    [promptVariables]
  );
  const isAiNode = activeType.executionMode === "ai";
  const missingSelectionVariable =
    isAiNode && !promptVariables.includes("selection.text");
  const nameInvalid =
    activeType.name.trim().length === 0 || activeType.name.trim().length > 40;
  const validationErrors = [
    ...(isAiNode && unknownVariables.length > 0
      ? ["包含未知变量，请修正提示词模板。"]
      : []),
    ...(missingSelectionVariable
      ? ["模板缺少必需变量 {{selection.text}}。"]
      : []),
    ...(nameInvalid ? ["节点类型名称需为 1–40 个字符。"] : [])
  ];
  const updateActiveType = (
    updater: (type: GenerationTypeConfig) => GenerationTypeConfig,
    promptChanged = false
  ) => {
    setTypes((currentTypes) =>
      currentTypes.map((type) =>
        type.id === activeType.id ? updater(type) : type
      )
    );
    setLiveStatus(
      promptChanged
        ? "提示词修改已自动保存到本机。"
        : "设置修改已自动保存到本机。"
    );
  };

  const createType = () => {
    const id = `custom-${Date.now()}-${newTypeSequence.current++}`;
    const nextType: GenerationTypeConfig = {
      ...cloneGenerationType(explainDefaults),
      id,
      name: "未命名节点",
      icon: "question",
      cardVariant: "question",
      executionMode: "ai",
      color: "#2f8468",
      isBuiltIn: false,
      relationLabel: "派生",
      contextScope: "containingParagraph"
    };
    setTypes((currentTypes) => [...currentTypes, nextType]);
    setActiveTypeId(id);
    setLiveStatus("已创建自定义类型，内容已保存到本机。");
  };

  const deleteType = (typeId: string) => {
    const typeToDelete = types.find((type) => type.id === typeId);
    if (!typeToDelete || typeToDelete.isBuiltIn) {
      setLiveStatus("内置节点类型受保护，无法删除。");
      return;
    }

    setTypes((currentTypes) =>
      currentTypes.filter(
        (type) => type.id !== typeId || type.isBuiltIn
      )
    );
    if (activeTypeId === typeId) {
      setActiveTypeId("explain");
    }
    setLiveStatus(`已删除自定义节点类型：${typeToDelete.name}。`);
  };

  const insertVariable = (variable: string) => {
    updateActiveType((type) => ({
      ...type,
      [activePromptTarget]: `${type[activePromptTarget]}${
        type[activePromptTarget].endsWith("\n") ? "" : "\n"
      }{{${variable}}}`
    }), true);
  };

  const restoreDefaults = () => {
    const defaults =
      initialGenerationTypes.find((type) => type.id === activeType.id) ??
      explainDefaults;
    setTypes((currentTypes) =>
      currentTypes.map((type) =>
        type.id === activeType.id
          ? {
              ...type,
              systemPrompt: defaults.systemPrompt,
              userPrompt: defaults.userPrompt
            }
          : type
      )
    );
    setLiveStatus("默认提示词已恢复并自动保存。");
  };

  return (
    <section
      className="home-main settings-home-main generation-home-main"
      aria-label="拓扑节点内容"
    >
      <section
        className="settings-workspace"
        aria-labelledby="generation-page-title"
      >
        <div className="settings-workspace-inner generation-workspace-inner">
          <header className="settings-section-hero">
            <div className="settings-section-icon">
              <Network aria-hidden="true" size={21} />
            </div>
            <div>
              <span>Topology node studio</span>
              <h2 id="generation-page-title">拓扑节点</h2>
              <p>
                管理节点类型、Card 样式、提示词模板和上下文策略。所有修改都会即时自动保存。
              </p>
            </div>
            <div className="settings-display-badge generation-config-badge">
              <Info aria-hidden="true" size={14} />
              本机节点与提示词配置
            </div>
          </header>

          <div className="generation-workbench">
            <nav
              className="generation-type-rail"
              aria-label="拓扑节点类型"
            >
              <div className="generation-rail-head">
                <div>
                  <span>节点库</span>
                  <strong>
                    {types.filter(
                      (type) =>
                        type.executionMode !== "system" && type.enabled
                    ).length} 个已启用
                  </strong>
                </div>
              </div>

              <div className="generation-type-list">
                {types.map((type) => {
                  const TypeIcon = typeIcons[type.icon];
                  return (
                    <div
                      className={`generation-type-item${
                        type.id === activeType.id ? " is-active" : ""
                      }`}
                      key={type.id}
                      style={{ "--generation-type-color": type.color } as CSSProperties}
                    >
                      <button
                        className="generation-type-select"
                        type="button"
                        aria-current={
                          type.id === activeType.id ? "page" : undefined
                        }
                        onClick={() => {
                          setActiveTypeId(type.id);
                          setLiveStatus("");
                        }}
                      >
                        <span
                          className="generation-type-icon"
                          data-icon={type.icon}
                        >
                          <TypeIcon aria-hidden="true" size={17} />
                        </span>
                        <span>
                          <strong>{type.name}</strong>
                          <small>
                            {type.isBuiltIn ? "内置" : "自定义"}
                            {type.executionMode === "ai"
                              ? " · AI"
                              : type.executionMode === "manual"
                                ? " · 手动"
                                : " · 系统"}
                          </small>
                        </span>
                      </button>
                      <span className="generation-type-actions">
                        {type.executionMode !== "system" ? (
                          <label
                            className="generation-type-enable"
                            title={`${type.enabled ? "停用" : "启用"}${type.name}`}
                          >
                            <input
                              type="checkbox"
                              aria-label={`启用${type.name}`}
                              checked={type.enabled}
                              onChange={(event) => {
                                const enabled = event.target.checked;
                                setTypes((currentTypes) =>
                                  currentTypes.map((candidate) =>
                                    candidate.id === type.id
                                      ? { ...candidate, enabled }
                                      : candidate
                                  )
                                );
                                setLiveStatus(
                                  `${type.name}已${enabled ? "启用" : "停用"}，设置已自动保存到本机。`
                                );
                              }}
                            />
                            <span aria-hidden="true" />
                          </label>
                        ) : (
                          <span className="generation-type-mode" aria-label={`${type.name}由系统维护`}>
                            系统
                          </span>
                        )}
                        {type.isBuiltIn ? (
                          <span
                            className="generation-type-protected"
                            title="内置类型不可删除"
                            aria-label={`${type.name}为内置类型，无法删除`}
                          >
                            <LockKeyhole aria-hidden="true" size={13} />
                          </span>
                        ) : (
                          <button
                            className="generation-type-delete"
                            type="button"
                            aria-label={`删除节点类型：${type.name}`}
                            title={`删除${type.name}`}
                            onClick={() => deleteType(type.id)}
                          >
                            <Trash2 aria-hidden="true" size={14} />
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                className="generation-type-create"
                type="button"
                onClick={createType}
              >
                <Plus aria-hidden="true" size={15} />
                新建节点类型
              </button>
            </nav>

            <section className="generation-editor" aria-label="拓扑节点编辑">
              <header className="generation-editor-header">
                <div className="generation-editor-title">
                  <span
                    className="generation-editor-icon"
                    style={{ color: activeType.color }}
                  >
                    {(() => {
                      const ActiveIcon = typeIcons[activeType.icon];
                      return <ActiveIcon aria-hidden="true" size={19} />;
                    })()}
                  </span>
                  <div>
                    <h3>{activeType.name}</h3>
                  </div>
                </div>
              </header>

              <section className="generation-editor-section">
                <div className="generation-section-heading">
                  <div>
                    <span>Identity</span>
                    <h4>基本信息</h4>
                  </div>
                </div>

                <div className="generation-identity-grid">
                  <label className="generation-field">
                    <span>节点类型名称</span>
                    <input
                      aria-label="节点类型名称"
                      value={activeType.name}
                      maxLength={48}
                      aria-invalid={nameInvalid}
                      onChange={(event) =>
                        updateActiveType((type) => ({
                          ...type,
                          name: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label
                    className={`generation-field generation-model-field${
                      isAiNode ? "" : " is-disabled"
                    }`}
                    aria-disabled={!isAiNode}
                  >
                    <span>调用模型</span>
                    <select
                      aria-label="调用模型"
                      disabled={!isAiNode}
                      value={
                        activeType.modelBindingId === "global-default" ||
                        activeModelBindingAvailable
                          ? activeType.modelBindingId
                          : "global-default"
                      }
                      onChange={(event) => {
                        const modelBindingId = event.target.value;
                        updateActiveType((type) => ({
                          ...type,
                          modelBindingId
                        }));
                        setLiveStatus(
                          `${activeType.name}将使用 ${modelBindingLabel(
                            modelBindingId,
                            modelProviders
                          )}。`
                        );
                      }}
                    >
                      <option value="global-default">
                        自动选择已联通模型
                      </option>
                      {modelProviders.map((provider) => {
                        const providerModels = behaviorModelOptions.filter(
                          (option) => option.providerId === provider.id
                        );
                        return providerModels.length ? (
                          <optgroup label={provider.name} key={provider.id}>
                            {providerModels.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.model}
                              </option>
                            ))}
                          </optgroup>
                        ) : null;
                      })}
                    </select>
                    {behaviorModelOptions.length === 0 && (
                      <small>
                        请先在 AI 模型服务中填写 API Key 并通过联通检测。
                      </small>
                    )}
                    {!isAiNode && (
                      <small>该节点由{activeType.executionMode === "manual" ? "用户手动创建" : "系统维护"}，不会调用模型。</small>
                    )}
                  </label>
                  <label className="generation-field">
                    <span>节点样式</span>
                    <select
                      aria-label="节点样式"
                      value={activeType.cardVariant}
                      onChange={(event) =>
                        updateActiveType((type) => ({
                          ...type,
                          cardVariant: event.target.value as TopologyCardVariant
                        }))
                      }
                    >
                      {cardVariantOptions.map((option) => (
                        <option value={option.id} key={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="generation-field generation-interaction-field">
                    <span>拓扑互动</span>
                    <span className="generation-interaction-control">
                      <input
                        type="checkbox"
                        aria-label={`允许${activeType.name}节点互动`}
                        checked={activeType.interactive}
                        onChange={(event) => {
                          const interactive = event.target.checked;
                          updateActiveType((type) => ({
                            ...type,
                            interactive
                          }));
                          setLiveStatus(
                            `${activeType.name}节点互动已${interactive ? "开启" : "关闭"}。`
                          );
                        }}
                      />
                      <i aria-hidden="true" />
                      <small>允许该类型的 Card 在拓扑网络中承载问答、勾选或翻转等互动。</small>
                    </span>
                  </label>
                  <fieldset
                    className="generation-field generation-color-field"
                    aria-label="标记颜色"
                  >
                    <legend>标记颜色</legend>
                    <div className="generation-color-presets">
                      {generationColorPresets.map((preset) => (
                        <button
                          type="button"
                          key={preset.value}
                          aria-label={`使用标记颜色：${preset.label}`}
                          aria-pressed={
                            activeType.color.toLocaleLowerCase() === preset.value
                          }
                          title={preset.label}
                          style={
                            {
                              "--generation-preset-color": preset.value
                            } as CSSProperties
                          }
                          onClick={() =>
                            updateActiveType((type) => ({
                              ...type,
                              color: preset.value
                            }))
                          }
                        >
                          <span aria-hidden="true" />
                          <Check aria-hidden="true" size={12} />
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset
                    className="generation-icon-field"
                    aria-label="节点类型图标"
                  >
                    <legend>列表图标</legend>
                    <div className="generation-icon-options">
                      {typeIconOptions.map(({ id, label, Icon }) => (
                        <button
                          type="button"
                          key={id}
                          aria-label={`使用图标：${label}`}
                          aria-pressed={activeType.icon === id}
                          title={label}
                          onClick={() =>
                            updateActiveType((type) => ({
                              ...type,
                              icon: id
                            }))
                          }
                        >
                          <Icon aria-hidden="true" size={17} />
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </section>

              {!isAiNode && (
                <div className="generation-node-mode-note" role="note">
                  <Info aria-hidden="true" size={16} />
                  <span>
                    {activeType.executionMode === "manual"
                      ? "这是手动节点：用户创建后直接填写标题、内容与互动信息；数据以结构化记录保存，不生成 Markdown，也不配置或调用 AI。"
                      : "这是系统节点：内容集合可以包含多个根节点，它们由知识树关系建立；页面仅管理 Card 视觉。"}
                  </span>
                </div>
              )}

              <section
                className={`generation-prompt-card${
                  isAiNode ? "" : " is-disabled"
                }`}
                aria-disabled={!isAiNode}
              >
                <header>
                  <div>
                    <span>System layer</span>
                    <h4>System Prompt</h4>
                  </div>
                  <small>
                    {isAiNode
                      ? "系统安全约束由应用固定追加"
                      : "手动与系统节点不使用 AI 提示词"}
                  </small>
                </header>
                <textarea
                  className="generation-prompt-editor"
                  aria-label="System Prompt"
                  disabled={!isAiNode}
                  aria-invalid={unknownVariables.length > 0}
                  value={activeType.systemPrompt}
                  spellCheck={false}
                  onFocus={() => setActivePromptTarget("systemPrompt")}
                  onChange={(event) =>
                    updateActiveType(
                      (type) => ({
                        ...type,
                        systemPrompt: event.target.value
                      }),
                      true
                    )
                  }
                />
              </section>

              <section
                className={`generation-prompt-card${
                  isAiNode ? "" : " is-disabled"
                }`}
                aria-disabled={!isAiNode}
              >
                <header>
                  <div>
                    <span>User template</span>
                    <h4>User Prompt</h4>
                  </div>
                  <small>
                    {isAiNode
                      ? "来源正文始终作为不可信数据区块"
                      : "手动内容由用户在创建节点时填写"}
                  </small>
                </header>
                <textarea
                  className="generation-prompt-editor is-user"
                  aria-label="User Prompt"
                  disabled={!isAiNode}
                  aria-invalid={
                    unknownVariables.length > 0 || missingSelectionVariable
                  }
                  value={activeType.userPrompt}
                  spellCheck={false}
                  onFocus={() => setActivePromptTarget("userPrompt")}
                  onChange={(event) =>
                    updateActiveType(
                      (type) => ({
                        ...type,
                        userPrompt: event.target.value
                      }),
                      true
                    )
                  }
                />
              </section>

              <section
                className={`generation-variable-dock${
                  isAiNode ? "" : " is-disabled"
                }`}
                aria-label="模板变量"
                aria-disabled={!isAiNode}
              >
                <div>
                  <Braces aria-hidden="true" size={16} />
                  <span>插入到当前编辑器</span>
                </div>
                <div>
                  {quickVariables.map(({ variable, label, detail }) => (
                    <button
                      className="generation-variable-chip"
                      type="button"
                      key={variable}
                      aria-label={`插入变量 {{${variable}}}`}
                      disabled={!isAiNode}
                      onClick={() => insertVariable(variable)}
                    >
                      <span>
                        <strong>{label}</strong>
                        <code>{`{{${variable}}}`}</code>
                      </span>
                      <small>{detail}</small>
                    </button>
                  ))}
                </div>
              </section>

              {validationErrors.length > 0 && (
                <div className="generation-validation" role="alert">
                  <CircleHelp aria-hidden="true" size={17} />
                  <div>
                    <strong>草稿需要检查</strong>
                    {validationErrors.map((error) => (
                      <span key={error}>{error}</span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <aside className="generation-review-column" aria-label="节点预览与模板检查">
              <ReviewSection title="节点样式预览" meta="实时" variant="card">
                <div className="topology-card-preview-stage">
                  <TopologyCardPreview type={activeType} />
                  <p>
                    {activeType.executionMode === "manual"
                      ? "手动 Card 展示用户填写的结构化信息，不对应 Markdown 文件。"
                      : activeType.executionMode === "system"
                        ? "根节点是内容集合中的独立入口；同一集合可以有多个根节点。"
                        : "AI Card 是生成内容的入口；预览只展示摘要、来源与少量结果。"}
                  </p>
                </div>
              </ReviewSection>

              <ReviewSection
                title="上下文策略"
                meta={isAiNode ? "单选" : "不适用"}
                variant="context"
                disabled={!isAiNode}
              >
                <fieldset className="generation-context-options" disabled={!isAiNode}>
                  <legend>选择生成内容使用的最大上下文范围</legend>
                  {contextOptions.map((option) => (
                    <label
                      className={`generation-context-option${
                        activeType.contextScope === option.value
                          ? " is-selected"
                          : ""
                      }`}
                      key={option.value}
                    >
                      <input
                        type="radio"
                        name={`context-scope-${activeType.id}`}
                        value={option.value}
                        checked={activeType.contextScope === option.value}
                        onChange={() =>
                          updateActiveType((type) => ({
                            ...type,
                            contextScope: option.value
                          }))
                        }
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.detail}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>
              </ReviewSection>

              <ReviewSection
                title="输出结构"
                meta={isAiNode ? "只读" : "不适用"}
                variant="schema"
                disabled={!isAiNode}
              >
                <pre className="generation-schema-preview">
                  <code>{`{
  title: string
  summary: string
  blocks: heading | paragraph
}`}</code>
                </pre>
              </ReviewSection>
            </aside>
          </div>

          <footer className="generation-action-bar">
            <div>
              <span
                className="generation-live-status"
                role="status"
                aria-live="polite"
              >
                {liveStatus ||
                  "所有修改都会自动保存到本机。"}
              </span>
            </div>
            <div>
              {activeType.isBuiltIn && (
                <button type="button" onClick={restoreDefaults}>
                  <RotateCcw aria-hidden="true" size={15} />
                  恢复默认
                </button>
              )}
              <button
                type="button"
                disabled={!isAiNode}
                onClick={() => {
                  setPreviewTab("messages");
                  setPreviewOpen(true);
                }}
              >
                <Eye aria-hidden="true" size={15} />
                提示词预览
              </button>
            </div>
          </footer>
        </div>
      </section>

      {previewOpen && (
        <div
          className="generation-preview-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPreviewOpen(false);
            }
          }}
        >
          <section
            className="generation-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="generation-preview-title"
          >
            <header>
              <div>
                <span>Local render</span>
                <h3 id="generation-preview-title">输出预览</h3>
                <p>检查将发送的消息与结构；此处不会发起模型请求。</p>
              </div>
              <button
                type="button"
                aria-label="关闭输出预览"
                onClick={() => setPreviewOpen(false)}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>

            <div className="generation-preview-tabs" role="tablist">
              {(
                [
                  ["messages", "最终消息"],
                  ["context", "上下文样例"],
                  ["schema", "输出 Schema"]
                ] as const
              ).map(([id, label]) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewTab === id}
                  key={id}
                  onClick={() => setPreviewTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="generation-preview-panel">
              {previewTab === "messages" && (
                <>
                  <div className="generation-preview-model">
                    <Bot aria-hidden="true" size={15} />
                    <span>
                      <strong>行为模型</strong>
                      <small>
                        {modelBindingLabel(
                          activeType.modelBindingId,
                          modelProviders
                        )}
                      </small>
                    </span>
                  </div>
                  <div>
                    <span>system</span>
                    <pre className="generation-code-block">
                      {renderPrompt(activeType.systemPrompt)}
                    </pre>
                  </div>
                  <div>
                    <span>user</span>
                    <pre className="generation-code-block">
                      {renderPrompt(activeType.userPrompt)}
                    </pre>
                  </div>
                </>
              )}
              {previewTab === "context" && (
                <dl className="generation-preview-context">
                  <div>
                    <dt>当前文档</dt>
                    <dd>{previewValues["document.title"]}</dd>
                  </div>
                  <div>
                    <dt>选区</dt>
                    <dd>{previewValues["selection.text"]}</dd>
                  </div>
                  <div>
                    <dt>标题路径</dt>
                    <dd>{previewValues["section.path"]}</dd>
                  </div>
                  <div>
                    <dt>已裁剪</dt>
                    <dd>父级摘要 · 上下文裁剪时优先移除</dd>
                  </div>
                </dl>
              )}
              {previewTab === "schema" && (
                <pre className="generation-code-block">{outputSchema}</pre>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
