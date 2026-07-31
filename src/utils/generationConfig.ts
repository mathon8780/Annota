export type ContextScope =
  | "containingParagraph"
  | "nearbyParagraphs"
  | "section"
  | "article"
  | "parentArticle"
  | "allParentArticles";

export type GenerationTypeIconId =
  | "explain"
  | "translate"
  | "question"
  | "terms"
  | "reading"
  | "insight";

export interface GenerationTypeConfig {
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
}

export const GENERATION_TYPES_STORAGE_KEY = "annota.generation-types.v1";

export const explainDefaults: GenerationTypeConfig = {
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
  contextScope: "containingParagraph"
};

export const translateDefaults: GenerationTypeConfig = {
  id: "translate",
  name: "翻译",
  icon: "translate",
  color: "#7454c5",
  isBuiltIn: true,
  enabled: true,
  modelBindingId: "global-default",
  relationLabel: "翻译",
  systemPrompt:
    "生成一篇忠实、可学习的双语翻译子文章。保留代码标识、公式和专有名词，目标语言为 {{output.language}}。",
  userPrompt:
    "请翻译 <selection>{{selection.text}}</selection>。\n\n<containing_block>{{block.text}}</containing_block>\n<section_path>{{section.path}}</section_path>\n<document_title>{{document.title}}</document_title>",
  contextScope: "containingParagraph"
};

export const initialGenerationTypes: GenerationTypeConfig[] = [
  explainDefaults,
  translateDefaults,
  {
    id: "socratic",
    name: "苏格拉底式追问",
    icon: "question",
    color: "#2f8468",
    isBuiltIn: false,
    enabled: true,
    modelBindingId: "global-default",
    relationLabel: "追问",
    systemPrompt:
      "围绕选区提出由浅入深的问题，帮助读者主动检查理解。所有问题使用 {{output.language}}。",
    userPrompt:
      "为 <selection>{{selection.text}}</selection> 设计一组递进问题，并参考 {{section.path}}。",
    contextScope: "containingParagraph"
  },
  {
    id: "terms",
    name: "提炼术语",
    icon: "terms",
    color: "#b56827",
    isBuiltIn: false,
    enabled: false,
    modelBindingId: "global-default",
    relationLabel: "术语",
    systemPrompt:
      "提炼选区中的关键术语，给出简洁定义与使用边界。使用 {{output.language}}。",
    userPrompt:
      "从 <selection>{{selection.text}}</selection> 中提炼术语，并结合 {{block.text}} 消除歧义。",
    contextScope: "containingParagraph"
  }
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
  "explain",
  "translate",
  "question",
  "terms",
  "reading",
  "insight"
];

export function cloneGenerationType(type: GenerationTypeConfig) {
  return { ...type };
}

function normalizeGenerationType(
  value: Partial<GenerationTypeConfig>,
  fallback: GenerationTypeConfig
): GenerationTypeConfig | null {
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.systemPrompt !== "string" ||
    typeof value.userPrompt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    icon: iconIds.includes(value.icon as GenerationTypeIconId)
      ? (value.icon as GenerationTypeIconId)
      : fallback.icon,
    color: typeof value.color === "string" ? value.color : fallback.color,
    isBuiltIn:
      value.id === "explain" || value.id === "translate"
        ? true
        : Boolean(value.isBuiltIn),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    modelBindingId:
      typeof value.modelBindingId === "string"
        ? value.modelBindingId
        : "global-default",
    relationLabel:
      typeof value.relationLabel === "string"
        ? value.relationLabel
        : value.name,
    systemPrompt: value.systemPrompt,
    userPrompt: value.userPrompt,
    contextScope: contextScopes.includes(value.contextScope as ContextScope)
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
      .map((value, index) =>
        value && typeof value === "object"
          ? normalizeGenerationType(
              value as Partial<GenerationTypeConfig>,
              initialGenerationTypes[index] ?? explainDefaults
            )
          : null
      )
      .filter((value): value is GenerationTypeConfig => Boolean(value));
    return normalized.length ? normalized : fallback;
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
