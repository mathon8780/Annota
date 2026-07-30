import {
  BookOpenText,
  Bot,
  Braces,
  CircleHelp,
  Eye,
  Info,
  Languages,
  Lightbulb,
  LockKeyhole,
  MessageSquareText,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
  WandSparkles,
  X,
  type LucideIcon
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useMemo,
  useRef,
  useState
} from "react";

type ContextScope =
  | "containingParagraph"
  | "nearbyParagraphs"
  | "section"
  | "article"
  | "parentArticle"
  | "allParentArticles";

type PromptTarget = "systemPrompt" | "userPrompt";

type GenerationTypeIconId =
  | "explain"
  | "translate"
  | "question"
  | "terms"
  | "reading"
  | "insight";

type GenerationTypeDraft = {
  id: string;
  name: string;
  icon: GenerationTypeIconId;
  color: string;
  isBuiltIn: boolean;
  enabled: boolean;
  modelBindingId: string;
  relationLabel: string;
  systemPrompt: string;
  userPrompt: string;
  contextScope: ContextScope;
};

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
  { id: "explain", label: "对话解释", Icon: MessageSquareText },
  { id: "translate", label: "语言翻译", Icon: Languages },
  { id: "question", label: "启发提问", Icon: CircleHelp },
  { id: "terms", label: "术语标签", Icon: Tag },
  { id: "reading", label: "阅读笔记", Icon: BookOpenText },
  { id: "insight", label: "灵感提炼", Icon: Lightbulb }
];

const typeIcons: Record<GenerationTypeIconId, LucideIcon> =
  Object.fromEntries(
    typeIconOptions.map(({ id, Icon }) => [id, Icon])
  ) as Record<GenerationTypeIconId, LucideIcon>;

const behaviorModelOptions = [
  {
    id: "global-default",
    label: "跟随全局默认",
    detail: "使用模型服务中的默认模型"
  },
  {
    id: "chatgpt:gpt-5-mini",
    label: "Chat GPT · gpt-5-mini",
    detail: "OpenAI Compatible"
  },
  {
    id: "deepseek:deepseek-v4-flash",
    label: "Deepseek · deepseek-v4-flash",
    detail: "OpenAI Compatible"
  },
  {
    id: "gemini:gemini-3.6-flash",
    label: "Gemini · gemini-3.6-flash",
    detail: "OpenAI Compatible"
  },
  {
    id: "kimi:kimi-k3",
    label: "Kimi · kimi-k3",
    detail: "OpenAI Compatible"
  },
  {
    id: "claude:claude-sonnet-5",
    label: "Claude · claude-sonnet-5",
    detail: "Anthropic Messages"
  },
  {
    id: "glm:glm-5.2",
    label: "GLM · glm-5.2",
    detail: "OpenAI Compatible"
  }
] as const;

function getModelLabel(modelBindingId: string) {
  return (
    behaviorModelOptions.find((option) => option.id === modelBindingId)?.label ??
    modelBindingId
  );
}

const explainDefaults: GenerationTypeDraft = {
  id: "explain",
  name: "解释",
  icon: "explain",
  color: "#315fdb",
  isBuiltIn: true,
  enabled: true,
  modelBindingId: "global-default",
  relationLabel: "解释",
  systemPrompt:
    "你的任务是把用户选中的学习材料解释为一篇可独立阅读、可继续派生的子文章。使用 {{output.language}}，覆盖核心定义、运作方式、适用边界与容易混淆之处。",
  userPrompt:
    "请解释 <selection>{{selection.text}}</selection>。\n\n<document_title>{{document.title}}</document_title>\n<section_path>{{section.path}}</section_path>\n<containing_block>{{block.text}}</containing_block>\n<additional_instruction>{{generation.instruction}}</additional_instruction>",
  contextScope: "allParentArticles"
};

const translateDefaults: GenerationTypeDraft = {
  id: "translate",
  name: "翻译",
  icon: "translate",
  color: "#7454c5",
  isBuiltIn: true,
  enabled: true,
  modelBindingId: "gemini:gemini-3.6-flash",
  relationLabel: "翻译",
  systemPrompt:
    "生成一篇忠实、可学习的双语翻译子文章。保留代码标识、公式和专有名词，目标语言为 {{output.language}}。",
  userPrompt:
    "请翻译 <selection>{{selection.text}}</selection>。\n\n<containing_block>{{block.text}}</containing_block>\n<section_path>{{section.path}}</section_path>\n<document_title>{{document.title}}</document_title>",
  contextScope: "section"
};

const initialTypes: GenerationTypeDraft[] = [
  explainDefaults,
  translateDefaults,
  {
    id: "socratic",
    name: "苏格拉底式追问",
    icon: "question",
    color: "#2f8468",
    isBuiltIn: false,
    enabled: true,
    modelBindingId: "deepseek:deepseek-v4-flash",
    relationLabel: "追问",
    systemPrompt:
      "围绕选区提出由浅入深的问题，帮助读者主动检查理解。所有问题使用 {{output.language}}。",
    userPrompt:
      "为 <selection>{{selection.text}}</selection> 设计一组递进问题，并参考 {{section.path}}。",
    contextScope: "section"
  },
  {
    id: "terms",
    name: "提炼术语",
    icon: "terms",
    color: "#b56827",
    isBuiltIn: false,
    enabled: false,
    modelBindingId: "chatgpt:gpt-5-mini",
    relationLabel: "术语",
    systemPrompt:
      "提炼选区中的关键术语，给出简洁定义与使用边界。使用 {{output.language}}。",
    userPrompt:
      "从 <selection>{{selection.text}}</selection> 中提炼术语，并结合 {{block.text}} 消除歧义。",
    contextScope: "containingParagraph"
  }
];

const previewValues: Record<(typeof allowedVariables)[number], string> = {
  "selection.text": "System 对满足特定组件条件的实体集合执行逻辑。",
  "selection.prefix": "在 ECS 中，Component 只保存数据；",
  "selection.suffix": "它通常由调度器按阶段执行。",
  "block.text":
    "System 对满足特定组件条件的实体集合执行逻辑，并在游戏循环中按顺序更新。",
  "section.path": "ECS / System 更新顺序",
  "section.text":
    "System 读取组件数据、执行逻辑，并把结果写回对应组件。",
  "document.title": "ECS 架构与 System 更新顺序",
  "document.summary": "介绍 Entity、Component 与 System 的职责边界。",
  "parent.title": "游戏架构基础",
  "parent.summary": "从数据组织与执行流程理解游戏架构。",
  "generation.instruction": "请用一个游戏循环中的例子说明。",
  "output.language": "简体中文"
};

const outputSchema = `{
  "title": "System 的职责与执行边界",
  "summary": "解释 System 如何读取组件数据并按约束更新。",
  "blocks": [
    { "type": "heading", "level": 2, "text": "核心定义" },
    { "type": "paragraph", "text": "System 是对满足特定组件条件的实体集合执行逻辑的单元。" }
  ],
  "tags": ["ECS", "System"]
}`;

function cloneType(type: GenerationTypeDraft): GenerationTypeDraft {
  return { ...type };
}

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
  children
}: {
  title: string;
  meta?: string;
  variant: "context" | "schema";
  children: ReactNode;
}) {
  return (
    <section className={`generation-review-section is-${variant}`}>
      <header>
        <h3>{title}</h3>
        {meta && <span>{meta}</span>}
      </header>
      {children}
    </section>
  );
}

export function GenerationPage() {
  const [types, setTypes] = useState(() => initialTypes.map(cloneType));
  const [activeTypeId, setActiveTypeId] = useState("explain");
  const [activePromptTarget, setActivePromptTarget] =
    useState<PromptTarget>("userPrompt");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("messages");
  const [liveStatus, setLiveStatus] = useState("");
  const newTypeSequence = useRef(1);

  const activeType =
    types.find((type) => type.id === activeTypeId) ?? types[0];
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
  const missingSelectionVariable = !promptVariables.includes("selection.text");
  const nameInvalid =
    activeType.name.trim().length === 0 || activeType.name.trim().length > 40;
  const validationErrors = [
    ...(unknownVariables.length > 0
      ? ["包含未知变量，请修正提示词模板。"]
      : []),
    ...(missingSelectionVariable
      ? ["模板缺少必需变量 {{selection.text}}。"]
      : []),
    ...(nameInvalid ? ["生成类型名称需为 1–40 个字符。"] : [])
  ];
  const updateActiveType = (
    updater: (type: GenerationTypeDraft) => GenerationTypeDraft,
    promptChanged = false
  ) => {
    setTypes((currentTypes) =>
      currentTypes.map((type) =>
        type.id === activeType.id ? updater(type) : type
      )
    );
    setLiveStatus(
      promptChanged
        ? "提示词修改已自动保存到本次页面会话。"
        : "设置修改已自动保存到本次页面会话。"
    );
  };

  const createType = () => {
    const id = `custom-${Date.now()}-${newTypeSequence.current++}`;
    const nextType: GenerationTypeDraft = {
      ...cloneType(explainDefaults),
      id,
      name: "未命名类型",
      icon: "question",
      color: "#2f8468",
      isBuiltIn: false,
      relationLabel: "派生"
    };
    setTypes((currentTypes) => [...currentTypes, nextType]);
    setActiveTypeId(id);
    setLiveStatus("已创建本地类型，内容已自动保存在本次页面会话。");
  };

  const deleteType = (typeId: string) => {
    const typeToDelete = types.find((type) => type.id === typeId);
    if (!typeToDelete || typeToDelete.isBuiltIn) {
      setLiveStatus("内置生成类型受保护，无法删除。");
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
    setLiveStatus(`已删除自定义生成类型：${typeToDelete.name}。`);
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
      activeType.id === "translate" ? translateDefaults : explainDefaults;
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
      aria-label="生成与提示词内容"
    >
      <section
        className="settings-workspace"
        aria-labelledby="generation-page-title"
      >
        <div className="settings-workspace-inner generation-workspace-inner">
          <header className="settings-section-hero">
            <div className="settings-section-icon">
              <WandSparkles aria-hidden="true" size={21} />
            </div>
            <div>
              <span>Generation studio</span>
              <h2 id="generation-page-title">生成与提示词</h2>
              <p>
                管理生成类型、提示词模板和上下文策略。所有修改都会即时自动保存。
              </p>
            </div>
            <div className="settings-display-badge generation-demo-badge">
              <Info aria-hidden="true" size={14} />
              交互演示 · 本地草稿
            </div>
          </header>

          <div className="generation-workbench">
            <nav
              className="generation-type-rail"
              aria-label="生成类型"
            >
              <div className="generation-rail-head">
                <div>
                  <span>类型库</span>
                  <strong>{types.filter((type) => type.enabled).length} 个启用</strong>
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
                          <small>{type.isBuiltIn ? "内置" : "自定义"}</small>
                        </span>
                      </button>
                      <span className="generation-type-actions">
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
                                `${type.name}已${enabled ? "启用" : "停用"}，设置已自动保存到本次页面会话。`
                              );
                            }}
                          />
                          <span aria-hidden="true" />
                        </label>
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
                            aria-label={`删除生成类型：${type.name}`}
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
                新建生成类型
              </button>
            </nav>

            <section className="generation-editor" aria-label="生成类型编辑">
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
                    <span>生成类型名称</span>
                    <input
                      aria-label="生成类型名称"
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
                  <label className="generation-field generation-model-field">
                    <span>调用模型</span>
                    <select
                      aria-label="调用模型"
                      value={activeType.modelBindingId}
                      onChange={(event) => {
                        const modelBindingId = event.target.value;
                        updateActiveType((type) => ({
                          ...type,
                          modelBindingId
                        }));
                        setLiveStatus(
                          `${activeType.name}将使用 ${getModelLabel(modelBindingId)}；这是本地行为绑定演示。`
                        );
                      }}
                    >
                      {behaviorModelOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="generation-field generation-color-field">
                    <span>标记颜色</span>
                    <span className="generation-color-row">
                      <input
                        aria-label="标记颜色"
                        type="color"
                        value={activeType.color}
                        onChange={(event) =>
                          updateActiveType((type) => ({
                            ...type,
                            color: event.target.value
                          }))
                        }
                      />
                      <code>{activeType.color.toUpperCase()}</code>
                    </span>
                  </label>
                  <fieldset
                    className="generation-icon-field"
                    aria-label="生成类型图标"
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

              <section className="generation-prompt-card">
                <header>
                  <div>
                    <span>System layer</span>
                    <h4>System Prompt</h4>
                  </div>
                  <small>系统安全约束由应用固定追加</small>
                </header>
                <textarea
                  className="generation-prompt-editor"
                  aria-label="System Prompt"
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

              <section className="generation-prompt-card">
                <header>
                  <div>
                    <span>User template</span>
                    <h4>User Prompt</h4>
                  </div>
                  <small>来源正文始终作为不可信数据区块</small>
                </header>
                <textarea
                  className="generation-prompt-editor is-user"
                  aria-label="User Prompt"
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
                className="generation-variable-dock"
                aria-label="模板变量"
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

            <aside className="generation-review-column" aria-label="模板检查">
              <ReviewSection
                title="上下文策略"
                meta="单选"
                variant="context"
              >
                <fieldset className="generation-context-options">
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

              <ReviewSection title="输出结构" meta="只读" variant="schema">
                <pre className="generation-schema-preview">
                  <code>{`{
  title: string
  summary: string
  blocks: heading | paragraph
  tags: string[]
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
                  "所有修改都会自动保存到本次页面会话。"}
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
                onClick={() => {
                  setPreviewTab("messages");
                  setPreviewOpen(true);
                }}
              >
                <Eye aria-hidden="true" size={15} />
                输出预览
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
                <p>只渲染消息与结构，不调用模型，也不会消耗额度。</p>
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
                      <small>{getModelLabel(activeType.modelBindingId)}</small>
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
