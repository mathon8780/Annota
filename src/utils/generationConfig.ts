import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ArticleNode, NodeFamily } from "../types";

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
  | "flashcard"
  | "formula"
  | "diagram"
  | "pitfall"
  | "analogy"
  | "task";

export type TopologyCardVariant = GenerationTypeIconId;
export type NodeExecutionMode = "ai" | "manual" | "system";

export interface NodeModelParameters {
  temperature: number;
  topP: number;
  maxTokens: number;
}

export type NodeDisplayField =
  | "type"
  | "title"
  | "summary"
  | "source"
  | "model"
  | "content";

export interface GenerationTypeConfig {
  id: string;
  name: string;
  description: string;
  family: NodeFamily;
  icon: GenerationTypeIconId;
  cardVariant: TopologyCardVariant;
  executionMode: NodeExecutionMode;
  interactive: boolean;
  color: string;
  isBuiltIn: boolean;
  enabled: boolean;
  modelBindingId: string;
  modelParameters: NodeModelParameters;
  relationLabel: string;
  systemPrompt: string;
  userPrompt: string;
  contextScope: ContextScope;
  displayFields: NodeDisplayField[];
}

export interface GenerationTypeIndex {
  byId: ReadonlyMap<string, GenerationTypeConfig>;
  byName: ReadonlyMap<string, GenerationTypeConfig>;
  byRelationLabel: ReadonlyMap<string, GenerationTypeConfig>;
  fallback: GenerationTypeConfig;
  first: GenerationTypeConfig;
  root: GenerationTypeConfig;
}

export const GENERATION_TYPES_STORAGE_KEY = "annota.generation-types.v1";
export const GENERATION_TYPES_HYDRATED_EVENT = "annota:generation-types-hydrated";

export const TYPE_FAMILIES: Readonly<Record<string, NodeFamily>> = {
  root: "笔记",
  explain: "笔记",
  translate: "笔记",
  summary: "记录",
  highlight: "记录",
  socratic: "交互",
  terms: "记录",
  compare: "记录",
  code: "笔记",
  checklist: "交互",
  note: "记录",
  source: "记录",
  flashcard: "交互",
  formula: "记录",
  diagram: "记录",
  pitfall: "记录",
  analogy: "记录",
  task: "交互"
};

export function typeFamily(id: string): NodeFamily {
  return TYPE_FAMILIES[id] ?? "记录";
}

export function createGenerationTypeIndex(
  nodeTypes: readonly GenerationTypeConfig[]
): GenerationTypeIndex {
  const first = nodeTypes[0];
  const fallback =
    nodeTypes.find((type) => type.id === "explain") ?? first;
  const root = nodeTypes.find((type) => type.id === "root") ?? first;
  const byId = new Map<string, GenerationTypeConfig>();
  const byName = new Map<string, GenerationTypeConfig>();
  const byRelationLabel = new Map<string, GenerationTypeConfig>();
  nodeTypes.forEach((type) => {
    if (!byId.has(type.id)) byId.set(type.id, type);
    if (!byName.has(type.name)) byName.set(type.name, type);
    if (!byRelationLabel.has(type.relationLabel)) {
      byRelationLabel.set(type.relationLabel, type);
    }
  });
  return { byId, byName, byRelationLabel, fallback, first, root };
}

export function resolveArticleGenerationType(
  article: ArticleNode,
  index: GenerationTypeIndex
): GenerationTypeConfig {
  const sourceType = article.source?.generationType
    ? index.byId.get(article.source.generationType)
    : undefined;
  const configuredType = article.parentId === null
    ? index.root
    : sourceType ??
      index.byRelationLabel.get(article.type) ??
      index.byName.get(article.type);
  if (configuredType) return configuredType;

  const appearance = article.appearance;
  if (!appearance) return index.first;
  return {
    ...index.fallback,
    id: appearance.typeId,
    name: article.type,
    relationLabel: article.type,
    icon: appearance.icon,
    cardVariant: appearance.cardVariant,
    color: appearance.color
  };
}

function nodeType(
  config: Omit<
    GenerationTypeConfig,
    | "description"
    | "family"
    | "modelBindingId"
    | "modelParameters"
    | "contextScope"
    | "interactive"
    | "displayFields"
  > &
    Pick<
      Partial<GenerationTypeConfig>,
      "description" | "family" | "interactive" | "displayFields"
    >
): GenerationTypeConfig {
  return {
    ...config,
    description: config.description ?? `${config.name}节点的行为与展示配置。`,
    family: config.family ?? typeFamily(config.id),
    interactive: config.interactive ?? false,
    modelBindingId: "global-default",
    modelParameters: {
      temperature: 0.3,
      topP: 1,
      maxTokens: 2048
    },
    contextScope: "containingParagraph",
    displayFields: config.displayFields ?? ["type", "title", "summary", "content"]
  };
}

export const rootDefaults = nodeType({
  id: "root",
  name: "知识点",
  icon: "root",
  cardVariant: "root",
  executionMode: "system",
  color: "#475569",
  isBuiltIn: true,
  enabled: false,
  relationLabel: "主文章",
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
    interactive: true,
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
    interactive: true,
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
    interactive: true,
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
  }),
  nodeType({
    id: "formula",
    name: "公式",
    icon: "formula",
    cardVariant: "formula",
    executionMode: "manual",
    color: "#0284c7",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "公式",
    systemPrompt: "",
    userPrompt: ""
  }),
  nodeType({
    id: "diagram",
    name: "架构图",
    icon: "diagram",
    cardVariant: "diagram",
    executionMode: "manual",
    color: "#059669",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "架构图",
    systemPrompt: "",
    userPrompt: ""
  }),
  nodeType({
    id: "pitfall",
    name: "避坑",
    icon: "pitfall",
    cardVariant: "pitfall",
    executionMode: "manual",
    color: "#e11d48",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "避坑",
    systemPrompt: "",
    userPrompt: ""
  }),
  nodeType({
    id: "analogy",
    name: "类比",
    icon: "analogy",
    cardVariant: "analogy",
    executionMode: "manual",
    color: "#b45309",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "类比",
    systemPrompt: "",
    userPrompt: ""
  }),
  nodeType({
    id: "task",
    name: "任务",
    icon: "task",
    cardVariant: "task",
    executionMode: "manual",
    color: "#64748b",
    isBuiltIn: true,
    enabled: false,
    relationLabel: "任务",
    systemPrompt: "",
    userPrompt: ""
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
  "flashcard",
  "formula",
  "diagram",
  "pitfall",
  "analogy",
  "task"
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
  return {
    ...type,
    modelParameters: { ...type.modelParameters },
    displayFields: [...type.displayFields]
  };
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
    description:
      typeof value.description === "string"
        ? value.description
        : fallback.description,
    family:
      value.family === "笔记" || value.family === "记录" || value.family === "交互"
        ? value.family
        : typeFamily(value.id),
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
    modelParameters: {
      temperature:
        typeof value.modelParameters?.temperature === "number"
          ? Math.min(2, Math.max(0, value.modelParameters.temperature))
          : fallback.modelParameters.temperature,
      topP:
        typeof value.modelParameters?.topP === "number"
          ? Math.min(1, Math.max(0, value.modelParameters.topP))
          : fallback.modelParameters.topP,
      maxTokens:
        typeof value.modelParameters?.maxTokens === "number"
          ? Math.min(32768, Math.max(128, Math.round(value.modelParameters.maxTokens)))
          : fallback.modelParameters.maxTokens
    },
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
      : "containingParagraph",
    displayFields: Array.isArray(value.displayFields)
      ? value.displayFields.filter(
          (field): field is NodeDisplayField =>
            ["type", "title", "summary", "source", "model", "content"].includes(
              field as NodeDisplayField
            )
        )
      : [...fallback.displayFields]
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
  if (isTauri()) {
    void invoke("replace_node_type_definitions", { definitions: types }).catch(
      () => undefined
    );
  }
}

export async function hydrateGenerationTypesFromDatabase() {
  if (!isTauri()) return loadGenerationTypes();
  const definitions = await invoke<unknown[]>("load_node_type_definitions");
  if (!definitions.length) {
    const initial = loadGenerationTypes();
    await invoke("replace_node_type_definitions", { definitions: initial });
    return initial;
  }
  window.localStorage.setItem(
    GENERATION_TYPES_STORAGE_KEY,
    JSON.stringify(definitions)
  );
  const hydrated = loadGenerationTypes();
  window.dispatchEvent(new CustomEvent(GENERATION_TYPES_HYDRATED_EVENT));
  return hydrated;
}

export function subscribeGenerationTypeHydration(listener: () => void) {
  window.addEventListener(GENERATION_TYPES_HYDRATED_EVENT, listener);
  return () => window.removeEventListener(GENERATION_TYPES_HYDRATED_EVENT, listener);
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

/** 节点级配置:未配置(undefined/null)的字段继承类型级配置。 */
export interface NodeLevelConfig {
  modelBindingId?: string | null;
  modelParameters?: Partial<NodeModelParameters> | null;
  systemPrompt?: string | null;
  userPrompt?: string | null;
  displayFields?: NodeDisplayField[] | null;
}

const NODE_DISPLAY_FIELDS: readonly NodeDisplayField[] = [
  "type",
  "title",
  "summary",
  "source",
  "model",
  "content"
];

/** 兼容旧载荷/任意 JSON 的节点级配置归一化;非法结构丢弃对应字段。 */
export function normalizeNodeLevelConfig(
  value: unknown
): NodeLevelConfig | null {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const normalized: NodeLevelConfig = {};
  if (typeof raw.modelBindingId === "string") {
    normalized.modelBindingId = raw.modelBindingId;
  }
  if (raw.modelParameters && typeof raw.modelParameters === "object") {
    const parameters = raw.modelParameters as Record<string, unknown>;
    const modelParameters: Partial<NodeModelParameters> = {};
    if (typeof parameters.temperature === "number") {
      modelParameters.temperature = Math.min(2, Math.max(0, parameters.temperature));
    }
    if (typeof parameters.topP === "number") {
      modelParameters.topP = Math.min(1, Math.max(0, parameters.topP));
    }
    if (typeof parameters.maxTokens === "number") {
      modelParameters.maxTokens = Math.min(32768, Math.max(128, Math.round(parameters.maxTokens)));
    }
    if (Object.keys(modelParameters).length > 0) {
      normalized.modelParameters = modelParameters;
    }
  }
  if (typeof raw.systemPrompt === "string") {
    normalized.systemPrompt = raw.systemPrompt;
  }
  if (typeof raw.userPrompt === "string") {
    normalized.userPrompt = raw.userPrompt;
  }
  if (Array.isArray(raw.displayFields)) {
    const displayFields = raw.displayFields.filter(
      (field): field is NodeDisplayField =>
        typeof field === "string" &&
        NODE_DISPLAY_FIELDS.includes(field as NodeDisplayField)
    );
    if (displayFields.length > 0) {
      normalized.displayFields = Array.from(new Set(displayFields));
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

/** 节点级配置覆盖类型级配置:未配置字段继承类型级,返回合并后的完整配置。 */
export function mergeNodeLevelConfig(
  nodeConfig: NodeLevelConfig | null | undefined,
  typeConfig: GenerationTypeConfig
): GenerationTypeConfig {
  if (!nodeConfig) return typeConfig;
  return {
    ...typeConfig,
    modelBindingId:
      typeof nodeConfig.modelBindingId === "string"
        ? nodeConfig.modelBindingId
        : typeConfig.modelBindingId,
    modelParameters: {
      temperature:
        typeof nodeConfig.modelParameters?.temperature === "number"
          ? nodeConfig.modelParameters.temperature
          : typeConfig.modelParameters.temperature,
      topP:
        typeof nodeConfig.modelParameters?.topP === "number"
          ? nodeConfig.modelParameters.topP
          : typeConfig.modelParameters.topP,
      maxTokens:
        typeof nodeConfig.modelParameters?.maxTokens === "number"
          ? nodeConfig.modelParameters.maxTokens
          : typeConfig.modelParameters.maxTokens
    },
    systemPrompt:
      typeof nodeConfig.systemPrompt === "string"
        ? nodeConfig.systemPrompt
        : typeConfig.systemPrompt,
    userPrompt:
      typeof nodeConfig.userPrompt === "string"
        ? nodeConfig.userPrompt
        : typeConfig.userPrompt,
    displayFields:
      Array.isArray(nodeConfig.displayFields) && nodeConfig.displayFields.length > 0
        ? nodeConfig.displayFields
        : typeConfig.displayFields
  };
}
