export type ContextScope =
  | "containingParagraph"
  | "nearbyParagraphs"
  | "section"
  | "article"
  | "parentArticle"
  | "allParentArticles";

export type GenerationTypeIconId =
  | "root"
  | "explain"
  | "translate"
  | "summary"
  | "highlight"
  | "question"
  | "terms"
  | "compare"
  | "code"
  | "checklist"
  | "note"
  | "source"
  | "flashcard";

export type TopologyCardVariant = GenerationTypeIconId;
export type NodeExecutionMode = "ai" | "manual" | "system";

export interface GenerationTypeConfig {
  id: string;
  name: string;
  icon: GenerationTypeIconId;
  cardVariant: TopologyCardVariant;
  executionMode: NodeExecutionMode;
  interactive: boolean;
  color: string;
  isBuiltIn: boolean;
  enabled: boolean;
  modelBindingId: string;
  relationLabel: string;
  systemPrompt: string;
  userPrompt: string;
  contextScope: ContextScope;
}

export const GENERATION_TYPES_STORAGE_KEY = "annota.generation-types.v1";

function nodeType(
  config: Omit<
    GenerationTypeConfig,
    "modelBindingId" | "contextScope" | "interactive"
  > &
    Pick<Partial<GenerationTypeConfig>, "interactive">
): GenerationTypeConfig {
  return {
    ...config,
    interactive: config.interactive ?? false,
    modelBindingId: "global-default",
    contextScope: "containingParagraph"
  };
}

export const rootDefaults = nodeType({
  id: "root",
  name: "根节点",
  icon: "root",
  cardVariant: "root",
  executionMode: "system",
  color: "#475569",
  isBuiltIn: true,
  enabled: false,
  relationLabel: "根节点",
  systemPrompt: "",
  userPrompt: ""
});

export const explainDefaults = nodeType({
  id: "explain",
  name: "解释",
  icon: "explain",
  cardVariant: "explain",
  executionMode: "ai",
  color: "#315fdb",
  isBuiltIn: true,
  enabled: true,
  relationLabel: "解释",
  systemPrompt:
    "你的任务是把用户选中的学习材料解释为一篇可独立阅读、可继续派生的子文章。使用 {{output.language}}，覆盖核心定义、运作方式、适用边界与容易混淆之处。",
  userPrompt:
    "请解释 <selection>{{selection.text}}</selection>。\n\n<document_title>{{document.title}}</document_title>\n<section_path>{{section.path}}</section_path>\n<containing_block>{{block.text}}</containing_block>\n<additional_instruction>{{generation.instruction}}</additional_instruction>"
});

export const translateDefaults = nodeType({
  id: "translate",
  name: "翻译",
  icon: "translate",
  cardVariant: "translate",
  executionMode: "ai",
  color: "#7454c5",
  isBuiltIn: true,
  enabled: true,
  relationLabel: "翻译",
  systemPrompt:
    "生成一篇忠实、可学习的双语翻译子文章。保留代码标识、公式和专有名词，目标语言为 {{output.language}}。",
  userPrompt:
    "请翻译 <selection>{{selection.text}}</selection>。\n\n<containing_block>{{block.text}}</containing_block>\n<section_path>{{section.path}}</section_path>\n<document_title>{{document.title}}</document_title>"
});

export const initialGenerationTypes: GenerationTypeConfig[] = [
  rootDefaults,
  explainDefaults,
  translateDefaults,
  nodeType({
    id: "summary",
    name: "总结",
    icon: "summary",
    cardVariant: "summary",
    executionMode: "ai",
    color: "#287c91",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "总结",
    systemPrompt:
      "把给定内容整理为一篇可独立阅读的总结文章，提炼核心结论、关键术语与适用边界。使用 {{output.language}}。",
    userPrompt:
      "总结 <selection>{{selection.text}}</selection>，并结合所在章节 {{section.path}} 说明结论之间的关系。"
  }),
  nodeType({
    id: "highlight",
    name: "重点",
    icon: "highlight",
    cardVariant: "highlight",
    executionMode: "manual",
    color: "#c05245",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "重点",
    systemPrompt: "",
    userPrompt: ""
  }),
  nodeType({
    id: "socratic",
    name: "追问",
    icon: "question",
    cardVariant: "question",
    executionMode: "ai",
    interactive: true,
    color: "#2f8468",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "追问",
    systemPrompt:
      "围绕选区提出由浅入深的问题，并给出能够继续学习的解释。所有内容使用 {{output.language}}。",
    userPrompt:
      "围绕 <selection>{{selection.text}}</selection> 提出一个关键追问并回答，参考 {{section.path}}。"
  }),
  nodeType({
    id: "terms",
    name: "术语",
    icon: "terms",
    cardVariant: "terms",
    executionMode: "ai",
    color: "#b56827",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "术语",
    systemPrompt:
      "提炼选区中的关键术语，给出简洁定义与使用边界。使用 {{output.language}}。",
    userPrompt:
      "从 <selection>{{selection.text}}</selection> 中提炼术语，并结合 {{block.text}} 消除歧义。"
  }),
  nodeType({
    id: "compare",
    name: "对比",
    icon: "compare",
    cardVariant: "compare",
    executionMode: "ai",
    color: "#a04f86",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "对比",
    systemPrompt:
      "把选区中的两个概念或方案组织为结构清楚的对比文章，明确相同点、差异和适用场景。使用 {{output.language}}。",
    userPrompt:
      "对比 <selection>{{selection.text}}</selection> 中的核心对象，并参考 {{block.text}}。"
  }),
  nodeType({
    id: "code",
    name: "代码",
    icon: "code",
    cardVariant: "code",
    executionMode: "ai",
    color: "#596579",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "代码",
    systemPrompt:
      "把选区转换为最小、可读、带必要说明的代码示例。不要虚构不存在的 API。使用 {{output.language}} 解释。",
    userPrompt:
      "为 <selection>{{selection.text}}</selection> 编写一个最小实现，并说明它与 {{document.title}} 的关系。"
  }),
  nodeType({
    id: "checklist",
    name: "实践清单",
    icon: "checklist",
    cardVariant: "checklist",
    executionMode: "ai",
    interactive: true,
    color: "#2f8468",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "实践清单",
    systemPrompt:
      "把学习内容转为可执行、可检查的步骤清单，每一步都应具体且有完成标准。使用 {{output.language}}。",
    userPrompt:
      "把 <selection>{{selection.text}}</selection> 转为实践清单，并结合 {{section.path}} 排列顺序。"
  }),
  nodeType({
    id: "note",
    name: "个人笔记",
    icon: "note",
    cardVariant: "note",
    executionMode: "manual",
    color: "#b56827",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "个人笔记",
    systemPrompt: "",
    userPrompt: ""
  }),
  nodeType({
    id: "source",
    name: "原文来源",
    icon: "source",
    cardVariant: "source",
    executionMode: "manual",
    color: "#475569",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "原文来源",
    systemPrompt: "",
    userPrompt: ""
  }),
  nodeType({
    id: "flashcard",
    name: "复习闪卡",
    icon: "flashcard",
    cardVariant: "flashcard",
    executionMode: "ai",
    interactive: true,
    color: "#c05245",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "复习闪卡",
    systemPrompt:
      "把选区转换为一张适合主动回忆的复习闪卡。问题必须具体，答案应简短但完整。使用 {{output.language}}。",
    userPrompt:
      "根据 <selection>{{selection.text}}</selection> 生成一个问题和答案，并参考 {{block.text}}。"
  })
];

const contextScopes: ContextScope[] = [
  "containingParagraph",
  "nearbyParagraphs",
  "section",
  "article",
  "parentArticle",
  "allParentArticles"
];
const iconIds: GenerationTypeIconId[] = [
  "root",
  "explain",
  "translate",
  "summary",
  "highlight",
  "question",
  "terms",
  "compare",
  "code",
  "checklist",
  "note",
  "source",
  "flashcard"
];
const executionModes: NodeExecutionMode[] = ["ai", "manual", "system"];

export function isGenerationTypeIconId(
  value: unknown
): value is GenerationTypeIconId {
  return typeof value === "string" && iconIds.includes(value as GenerationTypeIconId);
}

export function isTopologyCardVariant(
  value: unknown
): value is TopologyCardVariant {
  return typeof value === "string" && iconIds.includes(value as TopologyCardVariant);
}

export function cloneGenerationType(type: GenerationTypeConfig) {
  return { ...type };
}

function inferredVariant(value: Partial<GenerationTypeConfig>, fallback: GenerationTypeConfig) {
  if (iconIds.includes(value.cardVariant as TopologyCardVariant)) {
    return value.cardVariant as TopologyCardVariant;
  }
  if (value.id === "socratic") return "question";
  if (iconIds.includes(value.icon as GenerationTypeIconId)) {
    return value.icon as TopologyCardVariant;
  }
  return fallback.cardVariant;
}

function normalizeGenerationType(
  value: Partial<GenerationTypeConfig>,
  fallback: GenerationTypeConfig
): GenerationTypeConfig | null {
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string"
  ) {
    return null;
  }
  const builtInDefault = initialGenerationTypes.find((item) => item.id === value.id);
  const executionMode = executionModes.includes(
    value.executionMode as NodeExecutionMode
  )
    ? (value.executionMode as NodeExecutionMode)
    : fallback.executionMode;
  if (
    executionMode === "ai" &&
    (typeof value.systemPrompt !== "string" ||
      typeof value.userPrompt !== "string")
  ) {
    return null;
  }
  return {
    id: value.id,
    name:
      value.id === "root" && value.name === "主文章"
        ? rootDefaults.name
        : value.name,
    icon: iconIds.includes(value.icon as GenerationTypeIconId)
      ? (value.icon as GenerationTypeIconId)
      : fallback.icon,
    cardVariant: inferredVariant(value, fallback),
    executionMode,
    interactive:
      typeof value.interactive === "boolean"
        ? value.interactive
        : fallback.interactive,
    color: typeof value.color === "string" ? value.color : fallback.color,
    isBuiltIn: builtInDefault ? true : Boolean(value.isBuiltIn),
    enabled:
      executionMode === "system"
        ? false
        : typeof value.enabled === "boolean"
          ? value.enabled
          : fallback.enabled,
    modelBindingId:
      executionMode === "ai" && typeof value.modelBindingId === "string"
        ? value.modelBindingId
        : "global-default",
    relationLabel:
      typeof value.relationLabel === "string"
        ? value.relationLabel
        : value.name,
    systemPrompt: executionMode === "ai" ? value.systemPrompt! : "",
    userPrompt: executionMode === "ai" ? value.userPrompt! : "",
    contextScope:
      executionMode === "ai" &&
      contextScopes.includes(value.contextScope as ContextScope)
      ? (value.contextScope as ContextScope)
      : "containingParagraph"
  };
}

export function loadGenerationTypes(): GenerationTypeConfig[] {
  const fallback = initialGenerationTypes.map(cloneGenerationType);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(GENERATION_TYPES_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return fallback;
    const normalized = parsed
      .map((value) =>
        value && typeof value === "object"
          ? normalizeGenerationType(
              value as Partial<GenerationTypeConfig>,
              initialGenerationTypes.find(
                (item) => item.id === (value as Partial<GenerationTypeConfig>).id
              ) ?? explainDefaults
            )
          : null
      )
      .filter((value): value is GenerationTypeConfig => Boolean(value));
    const savedById = new Map(normalized.map((type) => [type.id, type]));
    return [
      ...initialGenerationTypes.map((type) =>
        savedById.get(type.id) ?? cloneGenerationType(type)
      ),
      ...normalized.filter(
        (type) => !initialGenerationTypes.some((item) => item.id === type.id)
      )
    ];
  } catch {
    return fallback;
  }
}

export function saveGenerationTypes(types: GenerationTypeConfig[]) {
  try {
    window.localStorage.setItem(
      GENERATION_TYPES_STORAGE_KEY,
      JSON.stringify(types)
    );
  } catch {
    // Keep editing available if storage is unavailable.
  }
}

export function renderPromptTemplate(
  template: string,
  values: Record<string, string>
) {
  return template.replace(
    /{{\s*([a-zA-Z0-9_.]+)\s*}}/g,
    (original, variable: string) =>
      Object.prototype.hasOwnProperty.call(values, variable)
        ? values[variable]
        : original
  );
}
