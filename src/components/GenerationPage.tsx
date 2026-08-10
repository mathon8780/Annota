import {
  AlignLeft,
  BookOpenText,
  Bot,
  Braces,
  Check,
  ChevronDown,
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
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
  type LucideIcon
} from "lucide-react";
import {
  type CSSProperties,
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
import {
  loadReaderToolbarPreferences,
  saveReaderToolbarPreferences
} from "../utils/readerToolbarPreferences";

type PromptTarget = "systemPrompt" | "userPrompt";

type PreviewTab = "messages" | "schema" | "context";

type WorkspacePanel =
  | "request"
  | "prompt"
  | "advanced"
  | "protocol"
  | "check";

type AppearancePicker = "color" | "icon" | null;

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
  const [workspacePanel, setWorkspacePanel] =
    useState<WorkspacePanel>("prompt");
  const [appearancePicker, setAppearancePicker] =
    useState<AppearancePicker>(null);
  const [liveStatus, setLiveStatus] = useState("");
  const [readerToolbarPreferences, setReaderToolbarPreferences] = useState(
    loadReaderToolbarPreferences
  );
  const newTypeSequence = useRef(1);
  const modelProviders = useMemo(loadModelProviders, []);
  const behaviorModelOptions = useMemo(
    () => configuredModels(modelProviders),
    [modelProviders]
  );

  useEffect(() => {
    saveGenerationTypes(types);
  }, [types]);

  useEffect(() => {
    saveReaderToolbarPreferences(readerToolbarPreferences);
  }, [readerToolbarPreferences]);

  const activeType =
    types.find((type) => type.id === activeTypeId) ?? types[0];
  const activeContextOption =
    contextOptions.find((option) => option.value === activeType.contextScope) ??
    contextOptions[0];
  const activeColorPreset =
    generationColorPresets.find(
      (preset) => preset.value === activeType.color.toLocaleLowerCase()
    ) ?? generationColorPresets[0];
  const activeIconOption =
    typeIconOptions.find((option) => option.id === activeType.icon) ??
    typeIconOptions[0];
  const ActivePickerIcon = activeIconOption.Icon;
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
                <button
                  className="generation-toolbar-mode-toggle"
                  type="button"
                  role="switch"
                  aria-checked={readerToolbarPreferences.iconOnly}
                  aria-label="顶部交互仅显示图标"
                  title={
                    readerToolbarPreferences.iconOnly
                      ? "当前仅显示图标，点击切换为图标与文字"
                      : "当前显示图标与文字，点击切换为仅图标"
                  }
                  onClick={() => {
                    setReaderToolbarPreferences((current) => ({
                      ...current,
                      iconOnly: !current.iconOnly
                    }));
                    setLiveStatus("顶部交互显示方式已自动保存。");
                  }}
                >
                  <GalleryHorizontalEnd aria-hidden="true" size={14} />
                  <span
                    className="generation-toolbar-mode-track"
                    aria-hidden="true"
                  />
                </button>
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
                          setAppearancePicker(null);
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

            <section
              className="generation-node-workspace"
              aria-label="拓扑节点编辑"
            >
              <header className="generation-node-workspace-header">
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
                    <span>当前节点类型</span>
                    <h3>{activeType.name}</h3>
                  </div>
                </div>
                <span className="generation-node-save-state">
                  <Check aria-hidden="true" size={13} />
                  自动保存
                </span>
              </header>

              <div className="generation-basics-grid">
                <section
                  className="generation-basic-column is-identity"
                  aria-label="基础信息"
                >
                  <header>
                    <span>Configuration</span>
                    <h4>基础信息</h4>
                  </header>
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
                      <option value="global-default">自动选择已联通模型</option>
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
                    {behaviorModelOptions.length === 0 && isAiNode && (
                      <small>请先在 AI 模型服务中配置并检测可用模型。</small>
                    )}
                    {!isAiNode && (
                      <small>
                        该节点由
                        {activeType.executionMode === "manual"
                          ? "用户手动创建"
                          : "系统维护"}
                        ，不会调用模型。
                      </small>
                    )}
                  </label>
                  <label
                    className={`generation-field generation-context-select${
                      isAiNode ? "" : " is-disabled"
                    }`}
                    aria-disabled={!isAiNode}
                  >
                    <span>上下文策略</span>
                    <select
                      aria-label="上下文策略"
                      disabled={!isAiNode}
                      value={activeType.contextScope}
                      onChange={(event) =>
                        updateActiveType((type) => ({
                          ...type,
                          contextScope: event.target.value as ContextScope
                        }))
                      }
                    >
                      {contextOptions.map((option) => (
                        <option value={option.value} key={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <small>{activeContextOption.detail}</small>
                  </label>
                </section>

                <section
                  className="generation-basic-column is-appearance"
                  aria-label="标记与图标"
                >
                  <header>
                    <span>Appearance</span>
                    <h4>标记与图标</h4>
                  </header>
                  <div className="generation-appearance-picker is-color">
                    <span>标记颜色</span>
                    <button
                      className="generation-appearance-trigger"
                      type="button"
                      aria-expanded={appearancePicker === "color"}
                      aria-controls="generation-color-picker"
                      onClick={() =>
                        setAppearancePicker((current) =>
                          current === "color" ? null : "color"
                        )
                      }
                    >
                      <i
                        className="generation-selected-color"
                        style={
                          {
                            "--generation-preset-color": activeType.color
                          } as CSSProperties
                        }
                        aria-hidden="true"
                      />
                      <strong>{activeColorPreset.label}</strong>
                      <ChevronDown aria-hidden="true" size={15} />
                    </button>
                    {appearancePicker === "color" && (
                      <div
                        className="generation-appearance-popover generation-color-presets"
                        id="generation-color-picker"
                        aria-label="标记颜色选项"
                      >
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
                            onClick={() => {
                              updateActiveType((type) => ({
                                ...type,
                                color: preset.value
                              }));
                              setAppearancePicker(null);
                            }}
                          >
                            <span aria-hidden="true" />
                            <Check aria-hidden="true" size={12} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="generation-appearance-picker is-icon">
                    <span>展示图标</span>
                    <button
                      className="generation-appearance-trigger"
                      type="button"
                      aria-expanded={appearancePicker === "icon"}
                      aria-controls="generation-icon-picker"
                      onClick={() =>
                        setAppearancePicker((current) =>
                          current === "icon" ? null : "icon"
                        )
                      }
                    >
                      <i aria-hidden="true">
                        <ActivePickerIcon size={17} />
                      </i>
                      <strong>{activeIconOption.label}</strong>
                      <ChevronDown aria-hidden="true" size={15} />
                    </button>
                    {appearancePicker === "icon" && (
                      <div
                        className="generation-appearance-popover generation-icon-options"
                        id="generation-icon-picker"
                        aria-label="展示图标选项"
                      >
                        {typeIconOptions.map(({ id, label, Icon }) => (
                          <button
                            type="button"
                            key={id}
                            aria-label={`使用图标：${label}`}
                            aria-pressed={activeType.icon === id}
                            title={label}
                            onClick={() => {
                              updateActiveType((type) => ({
                                ...type,
                                icon: id
                              }));
                              setAppearancePicker(null);
                            }}
                          >
                            <Icon aria-hidden="true" size={17} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section
                  className="generation-basic-column is-preview"
                  aria-label="节点样式预览"
                >
                  <header>
                    <span>Live card</span>
                    <h4>节点样式预览</h4>
                  </header>
                  <div className="topology-card-preview-stage">
                    <TopologyCardPreview type={activeType} />
                  </div>
                </section>
              </div>

              <section
                className="generation-content-workspace"
                aria-label="内容编辑区"
              >
                <div
                  className="generation-content-tabs"
                  role="tablist"
                  aria-label="节点内容编辑区"
                >
                  {(
                    [
                      ["check", "检查", Check],
                      ["prompt", "提示词", MessageSquareText],
                      ["advanced", "高级", SlidersHorizontal],
                      ["protocol", "输出协议", Braces],
                      ["request", "模型请求参数", Bot]
                    ] as const
                  ).map(([id, label, Icon]) => (
                    <button
                      type="button"
                      role="tab"
                      id={`generation-content-tab-${id}`}
                      aria-controls={`generation-content-panel-${id}`}
                      aria-selected={workspacePanel === id}
                      key={id}
                      onClick={() => setWorkspacePanel(id)}
                    >
                      <Icon aria-hidden="true" size={15} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                <div
                  className={`generation-content-panel is-${workspacePanel}${
                    !isAiNode && workspacePanel !== "advanced"
                      ? " is-disabled"
                      : ""
                  }`}
                  id={`generation-content-panel-${workspacePanel}`}
                  role="tabpanel"
                  aria-labelledby={`generation-content-tab-${workspacePanel}`}
                >
                  {workspacePanel === "request" && (
                    <div className="generation-request-layout">
                      <dl className="generation-request-summary">
                        <div>
                          <dt>调用模型</dt>
                          <dd>
                            {isAiNode
                              ? modelBindingLabel(
                                  activeType.modelBindingId,
                                  modelProviders
                                )
                              : "不调用模型"}
                          </dd>
                        </div>
                        <div>
                          <dt>上下文上限</dt>
                          <dd>{activeContextOption.label}</dd>
                        </div>
                        <div>
                          <dt>消息组成</dt>
                          <dd>System + User</dd>
                        </div>
                        <div>
                          <dt>请求方式</dt>
                          <dd>按阅读操作触发</dd>
                        </div>
                      </dl>
                      <div className="generation-request-envelope">
                        <span>Request envelope</span>
                        <pre>{`{
  "model": "${isAiNode ? modelBindingLabel(activeType.modelBindingId, modelProviders) : "disabled"}",
  "contextScope": "${activeType.contextScope}",
  "messages": ["system", "user"],
  "responseFormat": "annota-node"
}`}</pre>
                      </div>
                    </div>
                  )}

                  {workspacePanel === "prompt" && (
                    <div className="generation-prompt-layout">
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
                            unknownVariables.length > 0 ||
                            missingSelectionVariable
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
                    </div>
                  )}

                  {workspacePanel === "advanced" && (
                    <div className="generation-advanced-layout">
                      <label className="generation-field generation-advanced-style">
                        <span>节点样式</span>
                        <select
                          aria-label="节点样式"
                          value={activeType.cardVariant}
                          onChange={(event) =>
                            updateActiveType((type) => ({
                              ...type,
                              cardVariant: event.target
                                .value as TopologyCardVariant
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
                      <label className="generation-advanced-toggle">
                        <span>
                          <strong>拓扑互动</strong>
                          <small>
                            允许 Card 在拓扑网络中承载问答、勾选、编辑或翻转。
                          </small>
                        </span>
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
                                `${activeType.name}节点互动已${
                                  interactive ? "开启" : "关闭"
                                }。`
                              );
                            }}
                          />
                          <i aria-hidden="true" />
                        </span>
                      </label>
                      <dl className="generation-advanced-matrix">
                        <div>
                          <dt>执行方式</dt>
                          <dd>
                            {activeType.executionMode === "ai"
                              ? "AI 生成"
                              : activeType.executionMode === "manual"
                                ? "用户手动填写"
                                : "系统维护"}
                          </dd>
                        </div>
                        <div>
                          <dt>内容存储</dt>
                          <dd>
                            {activeType.executionMode === "manual"
                              ? "SQLite 结构化记录"
                              : activeType.executionMode === "system"
                                ? "集合关系数据"
                                : "Markdown 文件"}
                          </dd>
                        </div>
                        <div>
                          <dt>节点保护</dt>
                          <dd>{activeType.isBuiltIn ? "内置，不可删除" : "自定义，可删除"}</dd>
                        </div>
                      </dl>
                      {!isAiNode && (
                        <div className="generation-node-mode-note" role="note">
                          <Info aria-hidden="true" size={16} />
                          <span>
                            {activeType.executionMode === "manual"
                              ? "手动节点由用户填写标题、内容与互动信息；不会生成 Markdown，也不会配置或调用 AI。"
                              : "系统节点用于组织内容集合；同一集合可以包含多个根节点。"}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {workspacePanel === "protocol" && (
                    <div className="generation-protocol-layout">
                      <div className="generation-protocol-code">
                        <span>annota-node.schema.json</span>
                        <pre>{outputSchema}</pre>
                      </div>
                      <dl className="generation-protocol-fields">
                        <div>
                          <dt>title</dt>
                          <dd>节点标题，用于 Card 与拓扑索引。</dd>
                        </div>
                        <div>
                          <dt>summary</dt>
                          <dd>节点摘要，用于折叠状态和关系检索。</dd>
                        </div>
                        <div>
                          <dt>blocks</dt>
                          <dd>标题、段落或引用组成的结构化内容块。</dd>
                        </div>
                      </dl>
                    </div>
                  )}

                  {workspacePanel === "check" && (
                    <div className="generation-check-layout">
                      <section
                        className={`generation-check-status${
                          validationErrors.length > 0 ? " is-warning" : " is-ready"
                        }`}
                        aria-live="polite"
                      >
                        {validationErrors.length > 0 ? (
                          <CircleHelp aria-hidden="true" size={19} />
                        ) : (
                          <Check aria-hidden="true" size={19} />
                        )}
                        <div>
                          <strong>
                            {validationErrors.length > 0
                              ? "发现需要处理的配置"
                              : "当前配置可以使用"}
                          </strong>
                          {validationErrors.length > 0 ? (
                            <ul>
                              {validationErrors.map((error) => (
                                <li key={error}>{error}</li>
                              ))}
                            </ul>
                          ) : (
                            <span>
                              {isAiNode
                                ? "模型、上下文、提示词变量与输出协议检查通过。"
                                : "该节点不调用 AI，仅检查名称、样式与互动配置。"}
                            </span>
                          )}
                        </div>
                      </section>
                      {isAiNode && (
                        <div className="generation-check-messages">
                          <div>
                            <span>system</span>
                            <pre>{renderPrompt(activeType.systemPrompt)}</pre>
                          </div>
                          <div>
                            <span>user</span>
                            <pre>{renderPrompt(activeType.userPrompt)}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </section>
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
