import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  AlignLeft,
  BookOpenText,
  Check,
  CircleHelp,
  Code2,
  Focus,
  GalleryHorizontalEnd,
  GitCompareArrows,
  Highlighter,
  Languages,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Network,
  NotebookPen,
  Pin,
  Plus,
  Quote,
  Sigma,
  Tag,
  Trash2,
  TriangleAlert,
  Unlink,
  Workflow,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type { ArticleNode } from "../types";
import {
  sortArticleChildren,
  sourceBlockIdsInDocumentOrder
} from "../utils/articleNodeOrder";
import type {
  TopologyGraphRecord,
  TopologyNodeRecord
} from "../utils/topologyRepository";
import {
  createGenerationTypeIndex,
  loadGenerationTypes,
  mergeNodeLevelConfig,
  normalizeNodeLevelConfig,
  resolveArticleGenerationType,
  type GenerationTypeConfig,
  type GenerationTypeIconId,
  type GenerationTypeIndex,
  type NodeLevelConfig,
  type TopologyCardVariant
} from "../utils/generationConfig";
import {
  configuredModels,
  loadModelProviders
} from "../utils/modelProviders";
import {
  formatShortcut,
  matchesShortcut
} from "../utils/shortcuts";
import type { ShortcutBinding } from "../utils/shortcuts";

interface TopologyPanelProps {
  articles: Record<string, ArticleNode>;
  rootId: string;
  rootIds?: string[];
  currentId: string;
  onNavigate: (id: string) => void;
  fullScreen: boolean;
  sharedTransition: boolean;
  onFullScreen: (value: boolean) => void;
  focusShortcut: ShortcutBinding;
  pinShortcut: ShortcutBinding;
  topologyGraph: TopologyGraphRecord | null;
  topologyError: string;
  onCreateRoot: (title: string, markdown?: string) => Promise<string | null>;
  onCreateManualNode: (draft: {
    nodeType: string;
    title: string;
    content: string;
    parentId: string | null;
    isRoot: boolean;
    interactive: boolean;
    icon: GenerationTypeIconId;
    cardVariant: GenerationTypeConfig["cardVariant"];
    color: string;
  }) => Promise<TopologyNodeRecord | null>;
  onUpdateManualNode: (node: TopologyNodeRecord) => Promise<void>;
  onUpdateNodeConfig: (
    nodeId: string,
    config: NodeLevelConfig | null
  ) => Promise<void>;
  onRegenerateNode: (
    nodeId: string
  ) => Promise<{ ok: boolean; message: string }>;
  onRemoveManualNode: (nodeId: string) => Promise<void>;
  onCreateRelation: (
    sourceNodeId: string,
    targetNodeId: string,
    label: string,
    directed?: boolean
  ) => Promise<void>;
  onRemoveRelation: (relationId: string) => Promise<void>;
  onUpdateInteraction: (
    nodeId: string,
    interactionType: string,
    state: Record<string, unknown>
  ) => Promise<void>;
}

interface Position {
  id: string;
  x: number;
  y: number;
  depth: number;
  width: number;
  height: number;
}

interface TopologySize {
  width: number;
  height: number;
}

type TopologyCardBody =
  | { kind: "text"; text: string }
  | { kind: "bilingual"; original: string; translation: string }
  | { kind: "quote"; text: string }
  | { kind: "qa"; question: string; answer: string }
  | { kind: "split"; left: string; right: string }
  | { kind: "code"; text: string }
  | { kind: "checklist"; items: Array<{ text: string; checked: boolean }> }
  | { kind: "flash"; answer: string }
  | { kind: "terms"; items: string[] }
  | { kind: "root"; description: string }
  | { kind: "metric"; metric: string; label: string; text: string }
  | { kind: "formula"; formula: string; note: string }
  | { kind: "diagram"; nodes: string[]; rendering: string }
  | { kind: "pitfall"; bad: string; good: string }
  | { kind: "analogy"; text: string }
  | { kind: "task"; status: string; detail: string };

export interface TopologyDisplayNode {
  id: string;
  title: string;
  summary: string;
  nodeType: GenerationTypeConfig;
  body: TopologyCardBody;
  article?: ArticleNode;
  manual?: TopologyNodeRecord;
  stored?: TopologyNodeRecord;
}

function topologyCardSize(
  node?: TopologyDisplayNode,
  measuredHeights?: Readonly<Record<string, number>>
) {
  if (!node?.nodeType?.cardVariant || node.body?.kind === "text") {
    return TOPOLOGY_DEFAULT_NODE_SIZE;
  }
  const variantSize =
    TOPOLOGY_CARD_SIZES[node.nodeType.cardVariant] ?? TOPOLOGY_DEFAULT_NODE_SIZE;
  const measured = node ? measuredHeights?.[node.id] : undefined;
  if (typeof measured === "number" && measured > 0) {
    return { width: variantSize.width, height: measured };
  }
  return variantSize;
}

interface TopologyDisplayEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  directed: boolean;
  persisted: boolean;
  hierarchical: boolean;
}

interface TopologySizePreference {
  version: 2;
  widthRatio: number;
  heightRatio: number;
}

type ResizeEdge = "left" | "top" | "top-left";
type TopologyFocusMode = "overall" | "current" | null;

const TOPOLOGY_DEFAULT_SIZE = { width: 420, height: 322 };
const TOPOLOGY_MIN_SIZE = { width: 280, height: 220 };
const TOPOLOGY_MAX_SIZE = { width: 720, height: 560 };
const TOPOLOGY_MAX_VIEWPORT_RATIO = { width: 0.62, height: 0.68 };
const TOPOLOGY_LEGACY_REFERENCE_VIEWPORT = { width: 1888, height: 952 };
const TOPOLOGY_SIZE_STORAGE_KEY = "annota:topology-size";
const TOPOLOGY_NODE_WIDTH = 214;
const TOPOLOGY_NODE_HEIGHT = 118;
const TOPOLOGY_NODE_X_GAP = 276;
const TOPOLOGY_BRANCH_GAP = 36;
const TOPOLOGY_ROOT_GAP = 72;
const TOPOLOGY_DEFAULT_NODE_SIZE = { width: TOPOLOGY_NODE_WIDTH, height: TOPOLOGY_NODE_HEIGHT };
const TOPOLOGY_CARD_SIZES: Partial<Record<TopologyCardVariant, { width: number; height: number }>> = {
  root: { width: 250, height: 152 },
  terms: { width: 205, height: 108 },
  translate: { width: 230, height: 134 },
  compare: { width: 230, height: 134 },
  question: { width: 214, height: 134 },
  code: { width: 228, height: 134 },
  checklist: { width: 214, height: 132 },
  highlight: { width: 222, height: 130 },
  source: { width: 222, height: 130 },
  flashcard: { width: 220, height: 128 },
  summary: { width: 205, height: 118 },
  formula: { width: 232, height: 134 },
  diagram: { width: 234, height: 136 },
  pitfall: { width: 236, height: 134 },
  analogy: { width: 216, height: 122 },
  task: { width: 220, height: 124 }
};
const TOPOLOGY_SCENE_PADDING_Y = 96;
const TOPOLOGY_CURRENT_FOCUS_SCALE = 0.9;
const TOPOLOGY_MIN_SCALE = 0.18;
const TOPOLOGY_MAX_SCALE = 1.7;
const TOPOLOGY_FIT_PADDING = 36;
const EDITABLE_INTERACTION_VARIANTS = new Set([
  "highlight",
  "checklist",
  "note",
  "source",
  "flashcard"
]);

const topologyNodeIcons: Record<GenerationTypeIconId, typeof Network> = {
  root: BookOpenText,
  explain: MessageSquareText,
  translate: Languages,
  summary: AlignLeft,
  highlight: Highlighter,
  question: CircleHelp,
  terms: Tag,
  compare: GitCompareArrows,
  code: Code2,
  checklist: ListChecks,
  note: NotebookPen,
  source: Quote,
  flashcard: GalleryHorizontalEnd,
  formula: Sigma,
  diagram: Workflow,
  pitfall: TriangleAlert,
  analogy: Lightbulb,
  task: LoaderCircle
};

function parseStateJson(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? "{}") as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** 解析结构化内容 JSON(契约 content_json),兼容已解析对象/字符串/缺省。 */
function parseContentJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") return parseStateJson(value);
  return {};
}

/** 读取契约中文键字符串值。 */
function cjValue(value: Record<string, unknown>, key: string): string {
  return typeof value[key] === "string" ? (value[key] as string).trim() : "";
}

/** 契约对比项数组 → ["名称：描述"]。 */
function compareItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (item && typeof item === "object") {
        const name = cjValue(item as Record<string, unknown>, "名称");
        const description = cjValue(item as Record<string, unknown>, "描述");
        return [name, description].filter(Boolean).join("：");
      }
      return typeof item === "string" ? item : "";
    })
    .filter(Boolean);
}

/** 契约清单项数组 → [{文本, 已完成}]。 */
function checklistJsonItems(
  value: Record<string, unknown>
): Array<{ text: string; checked: boolean }> {
  const raw = Array.isArray(value["清单项"]) ? value["清单项"] : [];
  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object"
    )
    .map((item) => ({
      text: typeof item["文本"] === "string" ? item["文本"] : "",
      checked: item["已完成"] === true
    }))
    .filter((item) => item.text);
}

function interactionStatesByNode(graph: TopologyGraphRecord | null) {
  const interactionsByNode = new Map<
    string,
    TopologyGraphRecord["interactions"]
  >();
  (graph?.interactions ?? []).forEach((interaction) => {
    const values = interactionsByNode.get(interaction.nodeId) ?? [];
    interactionsByNode.set(interaction.nodeId, [...values, interaction]);
  });
  return new Map(
    Array.from(interactionsByNode, ([nodeId, interactions]) => [
      nodeId,
      [...interactions]
        .sort(
          (left, right) =>
            Number(left.interactionType === "topology-card") -
            Number(right.interactionType === "topology-card")
        )
        .reduce<Record<string, unknown>>(
          (state, interaction) => ({
            ...state,
            ...parseStateJson(interaction.stateJson)
          }),
          {}
        )
    ])
  );
}

function stringItems(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function checklistItemsFromText(value: string): string[] {
  return value
    .split(/\r?\n|[；;]/)
    .map((item) => item.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
}

function topologySummary(
  node: TopologyDisplayNode,
  state: Record<string, unknown>
) {
  const variant = node.nodeType.cardVariant;
  if (variant === "checklist") {
    const items = stringItems(state.items);
    return items.length ? items.join("；") : node.summary;
  }
  if (variant === "flashcard" && typeof state.answer === "string") {
    return state.answer;
  }
  if (typeof state.content === "string") return state.content;
  return node.summary;
}

function splitBodyItems(value: string): string[] {
  return value
    .split(/\r?\n|[；;、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveGenerationModel(
  node: TopologyDisplayNode,
  modelBindingId = node.nodeType.modelBindingId
): string {
  const generationSources = [
    node.article?.generationJson,
    node.stored?.generationJson,
    node.manual?.generationJson
  ];
  for (const source of generationSources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const model = (source as Record<string, unknown>)["模型"];
    if (typeof model === "string" && model.trim()) return model.trim();
  }
  return modelBindingId;
}

export function resolveCardBody(
  node: {
    title: string;
    summary: string;
    nodeType: GenerationTypeConfig;
    article?: ArticleNode;
    manual?: TopologyNodeRecord;
    stored?: TopologyNodeRecord;
  },
  state: Record<string, unknown>
): TopologyCardBody {
  const variant = node.nodeType.cardVariant;
  const summary = node.summary;
  const quote = node.article?.source?.quote ?? "";
  const content =
    typeof state.content === "string" && state.content.trim()
      ? state.content.trim()
      : node.stored?.content?.trim() ?? node.manual?.content?.trim() ?? "";
  const fallbackText = content || summary || "暂无内容";
  const contentJson = parseContentJson(
    node.article?.contentJson ?? node.stored?.contentJson ?? node.manual?.contentJson
  );
  switch (variant) {
    case "highlight":
    case "source": {
      const text = cjValue(contentJson, "引文") || quote || content || summary;
      return text ? { kind: "quote", text } : { kind: "text", text: fallbackText };
    }
    case "translate": {
      const original = cjValue(contentJson, "原文") || quote || content;
      const translation = cjValue(contentJson, "译文") || summary || content || "";
      if (original && translation) {
        return { kind: "bilingual", original, translation };
      }
      return { kind: "text", text: original || translation || fallbackText };
    }
    case "question": {
      const answer = cjValue(contentJson, "后续追问") || content || summary;
      if (answer) {
        return {
          kind: "qa",
          question: cjValue(contentJson, "问题") || node.title,
          answer
        };
      }
      return { kind: "text", text: fallbackText };
    }
    case "compare": {
      const jsonItems = compareItems(contentJson["对比项"]);
      if (jsonItems.length >= 2) {
        return { kind: "split", left: jsonItems[0], right: jsonItems[1] };
      }
      const parts = splitBodyItems(content || summary);
      if (parts.length >= 2) return { kind: "split", left: parts[0], right: parts[1] };
      return { kind: "text", text: fallbackText };
    }
    case "code": {
      const text = cjValue(contentJson, "代码") || content || summary;
      return text ? { kind: "code", text } : { kind: "text", text: fallbackText };
    }
    case "checklist": {
      const jsonItems = checklistJsonItems(contentJson);
      const checkedSet = new Set(
        Array.isArray(state.checked)
          ? state.checked.filter((value): value is number => typeof value === "number")
          : []
      );
      // 用户交互状态(checked 数组存在即权威,空数组=全部未勾);否则回退内容 JSON 的已完成
      const hasInteraction = Array.isArray(state.checked);
      if (jsonItems.length) {
        return {
          kind: "checklist",
          items: jsonItems.map((item, index) => ({
            text: item.text,
            checked: hasInteraction ? checkedSet.has(index) : item.checked
          }))
        };
      }
      const rawItems = stringItems(state.items);
      const items = rawItems.length
        ? rawItems
        : checklistItemsFromText(content || summary);
      if (items.length) {
        return {
          kind: "checklist",
          items: items.map((text, index) => ({
            text,
            checked: hasInteraction ? checkedSet.has(index) : false
          }))
        };
      }
      return { kind: "text", text: fallbackText };
    }
    case "flashcard": {
      const answer =
        cjValue(contentJson, "答案") ||
        (typeof state.answer === "string" && state.answer.trim()
          ? state.answer
          : summary);
      return answer ? { kind: "flash", answer } : { kind: "text", text: fallbackText };
    }
    case "terms": {
      const jsonItems = stringItems(contentJson["术语"]);
      const items = jsonItems.length
        ? jsonItems
        : splitBodyItems(content || summary);
      if (items.length) return { kind: "terms", items: items.slice(0, 3) };
      return { kind: "text", text: fallbackText };
    }
    case "root":
      return { kind: "root", description: summary || "知识点" };
    case "summary": {
      const count = contentJson["结论数量"];
      if (typeof count === "number") {
        return {
          kind: "metric",
          metric: String(count),
          label: "条提炼结论",
          text: cjValue(contentJson, "文本") || content || summary || fallbackText
        };
      }
      return { kind: "text", text: fallbackText };
    }
    case "formula": {
      const formula = cjValue(contentJson, "公式");
      if (formula) {
        return { kind: "formula", formula, note: cjValue(contentJson, "说明") };
      }
      return { kind: "text", text: fallbackText };
    }
    case "diagram": {
      const nodes = stringItems(contentJson["节点"]);
      if (nodes.length) {
        return {
          kind: "diagram",
          nodes,
          rendering: cjValue(contentJson, "渲染")
        };
      }
      return { kind: "text", text: fallbackText };
    }
    case "pitfall": {
      const bad = cjValue(contentJson, "误区");
      const good = cjValue(contentJson, "正解");
      if (bad && good) return { kind: "pitfall", bad, good };
      return { kind: "text", text: fallbackText };
    }
    case "analogy": {
      const text =
        cjValue(contentJson, "引文") ||
        cjValue(contentJson, "备注") ||
        content ||
        summary;
      return text ? { kind: "analogy", text } : { kind: "text", text: fallbackText };
    }
    case "task": {
      return {
        kind: "task",
        status: cjValue(contentJson, "状态") || content || "待处理",
        detail: cjValue(contentJson, "说明") || summary
      };
    }
    case "note":
    case "explain":
    default:
      return {
        kind: "text",
        text: cjValue(contentJson, "文本") || content || summary || "暂无内容"
      };
  }
}

function resolveStoredNodeType(
  node: TopologyNodeRecord,
  index: GenerationTypeIndex
): GenerationTypeConfig {
  const configured = index.byId.get(node.nodeType);
  if (configured) return configured;
  const fallback = index.byId.get("note") ?? index.first;
  if (!fallback) throw new Error("没有可用的拓扑节点类型");
  try {
    const appearance = JSON.parse(node.appearanceJson) as Partial<GenerationTypeConfig>;
    return {
      ...fallback,
      id: node.nodeType,
      name: node.nodeType,
      icon: appearance.icon ?? fallback.icon,
      cardVariant: appearance.cardVariant ?? fallback.cardVariant,
      color: appearance.color ?? fallback.color,
      interactive: node.interactive
    };
  } catch {
    return { ...fallback, id: node.nodeType, name: node.nodeType };
  }
}

const NODE_DISPLAY_FIELD_LABELS: Readonly<Record<
  NonNullable<NodeLevelConfig["displayFields"]>[number],
  string
>> = {
  type: "类型徽标",
  title: "标题",
  summary: "描述",
  source: "来源信息",
  model: "模型",
  content: "卡片内容"
};

interface NodeConfigFieldsProps {
  summary: string;
  config: NodeLevelConfig | null;
  typeConfig: GenerationTypeConfig;
  modelOptions: ReadonlyArray<{
    id: string;
    model: string;
    providerId: string;
    providerName: string;
  }>;
  onSummaryChange: (summary: string) => void;
  onConfigChange: (config: NodeLevelConfig | null) => void;
}

/** 节点级配置表单:描述、显示内容、AI 配置。受控组件,由外层编辑器决定保存时机。 */
function NodeConfigFields({
  summary,
  config,
  typeConfig,
  modelOptions,
  onSummaryChange,
  onConfigChange
}: NodeConfigFieldsProps) {
  const hasAiConfig = Boolean(
    config &&
      (config.modelBindingId !== undefined ||
        config.modelParameters !== undefined ||
        config.systemPrompt !== undefined ||
        config.userPrompt !== undefined)
  );
  const hasDisplayConfig = Boolean(config?.displayFields);
  const update = (patch: Partial<NodeLevelConfig>) => {
    const next: NodeLevelConfig = { ...(config ?? {}), ...patch };
    const cleaned = Object.fromEntries(
      Object.entries(next).filter(([, value]) => value !== undefined && value !== null)
    );
    onConfigChange(Object.keys(cleaned).length ? (cleaned as NodeLevelConfig) : null);
  };
  const toggleField = (
    field: NonNullable<NodeLevelConfig["displayFields"]>[number]
  ) => {
    const current = config?.displayFields ?? [];
    const next = current.includes(field)
      ? current.filter((item) => item !== field)
      : [...current, field];
    update({ displayFields: next.length ? next : null });
  };
  return (
    <div className="node-config-fields">
      <label>
        <span>描述</span>
        <textarea
          rows={2}
          value={summary}
          onChange={(event) => onSummaryChange(event.target.value)}
          placeholder="节点的描述信息(卡片上显示的描述)"
        />
      </label>
      <div className="node-config-display">
        <label className="topology-interaction-toggle">
          <input
            type="checkbox"
            checked={!hasDisplayConfig}
            onChange={(event) =>
              update({ displayFields: event.target.checked ? null : [...typeConfig.displayFields] })
            }
          />
          <span>显示内容跟随类型默认</span>
        </label>
        {hasDisplayConfig && (
          <div className="node-config-field-grid">
            {Object.entries(NODE_DISPLAY_FIELD_LABELS).map(([field, label]) => (
              <label key={field}>
                <input
                  type="checkbox"
                  checked={config?.displayFields?.includes(
                    field as NonNullable<NodeLevelConfig["displayFields"]>[number]
                  )}
                  onChange={() =>
                    toggleField(
                      field as NonNullable<NodeLevelConfig["displayFields"]>[number]
                    )
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <details className="node-config-ai">
        <summary>AI 配置(模型 / 参数 / 提示词)</summary>
        <label className="topology-interaction-toggle">
          <input
            type="checkbox"
            checked={hasAiConfig}
            onChange={(event) =>
              onConfigChange(
                event.target.checked
                  ? {
                      modelBindingId: null,
                      modelParameters: null,
                      systemPrompt: null,
                      userPrompt: null
                    }
                  : null
              )
            }
          />
          <span>使用自定义 AI 配置</span>
        </label>
        {hasAiConfig && (
          <>
            <label>
              <span>调用模型</span>
              <select
                value={config?.modelBindingId ?? ""}
                onChange={(event) =>
                  update({ modelBindingId: event.target.value || null })
                }
              >
                <option value="">跟随类型默认</option>
                <option value="global-default">自动选择已联通模型</option>
                {modelOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.providerName} · {option.model}
                  </option>
                ))}
              </select>
            </label>
            <div className="node-config-parameters">
              <label>
                <span>Temperature</span>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={config?.modelParameters?.temperature ?? typeConfig.modelParameters.temperature}
                  onChange={(event) =>
                    update({
                      modelParameters: {
                        ...config?.modelParameters,
                        temperature: Number(event.target.value)
                      }
                    })
                  }
                />
              </label>
              <label>
                <span>Top P</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={config?.modelParameters?.topP ?? typeConfig.modelParameters.topP}
                  onChange={(event) =>
                    update({
                      modelParameters: {
                        ...config?.modelParameters,
                        topP: Number(event.target.value)
                      }
                    })
                  }
                />
              </label>
              <label>
                <span>最大 Tokens</span>
                <input
                  type="number"
                  min={128}
                  max={32768}
                  step={128}
                  value={config?.modelParameters?.maxTokens ?? typeConfig.modelParameters.maxTokens}
                  onChange={(event) =>
                    update({
                      modelParameters: {
                        ...config?.modelParameters,
                        maxTokens: Number(event.target.value)
                      }
                    })
                  }
                />
              </label>
            </div>
            <label>
              <span>系统提示词</span>
              <textarea
                rows={3}
                value={config?.systemPrompt ?? typeConfig.systemPrompt}
                onChange={(event) => update({ systemPrompt: event.target.value || null })}
                placeholder="留空则跟随类型默认"
              />
            </label>
            <label>
              <span>用户提示词</span>
              <textarea
                rows={3}
                value={config?.userPrompt ?? typeConfig.userPrompt}
                onChange={(event) => update({ userPrompt: event.target.value || null })}
                placeholder="支持 {{selection.text}} 等模板变量;留空则跟随类型默认"
              />
            </label>
          </>
        )}
      </details>
    </div>
  );
}

function topologyAvailableSize() {
  if (typeof window === "undefined") {
    return TOPOLOGY_LEGACY_REFERENCE_VIEWPORT;
  }
  return {
    width: Math.max(TOPOLOGY_MIN_SIZE.width, window.innerWidth - 32),
    height: Math.max(TOPOLOGY_MIN_SIZE.height, window.innerHeight - 128)
  };
}

function clampTopologySize(size: TopologySize): TopologySize {
  const available = topologyAvailableSize();
  const maxWidth = Math.max(
    TOPOLOGY_MIN_SIZE.width,
    Math.min(
      TOPOLOGY_MAX_SIZE.width,
      available.width,
      Math.round(available.width * TOPOLOGY_MAX_VIEWPORT_RATIO.width)
    )
  );
  const maxHeight = Math.max(
    TOPOLOGY_MIN_SIZE.height,
    Math.min(
      TOPOLOGY_MAX_SIZE.height,
      available.height,
      Math.round(available.height * TOPOLOGY_MAX_VIEWPORT_RATIO.height)
    )
  );
  return {
    width: Math.min(maxWidth, Math.max(TOPOLOGY_MIN_SIZE.width, Math.round(size.width))),
    height: Math.min(maxHeight, Math.max(TOPOLOGY_MIN_SIZE.height, Math.round(size.height)))
  };
}

function topologyPreferenceFromSize(size: TopologySize): TopologySizePreference {
  const available = topologyAvailableSize();
  const clamped = clampTopologySize(size);
  return {
    version: 2,
    widthRatio: clamped.width / available.width,
    heightRatio: clamped.height / available.height
  };
}

function topologySizeFromPreference(preference: TopologySizePreference): TopologySize {
  const available = topologyAvailableSize();
  return clampTopologySize({
    width: available.width * preference.widthRatio,
    height: available.height * preference.heightRatio
  });
}

function readStoredTopologyPreference(): TopologySizePreference {
  if (typeof window === "undefined") {
    return topologyPreferenceFromSize(TOPOLOGY_DEFAULT_SIZE);
  }
  try {
    const stored = JSON.parse(window.localStorage.getItem(TOPOLOGY_SIZE_STORAGE_KEY) ?? "null");
    if (
      stored?.version === 2 &&
      Number.isFinite(stored.widthRatio) &&
      stored.widthRatio > 0 &&
      Number.isFinite(stored.heightRatio) &&
      stored.heightRatio > 0
    ) {
      return {
        version: 2,
        widthRatio: stored.widthRatio,
        heightRatio: stored.heightRatio
      };
    }
    if (Number.isFinite(stored?.width) && Number.isFinite(stored?.height)) {
      const migrated = {
        version: 2,
        widthRatio: stored.width / TOPOLOGY_LEGACY_REFERENCE_VIEWPORT.width,
        heightRatio: stored.height / TOPOLOGY_LEGACY_REFERENCE_VIEWPORT.height
      } satisfies TopologySizePreference;
      window.localStorage.setItem(
        TOPOLOGY_SIZE_STORAGE_KEY,
        JSON.stringify(migrated)
      );
      return migrated;
    }
  } catch {
    // Invalid local preferences fall back to the stable default.
  }
  return topologyPreferenceFromSize(TOPOLOGY_DEFAULT_SIZE);
}

function articleChildOrder(
  articles: Readonly<Record<string, ArticleNode>>
) {
  const values = new Map<string, ReadonlyMap<string, number>>();
  Object.values(articles).forEach((parent) => {
    const orderedChildren = sortArticleChildren(
        parent,
        articles,
        sourceBlockIdsInDocumentOrder(parent, articles)
      );
    values.set(
      parent.id,
      new Map(orderedChildren.map((article, index) => [article.id, index]))
    );
  });
  return values;
}

function compareChildIds(
  parentId: string,
  left: string,
  right: string,
  preferredOrder: ReadonlyMap<string, ReadonlyMap<string, number>>,
  sourceOrder: ReadonlyMap<string, number>,
  fallbackOrder: ReadonlyMap<string, number>
) {
  const orderedIds = preferredOrder.get(parentId);
  const leftPreferred = orderedIds?.get(left);
  const rightPreferred = orderedIds?.get(right);
  const leftHasPreferredOrder = leftPreferred !== undefined;
  const rightHasPreferredOrder = rightPreferred !== undefined;
  if (leftHasPreferredOrder && rightHasPreferredOrder) {
    return leftPreferred! - rightPreferred!;
  }
  if (leftHasPreferredOrder) return -1;
  if (rightHasPreferredOrder) return 1;
  const leftSourceOrder = sourceOrder.get(left);
  const rightSourceOrder = sourceOrder.get(right);
  if (leftSourceOrder !== undefined && rightSourceOrder !== undefined) {
    return leftSourceOrder - rightSourceOrder || left.localeCompare(right);
  }
  if (leftSourceOrder !== undefined) return -1;
  if (rightSourceOrder !== undefined) return 1;
  return (
    (fallbackOrder.get(`${parentId}:${left}`) ?? Number.MAX_SAFE_INTEGER) -
      (fallbackOrder.get(`${parentId}:${right}`) ?? Number.MAX_SAFE_INTEGER) ||
    left.localeCompare(right)
  );
}

export function buildTopologyLayout(
  nodes: Record<string, TopologyDisplayNode>,
  rootIds: readonly string[],
  edges: readonly TopologyDisplayEdge[],
  articles: Readonly<Record<string, ArticleNode>>,
  measuredHeights?: Readonly<Record<string, number>>
) {
  const nodeIds = Object.keys(nodes);
  const nodeIdSet = new Set(nodeIds);
  const preferredOrder = articleChildOrder(articles);
  const sourceOrder = new Map<string, number>();
  Object.values(nodes).forEach((node) => {
    const articleStart = node.article?.source?.documentStart;
    const storedAnchor = node.stored?.anchorJson;
    const storedStart =
      storedAnchor && typeof storedAnchor === "object"
        ? (storedAnchor as Record<string, unknown>)["起始位置"]
        : undefined;
    const value =
      typeof articleStart === "number"
        ? articleStart
        : typeof storedStart === "number"
          ? storedStart
          : undefined;
    if (value !== undefined && Number.isFinite(value)) {
      sourceOrder.set(node.id, value);
    }
  });
  const fallbackOrder = new Map(
    edges.map((edge, index) => [`${edge.sourceId}:${edge.targetId}`, index])
  );
  const candidateChildSets = new Map<string, Set<string>>();
  edges.forEach((edge) => {
    if (!edge.hierarchical) return;
    if (!nodeIdSet.has(edge.sourceId) || !nodeIdSet.has(edge.targetId)) return;
    const values = candidateChildSets.get(edge.sourceId) ?? new Set<string>();
    values.add(edge.targetId);
    candidateChildSets.set(edge.sourceId, values);
  });
  const candidateChildren = new Map<string, string[]>();
  candidateChildSets.forEach((values, parentId) => {
    candidateChildren.set(parentId, Array.from(values).sort((left, right) =>
      compareChildIds(
        parentId,
        left,
        right,
        preferredOrder,
        sourceOrder,
        fallbackOrder
      )
    ));
  });

  const depths = new Map<string, number>();
  const children = new Map<string, string[]>();
  const forestRoots: string[] = [];
  const forcedRoots = new Set(rootIds.filter((id) => nodeIdSet.has(id)));
  const incoming = new Set(
    edges
      .filter((edge) => edge.hierarchical && nodeIdSet.has(edge.sourceId))
      .map((edge) => edge.targetId)
  );
  const initialRoots = [
    ...rootIds.filter((id) => nodeIdSet.has(id)),
    ...nodeIds.filter((id) => !incoming.has(id)).sort((left, right) => left.localeCompare(right))
  ];

  const growTreeFrom = (root: string) => {
    if (depths.has(root)) return;
    forestRoots.push(root);
    depths.set(root, 0);
    const queue = [root];
    let queueIndex = 0;
    while (queueIndex < queue.length) {
      const parentId = queue[queueIndex++];
      const parentDepth = depths.get(parentId) ?? 0;
      (candidateChildren.get(parentId) ?? []).forEach((childId) => {
        if (childId === parentId || forcedRoots.has(childId) || depths.has(childId)) return;
        depths.set(childId, parentDepth + 1);
        const values = children.get(parentId) ?? [];
        values.push(childId);
        children.set(parentId, values);
        queue.push(childId);
      });
    }
  };

  Array.from(new Set(initialRoots)).forEach(growTreeFrom);
  nodeIds
    .filter((id) => !depths.has(id))
    .sort((left, right) => left.localeCompare(right))
    .forEach(growTreeFrom);

  const sizesById = new Map<string, { width: number; height: number }>();
  nodeIds.forEach((id) => {
    sizesById.set(id, topologyCardSize(nodes[id], measuredHeights));
  });
  const columnWidths = new Map<number, number>();
  let maxDepth = 0;
  nodeIds.forEach((id) => {
    const depth = depths.get(id) ?? 0;
    maxDepth = Math.max(maxDepth, depth);
    const size = sizesById.get(id) ?? TOPOLOGY_DEFAULT_NODE_SIZE;
    columnWidths.set(depth, Math.max(columnWidths.get(depth) ?? 0, size.width));
  });
  const columnOffsets = new Map<number, number>();
  {
    let xCursor = 96;
    for (let depth = 0; depth <= maxDepth; depth++) {
      columnOffsets.set(depth, xCursor);
      xCursor += (columnWidths.get(depth) ?? TOPOLOGY_NODE_WIDTH) +
        (TOPOLOGY_NODE_X_GAP - TOPOLOGY_NODE_WIDTH);
    }
  }

  const spans = new Map<string, number>();
  const measureSubtree = (id: string): number => {
    const size = sizesById.get(id) ?? TOPOLOGY_DEFAULT_NODE_SIZE;
    const childIds = children.get(id) ?? [];
    if (!childIds.length) {
      spans.set(id, size.height);
      return size.height;
    }
    const childSpan = childIds.reduce(
      (total, childId, index) =>
        total + measureSubtree(childId) + (index ? TOPOLOGY_BRANCH_GAP : 0),
      0
    );
    const span = Math.max(size.height, childSpan);
    spans.set(id, span);
    return span;
  };
  forestRoots.forEach(measureSubtree);
  const forestSpan = forestRoots.reduce(
    (total, id, index) =>
      total + (spans.get(id) ?? TOPOLOGY_NODE_HEIGHT) + (index ? TOPOLOGY_ROOT_GAP : 0),
    0
  );
  const height = Math.max(
    540,
    forestSpan + TOPOLOGY_SCENE_PADDING_Y * 2
  );
  const forestTop = (height - forestSpan) / 2;
  const positions: Position[] = [];
  const positionsById = new Map<string, Position>();
  const placeSubtree = (id: string, top: number) => {
    const depth = depths.get(id) ?? 0;
    const size = sizesById.get(id) ?? TOPOLOGY_DEFAULT_NODE_SIZE;
    const childIds = children.get(id) ?? [];
    let y = top + ((spans.get(id) ?? size.height) - size.height) / 2;
    if (childIds.length) {
      let childTop = top;
      childIds.forEach((childId) => {
        placeSubtree(childId, childTop);
        childTop += (spans.get(childId) ?? TOPOLOGY_NODE_HEIGHT) + TOPOLOGY_BRANCH_GAP;
      });
      const firstChild = positionsById.get(childIds[0]);
      const lastChild = positionsById.get(childIds.at(-1)!);
      if (firstChild && lastChild) {
        y = (firstChild.y + lastChild.y) / 2;
      }
    }
    const position = {
      id,
      x: columnOffsets.get(depth) ?? 96,
      y,
      depth,
      width: size.width,
      height: size.height
    };
    positions.push(position);
    positionsById.set(id, position);
  };
  let rootTop = forestTop;
  forestRoots.forEach((id) => {
    placeSubtree(id, rootTop);
    rootTop += (spans.get(id) ?? TOPOLOGY_NODE_HEIGHT) + TOPOLOGY_ROOT_GAP;
  });
  const width = Math.max(
    620,
    ...positions.map((position) => position.x + position.width + 96)
  );
  return { positions, width, height };
}

function TopologyCardBodyView({
  node,
  childCount,
  onToggleChecklistItem
}: {
  node: TopologyDisplayNode;
  childCount: number;
  onToggleChecklistItem?: (index: number) => void;
}) {
  const body = node.body;
  switch (body.kind) {
    case "bilingual":
      return (
        <div className="topology-node-card-bilingual">
          <span>
            <small>原文</small>
            {body.original}
          </span>
          <span>
            <small>译文</small>
            {body.translation}
          </span>
        </div>
      );
    case "quote":
      return <blockquote className="topology-node-card-quote">{body.text}</blockquote>;
    case "qa":
      return (
        <div className="topology-node-card-qa">
          <strong>{body.question}</strong>
          <span>{body.answer}</span>
        </div>
      );
    case "split":
      return (
        <div className="topology-node-card-split">
          <span>{body.left}</span>
          <span>{body.right}</span>
        </div>
      );
    case "code":
      return <code className="topology-node-card-code">{body.text}</code>;
    case "checklist":
      return (
        <div className="topology-node-card-checklist">
          {body.items.map((item, index) => (
            <span
              key={index}
              className={onToggleChecklistItem ? "is-checkable" : undefined}
              role={onToggleChecklistItem ? "checkbox" : undefined}
              aria-checked={onToggleChecklistItem ? item.checked : undefined}
              onClick={
                onToggleChecklistItem
                  ? (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onToggleChecklistItem(index);
                    }
                  : undefined
              }
            >
              {item.checked ? (
                <Check aria-hidden="true" size={11} />
              ) : (
                <i aria-hidden="true" />
              )}
              {item.text}
            </span>
          ))}
        </div>
      );
    case "flash":
      return <div className="topology-node-card-flash">{body.answer}</div>;
    case "terms":
      return (
        <div className="topology-node-card-terms">
          {body.items.map((item, index) => (
            <span key={index}>{item}</span>
          ))}
        </div>
      );
    case "root":
      return (
        <>
          <p className="topology-node-card-text">{body.description}</p>
          <div className="topology-node-card-facts">
            <span>{childCount} 个子节点</span>
            <span>知识点</span>
          </div>
        </>
      );
    case "metric":
      return (
        <>
          <div className="topology-node-card-metric">
            <strong>{body.metric}</strong>
            <span>{body.label}</span>
          </div>
          <p className="topology-node-card-text">{body.text}</p>
        </>
      );
    case "formula":
      return (
        <>
          <div className="topology-node-card-formula-box">{body.formula}</div>
          {body.note ? (
            <span className="topology-node-card-formula-meta">{body.note}</span>
          ) : null}
        </>
      );
    case "diagram":
      return (
        <div className="topology-node-card-diagram-preview">
          {body.nodes.map((nodeName, index) => (
            <span className="topology-node-card-diagram-flow" key={index}>
              {index > 0 && (
                <span className="topology-node-card-diagram-arrow" aria-hidden="true">
                  →
                </span>
              )}
              <span className="topology-node-card-diagram-node">{nodeName}</span>
            </span>
          ))}
        </div>
      );
    case "pitfall":
      return (
        <div className="topology-node-card-pitfall-box">
          <span className="topology-node-card-pitfall-bad">
            <strong>误区：</strong>
            {body.bad}
          </span>
          <span className="topology-node-card-pitfall-good">
            <strong>正解：</strong>
            {body.good}
          </span>
        </div>
      );
    case "analogy":
      return <p className="topology-node-card-analogy-quote">{body.text}</p>;
    case "task":
      return (
        <>
          <div className="topology-node-card-task-indicator">
            <i className="topology-node-card-task-spinner" aria-hidden="true" />
            <span>{body.status}</span>
          </div>
          {body.detail ? (
            <span className="topology-node-card-task-detail">{body.detail}</span>
          ) : null}
        </>
      );
    case "text":
    default:
      return <p className="topology-node-card-text">{body.text}</p>;
  }
}

export function TopologyPanel({
  articles,
  rootId,
  rootIds = [rootId],
  currentId,
  onNavigate,
  fullScreen,
  sharedTransition,
  onFullScreen,
  focusShortcut,
  pinShortcut,
  topologyGraph,
  topologyError,
  onCreateRoot,
  onCreateManualNode,
  onUpdateManualNode,
  onUpdateNodeConfig,
  onRegenerateNode,
  onRemoveManualNode,
  onCreateRelation,
  onRemoveRelation,
  onUpdateInteraction
}: TopologyPanelProps) {
  const allNodeTypes = useMemo(() => loadGenerationTypes(), []);
  const nodeTypeIndex = useMemo(
    () => createGenerationTypeIndex(allNodeTypes),
    [allNodeTypes]
  );
  const interactionStates = useMemo(
    () => interactionStatesByNode(topologyGraph),
    [topologyGraph?.interactions]
  );
  const manualNodeTypes = useMemo(
    () =>
      allNodeTypes.filter(
        (type) => type.executionMode === "manual" && type.enabled
      ),
    [allNodeTypes]
  );
  const displayNodes = useMemo(() => {
    const values: Record<string, TopologyDisplayNode> = {};
    const rootIdSet = new Set(rootIds);
    Object.values(articles).forEach((article) => {
      if (!rootIdSet.has(article.rootId) && !rootIdSet.has(article.id)) return;
      const displayNode: TopologyDisplayNode = {
        id: article.id,
        title: article.title,
        summary: article.summary,
        nodeType: resolveArticleGenerationType(article, nodeTypeIndex),
        body: { kind: "text", text: article.summary || "暂无内容" },
        article
      };
      const state = interactionStates.get(article.id) ?? {};
      displayNode.summary = topologySummary(displayNode, state);
      if (
        displayNode.nodeType.cardVariant === "flashcard" &&
        typeof state.question === "string" &&
        state.question.trim()
      ) {
        displayNode.title = state.question;
      }
      displayNode.body = resolveCardBody(displayNode, state);
      values[article.id] = displayNode;
    });
    topologyGraph?.nodes.forEach((node) => {
      if (node.contentMode !== "database" || !node.enabled) return;
      const displayNode: TopologyDisplayNode = {
        id: node.id,
        title: node.title,
        summary: node.summary || node.content?.replace(/\s+/g, " ").slice(0, 90) || "",
        nodeType: resolveStoredNodeType(node, nodeTypeIndex),
        body: { kind: "text", text: "" },
        manual: node.isManual ? node : undefined,
        stored: node
      };
      displayNode.body = resolveCardBody(displayNode, parseStateJson(node.interactionStateJson));
      values[node.id] = displayNode;
    });
    return values;
  }, [
    articles,
    interactionStates,
    nodeTypeIndex,
    rootIds,
    topologyGraph?.nodes
  ]);
  const displayEdges = useMemo(() => {
    const values = new Map<string, TopologyDisplayEdge>();
    Object.values(articles).forEach((article) => {
      article.childIds.forEach((childId) => {
        if (!displayNodes[article.id] || !displayNodes[childId]) return;
        const key = `${article.id}:${childId}`;
        values.set(key, {
          id: `tree:${key}`,
          sourceId: article.id,
          targetId: childId,
          label: articles[childId]?.type ?? "下一级",
          directed: true,
          persisted: false,
          hierarchical: true
        });
      });
    });
    topologyGraph?.relations.forEach((relation) => {
      if (!displayNodes[relation.sourceNodeId] || !displayNodes[relation.targetNodeId]) return;
      const key = `${relation.sourceNodeId}:${relation.targetNodeId}`;
      const existing = values.get(key);
      values.set(key, {
        id: relation.id,
        sourceId: relation.sourceNodeId,
        targetId: relation.targetNodeId,
        label: relation.label,
        directed: relation.directed,
        persisted: existing ? existing.persisted : true,
        hierarchical:
          existing?.hierarchical ||
          relation.relationType === "contains" ||
          relation.relationType === "manual-child"
      });
    });
    return Array.from(values.values());
  }, [articles, displayNodes, topologyGraph?.relations]);
  const resolvedRootIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...rootIds,
          ...(topologyGraph?.nodes
            .filter((node) => node.contentMode === "database" && node.isRoot && node.enabled)
            .map((node) => node.id) ?? [])
        ])
      ),
    [rootIds, topologyGraph?.nodes]
  );
  const [measuredHeights, setMeasuredHeights] = useState<
    Readonly<Record<string, number>>
  >({});
  const measuredHeightsRef = useRef<Record<string, number>>({});
  const layout = useMemo(
    () =>
      buildTopologyLayout(
        displayNodes,
        resolvedRootIds,
        displayEdges,
        articles,
        measuredHeights
      ),
    [articles, displayEdges, displayNodes, measuredHeights, resolvedRootIds]
  );
  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>(".topology-node-card");
    if (!cards.length) return;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const updates: Record<string, number> = {};
      let changed = false;
      entries.forEach((entry) => {
        const id = (entry.target as HTMLElement).dataset.nodeId;
        if (!id) return;
        const height = Math.round(entry.contentRect.height);
        if (height > 0 && measuredHeightsRef.current[id] !== height) {
          measuredHeightsRef.current[id] = height;
          updates[id] = height;
          changed = true;
        }
      });
      if (changed) setMeasuredHeights({ ...measuredHeightsRef.current });
    });
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [layout]);
  const outgoingEdgeCount = useMemo(() => {
    const counts = new Map<string, number>();
    displayEdges.forEach((edge) => {
      counts.set(edge.sourceId, (counts.get(edge.sourceId) ?? 0) + 1);
    });
    return counts;
  }, [displayEdges]);
  const [scale, setScale] = useState(0.78);
  const [pan, setPan] = useState({ x: 8, y: 12 });
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const sizePreferenceRef = useRef<TopologySizePreference | null>(null);
  if (!sizePreferenceRef.current) {
    sizePreferenceRef.current = readStoredTopologyPreference();
  }
  const [size, setSize] = useState(() =>
    topologySizeFromPreference(sizePreferenceRef.current!)
  );
  const [resizing, setResizing] = useState(false);
  const [focusMode, setFocusMode] = useState<TopologyFocusMode>(null);
  const [composer, setComposer] = useState<"root" | "manual" | null>(null);
  const [selectedManualId, setSelectedManualId] = useState<string | null>(null);
  const [selectedInteractiveId, setSelectedInteractiveId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftConfig, setDraftConfig] = useState<NodeLevelConfig | null>(null);
  const [interactiveConfig, setInteractiveConfig] = useState<NodeLevelConfig | null>(null);
  const [interactiveSummary, setInteractiveSummary] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [nodeConfigMessage, setNodeConfigMessage] = useState("");
  const [draftTypeId, setDraftTypeId] = useState(manualNodeTypes[0]?.id ?? "note");
  const [draftAsRoot, setDraftAsRoot] = useState(false);
  const [relationTargetId, setRelationTargetId] = useState("");
  const [relationLabel, setRelationLabel] = useState("关联");
  const [editorBusy, setEditorBusy] = useState(false);
  const [interactiveContent, setInteractiveContent] = useState("");
  const [interactiveItems, setInteractiveItems] = useState<string[]>([]);
  const [interactiveQuestion, setInteractiveQuestion] = useState("");
  const [interactiveAnswer, setInteractiveAnswer] = useState("");
  const selectedManualNode = selectedManualId
    ? topologyGraph?.nodes.find((node) => node.id === selectedManualId) ?? null
    : null;
  const selectedInteractiveNode = selectedInteractiveId
    ? displayNodes[selectedInteractiveId] ?? null
    : null;
  const drag = useRef<{ id: number; startX: number; startY: number; x: number; y: number } | null>(
    null
  );
  const dragMovedRef = useRef(false);
  const resize = useRef<{
    id: number;
    edge: ResizeEdge;
    startX: number;
    startY: number;
    width: number;
    height: number;
  } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const scaleLabelRef = useRef<HTMLSpanElement>(null);
  const pointerInsideRef = useRef(false);
  const transformRef = useRef({ pan, scale });
  const wheelCommitTimerRef = useRef<number>();
  const sceneAnimTimerRef = useRef<number>();
  const sizeRef = useRef(size);
  const fullScreenRef = useRef(fullScreen);
  const lastViewportSizeRef = useRef(size);
  sizeRef.current = size;
  fullScreenRef.current = fullScreen;

  const byId = useMemo(
    () => Object.fromEntries(layout.positions.map((position) => [position.id, position])),
    [layout.positions]
  );
  const orderById = useMemo(
    () => new Map(layout.positions.map((position, index) => [position.id, index])),
    [layout.positions]
  );

  const applySceneTransform = useCallback(
    (nextPan: { x: number; y: number }, nextScale: number) => {
      transformRef.current = { pan: nextPan, scale: nextScale };
      if (sceneRef.current) {
        sceneRef.current.style.transform =
          `translate(${nextPan.x}px, ${nextPan.y}px) scale(${nextScale})`;
      }
      if (scaleLabelRef.current) {
        scaleLabelRef.current.textContent =
          `${Math.round(nextScale * 100)}% · ${layout.positions.length} 节点`;
      }
    },
    [layout.positions.length]
  );

  const beginSceneAnimation = useCallback(() => {
    sceneRef.current?.classList.add("is-animating");
    window.clearTimeout(sceneAnimTimerRef.current);
    sceneAnimTimerRef.current = window.setTimeout(
      () => sceneRef.current?.classList.remove("is-animating"),
      340
    );
  }, []);

  const cancelSceneAnimation = useCallback(() => {
    window.clearTimeout(sceneAnimTimerRef.current);
    sceneRef.current?.classList.remove("is-animating");
  }, []);

  useLayoutEffect(() => {
    applySceneTransform(pan, scale);
  }, [applySceneTransform, pan, scale]);

  useEffect(
    () => () => {
      window.clearTimeout(wheelCommitTimerRef.current);
      window.clearTimeout(sceneAnimTimerRef.current);
    },
    []
  );

  const zoom = (next: number) => {
    window.clearTimeout(wheelCommitTimerRef.current);
    setFocusMode(null);
    beginSceneAnimation();
    setScale(Math.max(TOPOLOGY_MIN_SCALE, Math.min(TOPOLOGY_MAX_SCALE, next)));
  };

  const focusViewportSize = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    if (fullScreenRef.current) {
      return {
        width: viewport.clientWidth,
        height: viewport.clientHeight
      };
    }
    return {
      width: sizeRef.current.width,
      height: sizeRef.current.height
    };
  }, []);

  const focusCurrent = useCallback(() => {
    const position = byId[currentId];
    const viewport = focusViewportSize();
    if (!position || !viewport) return;
    window.clearTimeout(wheelCommitTimerRef.current);
    const nextScale = TOPOLOGY_CURRENT_FOCUS_SCALE;
    beginSceneAnimation();
    setScale(nextScale);
    setPan({
      x: viewport.width / 2 - (position.x + position.width / 2) * nextScale,
      y: viewport.height / 2 - (position.y + position.height / 2) * nextScale
    });
    setFocusMode("current");
  }, [byId, currentId, focusViewportSize]);

  const focusOverall = useCallback(() => {
    const viewport = focusViewportSize();
    if (!viewport) return;
    window.clearTimeout(wheelCommitTimerRef.current);
    const availableWidth = Math.max(1, viewport.width - TOPOLOGY_FIT_PADDING * 2);
    const availableHeight = Math.max(1, viewport.height - TOPOLOGY_FIT_PADDING * 2);
    const nextScale = Math.max(
      TOPOLOGY_MIN_SCALE,
      Math.min(
        TOPOLOGY_MAX_SCALE,
        availableWidth / layout.width,
        availableHeight / layout.height
      )
    );
    beginSceneAnimation();
    setScale(nextScale);
    setPan({
      x: (viewport.width - layout.width * nextScale) / 2,
      y: (viewport.height - layout.height * nextScale) / 2
    });
    setFocusMode("overall");
  }, [focusViewportSize, layout.height, layout.width]);

  const toggleFocus = useCallback(() => {
    if (focusMode === "overall") {
      focusCurrent();
      return;
    }
    focusOverall();
  }, [focusCurrent, focusMode, focusOverall]);

  const togglePinned = useCallback(() => {
    setPinned((value) => {
      if (value && pointerInsideRef.current) {
        setOpen(true);
      }
      return !value;
    });
  }, []);

  const smallExpanded = open || pinned || resizing;

  useLayoutEffect(() => {
    if (fullScreen) {
      focusOverall();
    } else if (smallExpanded) {
      focusCurrent();
    }
  }, [focusCurrent, focusOverall, fullScreen, smallExpanded]);

  useEffect(() => {
    const handleWindowResize = () => {
      if (!sizePreferenceRef.current) return;
      setSize(topologySizeFromPreference(sizePreferenceRef.current));
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: globalThis.WheelEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".topology-overlay")) return;
      event.preventDefault();
      cancelSceneAnimation();
      setFocusMode(null);
      const current = transformRef.current;
      const nextScale = Math.max(
        TOPOLOGY_MIN_SCALE,
        Math.min(
          TOPOLOGY_MAX_SCALE,
          current.scale * Math.exp(-event.deltaY * 0.0012)
        )
      );
      applySceneTransform(current.pan, nextScale);
      window.clearTimeout(wheelCommitTimerRef.current);
      wheelCommitTimerRef.current = window.setTimeout(
        () => setScale(transformRef.current.scale),
        120
      );
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [applySceneTransform, cancelSceneAnimation]);

  useLayoutEffect(() => {
    const previousSize = lastViewportSizeRef.current;
    if (previousSize.width === size.width && previousSize.height === size.height) return;
    lastViewportSizeRef.current = size;
    if (fullScreen) {
      focusOverall();
      return;
    }
    if (!smallExpanded) return;
    if (focusMode === "current") {
      focusCurrent();
    } else if (focusMode === "overall") {
      focusOverall();
    }
  }, [
    focusCurrent,
    focusMode,
    focusOverall,
    fullScreen,
    smallExpanded,
    size.height,
    size.width
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        (target.matches("textarea, input, select") || target.isContentEditable);
      const panel = panelRef.current;
      const topologyVisible =
        fullScreen ||
        pinned ||
        open ||
        Boolean(panel?.contains(document.activeElement));
      if (!topologyVisible) return;

      if (
        matchesShortcut(event, pinShortcut) &&
        !editing &&
        !fullScreen
      ) {
        event.preventDefault();
        togglePinned();
        return;
      }

      if (
        matchesShortcut(event, focusShortcut) &&
        (!editing || fullScreen)
      ) {
        event.preventDefault();
        toggleFocus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    focusShortcut,
    fullScreen,
    open,
    pinShortcut,
    pinned,
    toggleFocus,
    togglePinned
  ]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    window.clearTimeout(wheelCommitTimerRef.current);
    cancelSceneAnimation();
    setFocusMode(null);
    dragMovedRef.current = false;
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: transformRef.current.pan.x,
      y: transformRef.current.pan.y
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.classList.add("is-dragging");
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    if (
      Math.abs(event.clientX - drag.current.startX) +
        Math.abs(event.clientY - drag.current.startY) >
      6
    ) {
      dragMovedRef.current = true;
    }
    applySceneTransform({
      x: drag.current.x + event.clientX - drag.current.startX,
      y: drag.current.y + event.clientY - drag.current.startY
    }, transformRef.current.scale);
  };

  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) {
      setPan(transformRef.current.pan);
    }
    drag.current = null;
    event.currentTarget.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const setAndStoreSize = (nextSize: TopologySize) => {
    const clamped = clampTopologySize(nextSize);
    const preference = topologyPreferenceFromSize(clamped);
    sizePreferenceRef.current = preference;
    setSize(clamped);
    window.localStorage.setItem(TOPOLOGY_SIZE_STORAGE_KEY, JSON.stringify(preference));
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>, edge: ResizeEdge) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    resize.current = {
      id: event.pointerId,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      width: size.width,
      height: size.height
    };
    setFocusMode(null);
    setResizing(true);
  };

  const handleNodeDoubleClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
    articleId: string
  ) => {
    if (!fullScreen) return;
    event.preventDefault();
    event.stopPropagation();
    onNavigate(articleId);
    if (!event.ctrlKey) {
      onFullScreen(false);
    }
  };

  const openManualEditor = (node: TopologyNodeRecord) => {
    setSelectedManualId(node.id);
    setDraftTitle(node.title);
    setDraftContent(node.content ?? "");
    setDraftSummary(node.summary);
    setDraftConfig(normalizeNodeLevelConfig(node.configJson));
    setRelationTargetId("");
    setNodeConfigMessage("");
  };

  const openInteractiveEditor = (node: TopologyDisplayNode) => {
    const state = interactionStates.get(node.id) ?? {};
    const items = stringItems(state.items);
    setInteractiveConfig(
      normalizeNodeLevelConfig(node.stored?.configJson ?? node.manual?.configJson)
    );
    setInteractiveSummary(node.stored?.summary ?? node.summary);
    setNodeConfigMessage("");
    setInteractiveContent(
      typeof state.content === "string" ? state.content : node.summary
    );
    setInteractiveItems(
      items.length ? items : checklistItemsFromText(node.summary)
    );
    setInteractiveQuestion(
      typeof state.question === "string" ? state.question : node.title
    );
    setInteractiveAnswer(
      typeof state.answer === "string" ? state.answer : node.summary
    );
    setSelectedInteractiveId(node.id);
    setSelectedManualId(null);
  };

  const submitComposer = async () => {
    if (!draftTitle.trim() || editorBusy) return;
    setEditorBusy(true);
    try {
      if (composer === "root") {
        await onCreateRoot(draftTitle, draftContent);
      } else {
        const nodeType =
          manualNodeTypes.find((type) => type.id === draftTypeId) ?? manualNodeTypes[0];
        if (!nodeType) return;
        const node = await onCreateManualNode({
          nodeType: nodeType.id,
          title: draftTitle,
          content: draftContent,
          parentId: draftAsRoot ? null : currentId,
          isRoot: draftAsRoot,
          interactive:
            nodeType.interactive ||
            EDITABLE_INTERACTION_VARIANTS.has(nodeType.cardVariant),
          icon: nodeType.icon,
          cardVariant: nodeType.cardVariant,
          color: nodeType.color
        });
        if (node) openManualEditor(node);
      }
      setComposer(null);
      setDraftTitle("");
      setDraftContent("");
      setDraftAsRoot(false);
    } finally {
      setEditorBusy(false);
    }
  };

  const updateSelectedManual = async (
    changes: Partial<TopologyNodeRecord> = {}
  ) => {
    if (!selectedManualNode || editorBusy) return;
    setEditorBusy(true);
    try {
      await onUpdateManualNode({
        ...selectedManualNode,
        title: draftTitle.trim() || selectedManualNode.title,
        content: draftContent,
        summary:
          draftSummary.trim() ||
          draftContent.trim().replace(/\s+/g, " ").slice(0, 90),
        configJson:
          draftConfig === null ? undefined : JSON.stringify(draftConfig),
        ...changes
      });
    } finally {
      setEditorBusy(false);
    }
  };

  const updateInteractionState = async (state: Record<string, unknown>) => {
    if (!selectedManualNode) return;
    await updateSelectedManual({ interactionStateJson: JSON.stringify(state) });
  };

  const selectedInteractionState = (() => {
    try {
      return JSON.parse(selectedManualNode?.interactionStateJson ?? "{}") as Record<
        string,
        unknown
      >;
    } catch {
      return {};
    }
  })();
  const selectedGraphInteractionState = selectedInteractiveId
    ? interactionStates.get(selectedInteractiveId) ?? {}
    : {};
  const modelProviders = useMemo(loadModelProviders, []);
  const modelOptions = useMemo(
    () => configuredModels(modelProviders),
    [modelProviders]
  );
  const selectedManualNodeType = selectedManualNode
    ? resolveStoredNodeType(selectedManualNode, nodeTypeIndex)
    : null;
  const selectedManualVariant = selectedManualNodeType?.cardVariant;
  const selectedManualIsInteractive = Boolean(
    selectedManualNodeType?.interactive ||
      (selectedManualVariant && EDITABLE_INTERACTION_VARIANTS.has(selectedManualVariant))
  );

  const saveInteractiveCard = async () => {
    if (!selectedInteractiveNode || editorBusy) return;
    setEditorBusy(true);
    try {
      const variant = selectedInteractiveNode.nodeType.cardVariant;
      const nextState: Record<string, unknown> = {
        ...selectedGraphInteractionState
      };
      if (variant === "checklist") {
        nextState.items = interactiveItems.map((item) => item.trim()).filter(Boolean);
        const checked = new Set(
          Array.isArray(selectedGraphInteractionState.checked)
            ? (selectedGraphInteractionState.checked as number[])
            : []
        );
        nextState.checked = [...checked].filter(
          (index) => index >= 0 && index < (nextState.items as string[]).length
        );
      } else if (variant === "flashcard") {
        nextState.question = interactiveQuestion.trim();
        nextState.answer = interactiveAnswer.trim();
      } else {
        nextState.content = interactiveContent;
      }
      await onUpdateInteraction(
        selectedInteractiveNode.id,
        "topology-card",
        nextState
      );
    } finally {
      setEditorBusy(false);
    }
  };

  const saveNodeConfig = async () => {
    if (!selectedInteractiveNode || editorBusy) return;
    setEditorBusy(true);
    try {
      await onUpdateNodeConfig(selectedInteractiveNode.id, interactiveConfig);
      setNodeConfigMessage("节点配置已保存。");
    } catch (error) {
      setNodeConfigMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setEditorBusy(false);
    }
  };

  const handleRegenerate = async () => {
    if (!selectedInteractiveNode) return;
    setRegenerating(true);
    setNodeConfigMessage("");
    try {
      const result = await onRegenerateNode(selectedInteractiveNode.id);
      setNodeConfigMessage(result.message);
    } catch (error) {
      setNodeConfigMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRegenerating(false);
    }
  };

  const handleToggleChecklistItem = useCallback(
    (nodeId: string) => (index: number) => {
      const state = interactionStates.get(nodeId) ?? {};
      // 首次交互时基于当前显示状态(内容 JSON 已完成 + 已有交互)初始化
      const base = new Set<number>();
      if (Array.isArray(state.checked)) {
        (state.checked as number[]).forEach((value) => base.add(value));
      } else {
        const node = displayNodes[nodeId];
        if (node?.body?.kind === "checklist") {
          node.body.items.forEach((item, itemIndex) => {
            if (item.checked) base.add(itemIndex);
          });
        }
      }
      if (base.has(index)) base.delete(index);
      else base.add(index);
      void onUpdateInteraction(nodeId, "topology-card", {
        ...state,
        checked: [...base]
      });
    },
    [displayNodes, interactionStates, onUpdateInteraction]
  );

  const toggleInteractiveChecklistItem = (index: number) => {
    if (!selectedInteractiveNode) return;
    const checked = new Set(
      Array.isArray(selectedGraphInteractionState.checked)
        ? (selectedGraphInteractionState.checked as number[])
        : []
    );
    if (checked.has(index)) checked.delete(index);
    else checked.add(index);
    void onUpdateInteraction(selectedInteractiveNode.id, "topology-card", {
      ...selectedGraphInteractionState,
      items: interactiveItems,
      checked: [...checked]
    });
  };

  const sizeFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = resize.current;
    if (!active || active.id !== event.pointerId) return null;
    const changesWidth = active.edge === "left" || active.edge === "top-left";
    const changesHeight = active.edge === "top" || active.edge === "top-left";
    return clampTopologySize({
      width: changesWidth ? active.width + active.startX - event.clientX : active.width,
      height: changesHeight ? active.height + active.startY - event.clientY : active.height
    });
  };

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const nextSize = sizeFromPointer(event);
    if (nextSize) setSize(nextSize);
  };

  const stopResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const nextSize = event.type === "pointercancel" ? size : sizeFromPointer(event);
    if (!nextSize) return;
    resize.current = null;
    setResizing(false);
    setAndStoreSize(nextSize);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const handleResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    dimension: "width" | "height"
  ) => {
    const step = event.shiftKey ? 24 : 8;
    let nextSize: TopologySize | null = null;
    if (dimension === "width") {
      if (event.key === "ArrowLeft") nextSize = { ...size, width: size.width + step };
      if (event.key === "ArrowRight") nextSize = { ...size, width: size.width - step };
      if (event.key === "Home") nextSize = { ...size, width: TOPOLOGY_MIN_SIZE.width };
      if (event.key === "End") nextSize = { ...size, width: TOPOLOGY_MAX_SIZE.width };
    } else {
      if (event.key === "ArrowUp") nextSize = { ...size, height: size.height + step };
      if (event.key === "ArrowDown") nextSize = { ...size, height: size.height - step };
      if (event.key === "Home") nextSize = { ...size, height: TOPOLOGY_MIN_SIZE.height };
      if (event.key === "End") nextSize = { ...size, height: TOPOLOGY_MAX_SIZE.height };
    }
    if (!nextSize) return;
    event.preventDefault();
    setAndStoreSize(nextSize);
  };

  const panel = (
    <aside
      id="article-topology-panel"
      ref={panelRef}
      className={`topology-panel${pinned ? " is-pinned" : ""}${fullScreen ? " is-fullscreen" : ""}${sharedTransition ? " is-shared-transition" : ""}${resizing ? " is-resizing" : ""}`}
      data-focus-mode={focusMode ?? "manual"}
      aria-label="当前知识树拓扑"
    >
      <div className="topology-content">
      {!fullScreen && (
        <>
          <div
            className="topology-resize-handle is-left"
            role="separator"
            aria-label="调整拓扑图宽度"
            aria-orientation="vertical"
            aria-valuemin={TOPOLOGY_MIN_SIZE.width}
            aria-valuemax={TOPOLOGY_MAX_SIZE.width}
            aria-valuenow={size.width}
            tabIndex={0}
            onDoubleClick={() => setAndStoreSize({ ...size, width: TOPOLOGY_DEFAULT_SIZE.width })}
            onKeyDown={(event) => handleResizeKeyDown(event, "width")}
            onPointerDown={(event) => startResize(event, "left")}
            onPointerMove={moveResize}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
          />
          <div
            className="topology-resize-handle is-top"
            role="separator"
            aria-label="调整拓扑图高度"
            aria-orientation="horizontal"
            aria-valuemin={TOPOLOGY_MIN_SIZE.height}
            aria-valuemax={TOPOLOGY_MAX_SIZE.height}
            aria-valuenow={size.height}
            tabIndex={0}
            onDoubleClick={() => setAndStoreSize({ ...size, height: TOPOLOGY_DEFAULT_SIZE.height })}
            onKeyDown={(event) => handleResizeKeyDown(event, "height")}
            onPointerDown={(event) => startResize(event, "top")}
            onPointerMove={moveResize}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
          />
          <div
            className="topology-resize-handle is-top-left"
            aria-hidden="true"
            onPointerDown={(event) => startResize(event, "top-left")}
            onPointerMove={moveResize}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
          />
        </>
      )}
      <div
        ref={viewportRef}
        className="topology-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div
          ref={sceneRef}
          className="topology-scene"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${transformRef.current.pan.x}px, ${transformRef.current.pan.y}px) scale(${transformRef.current.scale})`
          }}
        >
          <svg
            className="topology-links"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
          >
            {displayEdges.map((edge) => {
                const parent = byId[edge.sourceId];
                const child = byId[edge.targetId];
                const parentType = displayNodes[edge.sourceId]?.nodeType;
                if (!parent || !child) return null;
                if (!child) return null;
                const startX = parent.x + parent.width;
                const startY = parent.y + parent.height / 2;
                const endX = child.x;
                const endY = child.y + child.height / 2;
                const mid = startX + (endX - startX) * 0.52;
                return (
                  <path
                    key={edge.id}
                    pathLength={1}
                    className={`topology-link${edge.directed ? " is-directed" : " is-undirected"}${edge.persisted ? " is-persisted" : ""}`}
                    d={`M ${startX} ${startY} C ${mid} ${startY}, ${mid} ${endY}, ${endX} ${endY}`}
                    style={
                      {
                        "--topology-link-color": parentType?.color,
                        "--node-order": orderById.get(edge.targetId) ?? 0
                      } as CSSProperties
                    }
                  />
                );
            })}
          </svg>
          {layout.positions.map((position) => {
            const node = displayNodes[position.id];
            if (!node) return null;
            const current = node.id === currentId;
            const nodeType = node.nodeType;
            const nodeIsInteractive =
              nodeType.interactive ||
              EDITABLE_INTERACTION_VARIANTS.has(nodeType.cardVariant);
            const NodeIcon = topologyNodeIcons[nodeType.icon] ?? BookOpenText;
            const effectiveConfig = mergeNodeLevelConfig(
              normalizeNodeLevelConfig(node.manual?.configJson ?? node.stored?.configJson),
              nodeType
            );
            const shows = (field: GenerationTypeConfig["displayFields"][number]) =>
              effectiveConfig.displayFields.includes(field);
            const generationModel = resolveGenerationModel(
              node,
              effectiveConfig.modelBindingId
            );
            return (
              <button
                key={node.id}
                data-node-id={node.id}
                className={`topology-node-card is-${nodeType.cardVariant}${
                  current ? " is-current" : ""
                }${node.manual ? " is-manual" : ""}${nodeIsInteractive ? " is-interactive" : ""}`}
                type="button"
                style={
                  {
                    left: position.x,
                    top: position.y,
                    width: position.width,
                    "--topology-card-color": nodeType.color,
                    "--node-order": orderById.get(node.id) ?? 0
                  } as CSSProperties
                }
                onClick={() => {
                  if (dragMovedRef.current) return;
                  if (node.manual) {
                    openManualEditor(node.manual);
                    setSelectedInteractiveId(null);
                  } else if (nodeIsInteractive) {
                    openInteractiveEditor(node);
                  } else if (!fullScreen && node.article) {
                    onNavigate(node.article.id);
                  }
                }}
                onDoubleClick={(event) => {
                  if (node.article) handleNodeDoubleClick(event, node.article.id);
                }}
                aria-current={current ? "page" : undefined}
              >
                {(shows("type") || shows("model")) && (
                  <span className="topology-node-card-head">
                    {shows("type") && (
                      <>
                        <span className="topology-node-card-icon" aria-hidden="true">
                          <NodeIcon size={16} />
                        </span>
                        <strong>{nodeType.name}</strong>
                      </>
                    )}
                    {shows("model") && (
                      <small className="topology-node-card-origin">
                        {generationModel}
                      </small>
                    )}
                  </span>
                )}
                {shows("title") && (
                  <span className="topology-node-card-title">{node.title}</span>
                )}
                {shows("summary") && node.summary && (
                  <span className="topology-node-card-summary">{node.summary}</span>
                )}
                {shows("content") && (
                  <div className="topology-node-card-body">
                    <TopologyCardBodyView
                      node={node}
                      childCount={outgoingEdgeCount.get(node.id) ?? 0}
                      onToggleChecklistItem={
                        nodeType.cardVariant === "checklist"
                          ? handleToggleChecklistItem(node.id)
                          : undefined
                      }
                    />
                  </div>
                )}
                {shows("source") && (
                  <footer className="topology-node-card-footer">
                    <span>
                      {node.manual
                        ? "手动 · SQLite"
                        : node.stored?.creationMethod === "AI"
                          ? `AI · ${node.nodeType.name}`
                          : node.article?.source?.generationType ?? "原创"}
                    </span>
                    <span>第 {position.depth + 1} 层</span>
                    <span>{outgoingEdgeCount.get(node.id) ?? 0} 条关系</span>
                  </footer>
                )}
                {current && (
                  <em className="topology-node-card-current">当前</em>
                )}
              </button>
            );
          })}
        </div>
        <div
          className="topology-overlay"
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="topology-actions" aria-label="拓扑操作">
            {fullScreen && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setComposer("root");
                    setDraftTitle("");
                    setDraftContent("");
                  }}
                  aria-label="新建知识点"
                >
                  <BookOpenText aria-hidden="true" size={16} />
                </button>
                <button
                  type="button"
                  disabled={!manualNodeTypes.length}
                  onClick={() => {
                    setComposer("manual");
                    setDraftTitle("");
                    setDraftContent("");
                    setDraftAsRoot(false);
                  }}
                  aria-label="新建手动节点"
                >
                  <Plus aria-hidden="true" size={16} />
                </button>
              </>
            )}
            <button type="button" onClick={() => zoom(transformRef.current.scale - 0.12)} aria-label="缩小拓扑">
              <ZoomOut aria-hidden="true" size={16} />
            </button>
            <button type="button" onClick={() => zoom(transformRef.current.scale + 0.12)} aria-label="放大拓扑">
              <ZoomIn aria-hidden="true" size={16} />
            </button>
            <button
              type="button"
              onClick={toggleFocus}
              aria-label={focusMode === "overall" ? "聚焦当前节点" : "聚焦整棵知识树"}
            >
              <Focus aria-hidden="true" size={16} />
            </button>
            {!fullScreen && (
              <button
                type="button"
                className={pinned ? "is-active" : ""}
                aria-pressed={pinned}
                onClick={togglePinned}
                aria-label={pinned ? "取消固定拓扑" : "固定拓扑"}
              >
                <Pin aria-hidden="true" size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onFullScreen(!fullScreen)}
              aria-label={fullScreen ? "退出全屏拓扑" : "全屏查看拓扑"}
            >
              {fullScreen ? (
                <Minimize2 aria-hidden="true" size={16} />
              ) : (
                <Maximize2 aria-hidden="true" size={16} />
              )}
            </button>
          </div>
          <div className="topology-overlay-copy" aria-live="polite">
            <span ref={scaleLabelRef}>
              {Math.round(transformRef.current.scale * 100)}% · {layout.positions.length} 节点
            </span>
            <span>{fullScreen ? "双击进入文章 · 单击编辑手动节点" : "拖动 · 滚轮缩放"}</span>
            <kbd>{formatShortcut(focusShortcut)}</kbd>
          </div>
        </div>
      </div>
      {fullScreen && topologyError && (
        <div className="topology-storage-error" role="status">
          SQLite 暂不可用：{topologyError}
        </div>
      )}
      {fullScreen && composer && (
        <section className="topology-node-editor is-composer" aria-label="创建拓扑节点">
          <header>
            <div>
              <span>{composer === "root" ? "MARKDOWN ROOT" : "SQLITE NODE"}</span>
              <strong>{composer === "root" ? "新建知识点" : "新建手动节点"}</strong>
            </div>
            <button type="button" onClick={() => setComposer(null)} aria-label="关闭创建面板">
              <X aria-hidden="true" size={16} />
            </button>
          </header>
          {composer === "manual" && (
            <label>
              <span>节点类型</span>
              <select value={draftTypeId} onChange={(event) => setDraftTypeId(event.target.value)}>
                {manualNodeTypes.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>标题</span>
            <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} autoFocus />
          </label>
          <label>
            <span>{composer === "root" ? "Markdown 正文" : "节点内容"}</span>
            <textarea value={draftContent} onChange={(event) => setDraftContent(event.target.value)} rows={7} />
          </label>
          {composer === "manual" && (
            <label className="topology-node-editor-check">
              <input
                type="checkbox"
                checked={draftAsRoot}
                onChange={(event) => setDraftAsRoot(event.target.checked)}
              />
              <span>作为独立知识点；否则连接到当前阅读节点</span>
            </label>
          )}
          <footer>
            <small>
              {composer === "root"
                ? "正文保存为 Markdown；同一集合可归类多个知识点。"
                : "手动内容只写入 SQLite，不创建或修改 Markdown 文件。"}
            </small>
            <button type="button" disabled={!draftTitle.trim() || editorBusy} onClick={() => void submitComposer()}>
              <Plus aria-hidden="true" size={15} />
              创建
            </button>
          </footer>
        </section>
      )}
      {fullScreen && selectedManualNode && !composer && (
        <section className="topology-node-editor" aria-label="编辑手动节点">
          <header>
            <div>
              <span>SQLITE NODE</span>
              <strong>{selectedManualNode.title}</strong>
            </div>
            <button type="button" onClick={() => setSelectedManualId(null)} aria-label="关闭节点编辑器">
              <X aria-hidden="true" size={16} />
            </button>
          </header>
          <label>
            <span>标题</span>
            <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
          </label>
          <label>
            <span>
              {selectedManualVariant === "highlight"
                ? "重点内容"
                : selectedManualVariant === "note"
                  ? "笔记内容"
                  : selectedManualVariant === "source"
                    ? "来源、链接与摘录"
                    : "内容"}
            </span>
            <textarea
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              placeholder={
                selectedManualVariant === "source"
                  ? "填写来源名称、链接、页码或原文摘录"
                  : "填写节点内部内容"
              }
              rows={7}
            />
          </label>
          {selectedManualNodeType && (
            <NodeConfigFields
              summary={draftSummary}
              config={draftConfig}
              typeConfig={selectedManualNodeType}
              modelOptions={modelOptions}
              onSummaryChange={setDraftSummary}
              onConfigChange={setDraftConfig}
            />
          )}
          {selectedManualIsInteractive && (
            <div className="topology-node-interaction">
              <strong>节点互动</strong>
              {selectedManualVariant === "checklist" ? (
                draftContent.split(/\r?\n/).filter(Boolean).map((item, index) => {
                  const checked = Array.isArray(selectedInteractionState.checked)
                    ? (selectedInteractionState.checked as number[]).includes(index)
                    : false;
                  return (
                    <label key={`${index}-${item}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const values = new Set(
                            Array.isArray(selectedInteractionState.checked)
                              ? (selectedInteractionState.checked as number[])
                              : []
                          );
                          if (checked) values.delete(index); else values.add(index);
                          void updateInteractionState({ ...selectedInteractionState, checked: [...values] });
                        }}
                      />
                      <span>{item.replace(/^[-*]\s*/, "")}</span>
                    </label>
                  );
                })
              ) : selectedManualVariant === "flashcard" ? (
                <button
                  type="button"
                  onClick={() => void updateInteractionState({
                    ...selectedInteractionState,
                    revealed: !selectedInteractionState.revealed
                  })}
                >
                  {selectedInteractionState.revealed ? draftContent || "暂无答案" : "点击显示答案"}
                </button>
              ) : selectedManualVariant === "highlight" ? (
                <label className="topology-interaction-toggle">
                  <input
                    type="checkbox"
                    checked={selectedInteractionState.mastered === true}
                    onChange={(event) => void updateInteractionState({
                      ...selectedInteractionState,
                      mastered: event.target.checked
                    })}
                  />
                  <span>标记为已掌握</span>
                </label>
              ) : selectedManualVariant === "note" ? (
                <label className="topology-interaction-toggle">
                  <input
                    type="checkbox"
                    checked={selectedInteractionState.pinned === true}
                    onChange={(event) => void updateInteractionState({
                      ...selectedInteractionState,
                      pinned: event.target.checked
                    })}
                  />
                  <span>复习时置顶这条笔记</span>
                </label>
              ) : selectedManualVariant === "source" ? (
                <label className="topology-interaction-toggle">
                  <input
                    type="checkbox"
                    checked={selectedInteractionState.verified === true}
                    onChange={(event) => void updateInteractionState({
                      ...selectedInteractionState,
                      verified: event.target.checked
                    })}
                  />
                  <span>已与原文核对</span>
                </label>
              ) : (
                <textarea
                  rows={3}
                  placeholder="填写你的回应"
                  defaultValue={typeof selectedInteractionState.response === "string" ? selectedInteractionState.response : ""}
                  onBlur={(event) => void updateInteractionState({
                    ...selectedInteractionState,
                    response: event.target.value
                  })}
                />
              )}
            </div>
          )}
          <div className="topology-relation-editor">
            <strong>连接到其他节点</strong>
            <select value={relationTargetId} onChange={(event) => setRelationTargetId(event.target.value)}>
              <option value="">选择目标节点</option>
              {Object.values(displayNodes).filter((node) => node.id !== selectedManualNode.id).map((node) => (
                <option key={node.id} value={node.id}>{node.title}</option>
              ))}
            </select>
            <input value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} placeholder="关系名称" />
            <button
              type="button"
              disabled={!relationTargetId}
              onClick={() => {
                void onCreateRelation(selectedManualNode.id, relationTargetId, relationLabel);
                setRelationTargetId("");
              }}
            >
              <Plus aria-hidden="true" size={14} /> 建立关系
            </button>
            <div className="topology-relation-list">
              {displayEdges.filter((edge) => edge.persisted && (edge.sourceId === selectedManualNode.id || edge.targetId === selectedManualNode.id)).map((edge) => (
                <span key={edge.id}>
                  {edge.label || "关联"}
                  <button type="button" onClick={() => void onRemoveRelation(edge.id)} aria-label="删除关系">
                    <Unlink aria-hidden="true" size={13} />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <footer>
            <button
              className="is-danger"
              type="button"
              onClick={() => {
                void onRemoveManualNode(selectedManualNode.id);
                setSelectedManualId(null);
              }}
            >
              <Trash2 aria-hidden="true" size={15} /> 删除节点
            </button>
            <button
              type="button"
              disabled={editorBusy}
              onClick={() => void updateSelectedManual({ interactive: selectedManualIsInteractive })}
            >
              保存修改
            </button>
          </footer>
        </section>
      )}
      {fullScreen && selectedInteractiveNode && !composer && !selectedManualNode && (
        <section className="topology-node-editor topology-interactive-editor" aria-label="节点互动">
          <header>
            <div>
              <span>EDITABLE INTERACTIVE CARD</span>
              <strong>{selectedInteractiveNode.title}</strong>
            </div>
            <button type="button" onClick={() => setSelectedInteractiveId(null)} aria-label="关闭互动面板">
              <X aria-hidden="true" size={16} />
            </button>
          </header>
          <p>
            在拓扑中修改的 Card 内容保存到 SQLite，不会覆盖对应的 Markdown 正文。
          </p>
          <details className="node-config-editor-details">
            <summary>节点配置(描述 / 显示内容 / AI)</summary>
            <NodeConfigFields
              summary={interactiveSummary}
              config={interactiveConfig}
              typeConfig={selectedInteractiveNode.nodeType}
              modelOptions={modelOptions}
              onSummaryChange={setInteractiveSummary}
              onConfigChange={setInteractiveConfig}
            />
            <div className="node-config-actions">
              <button
                type="button"
                disabled={editorBusy}
                onClick={() => void saveNodeConfig()}
              >
                保存节点配置
              </button>
              {Boolean(selectedInteractiveNode.stored?.anchorJson) && (
                <button
                  type="button"
                  disabled={regenerating || editorBusy}
                  onClick={() => void handleRegenerate()}
                >
                  {regenerating ? "重新生成中…" : "重新生成内容"}
                </button>
              )}
            </div>
            {nodeConfigMessage && (
              <p className="node-config-message">{nodeConfigMessage}</p>
            )}
          </details>
          {selectedInteractiveNode.nodeType.cardVariant === "checklist" ? (
            <div className="topology-node-interaction topology-checklist-editor">
              <strong>清单条目</strong>
              {interactiveItems.map((item, index) => {
                const checked = Array.isArray(selectedGraphInteractionState.checked)
                  ? (selectedGraphInteractionState.checked as number[]).includes(index)
                  : false;
                return (
                  <div className="topology-checklist-row" key={index}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleInteractiveChecklistItem(index)}
                    />
                    <input
                      aria-label={`清单条目 ${index + 1}`}
                      value={item}
                      onChange={(event) =>
                        setInteractiveItems((current) =>
                          current.map((value, itemIndex) =>
                            itemIndex === index ? event.target.value : value
                          )
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label={`删除清单条目 ${index + 1}`}
                      onClick={() => {
                        const nextItems = interactiveItems.filter(
                          (_, itemIndex) => itemIndex !== index
                        );
                        const nextChecked = (
                          Array.isArray(selectedGraphInteractionState.checked)
                            ? (selectedGraphInteractionState.checked as number[])
                            : []
                        )
                          .filter((itemIndex) => itemIndex !== index)
                          .map((itemIndex) =>
                            itemIndex > index ? itemIndex - 1 : itemIndex
                          );
                        setInteractiveItems(nextItems);
                        void onUpdateInteraction(
                          selectedInteractiveNode.id,
                          "topology-card",
                          {
                            ...selectedGraphInteractionState,
                            items: nextItems,
                            checked: nextChecked
                          }
                        );
                      }}
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </button>
                  </div>
                );
              })}
              <button
                className="topology-add-item"
                type="button"
                onClick={() => setInteractiveItems((current) => [...current, "新条目"])}
              >
                <Plus aria-hidden="true" size={14} /> 添加条目
              </button>
            </div>
          ) : selectedInteractiveNode.nodeType.cardVariant === "flashcard" ? (
            <div className="topology-flashcard-editor">
              <label>
                <span>卡片问题</span>
                <input
                  value={interactiveQuestion}
                  onChange={(event) => setInteractiveQuestion(event.target.value)}
                />
              </label>
              <label>
                <span>卡片答案</span>
                <textarea
                  rows={5}
                  value={interactiveAnswer}
                  onChange={(event) => setInteractiveAnswer(event.target.value)}
                />
              </label>
              <button
                className="topology-flashcard-reveal"
                type="button"
                onClick={() => void onUpdateInteraction(
                  selectedInteractiveNode.id,
                  "topology-card",
                  {
                    ...selectedGraphInteractionState,
                    question: interactiveQuestion,
                    answer: interactiveAnswer,
                    revealed: !selectedGraphInteractionState.revealed
                  }
                )}
              >
                {selectedGraphInteractionState.revealed
                  ? interactiveAnswer || "暂无答案"
                  : interactiveQuestion || "点击翻开卡片"}
              </button>
            </div>
          ) : EDITABLE_INTERACTION_VARIANTS.has(
              selectedInteractiveNode.nodeType.cardVariant
            ) ? (
            <label>
              <span>
                {selectedInteractiveNode.nodeType.cardVariant === "highlight"
                  ? "重点内容"
                  : selectedInteractiveNode.nodeType.cardVariant === "note"
                    ? "笔记内容"
                    : "来源、链接与摘录"}
              </span>
              <textarea
                rows={8}
                value={interactiveContent}
                onChange={(event) => setInteractiveContent(event.target.value)}
              />
            </label>
          ) : (
            <label>
              <span>你的回应</span>
              <textarea
                rows={5}
                defaultValue={typeof selectedGraphInteractionState.response === "string" ? selectedGraphInteractionState.response : ""}
                onBlur={(event) => void onUpdateInteraction(
                  selectedInteractiveNode.id,
                  "response",
                  { ...selectedGraphInteractionState, response: event.target.value }
                )}
              />
            </label>
          )}
          <footer>
            <small>互动状态存入 SQLite，不改写节点对应的 Markdown 正文。</small>
            {EDITABLE_INTERACTION_VARIANTS.has(
              selectedInteractiveNode.nodeType.cardVariant
            ) && (
              <button
                type="button"
                disabled={editorBusy}
                onClick={() => void saveInteractiveCard()}
              >
                保存 Card 内容
              </button>
            )}
          </footer>
        </section>
      )}
      </div>
    </aside>
  );

  const expanded = open || pinned || resizing || fullScreen;

  return (
    <div
      className={`topology-shell${expanded ? " is-open" : ""}${fullScreen ? " is-fullscreen" : ""}`}
      data-small-expanded={smallExpanded}
      onPointerEnter={() => {
        pointerInsideRef.current = true;
      }}
      onPointerLeave={() => {
        pointerInsideRef.current = false;
        if (!fullScreen) {
          setOpen(false);
        }
      }}
      onBlur={(event) => {
        if (
          !fullScreen &&
          !pointerInsideRef.current &&
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        ) {
          setOpen(false);
        }
      }}
      style={
        {
          "--topology-width": `${size.width}px`,
          "--topology-height": `${size.height}px`
        } as CSSProperties
      }
    >
      {!fullScreen && (
        <button
          className="topology-trigger"
          type="button"
          aria-label="展开文章拓扑"
          aria-controls="article-topology-panel"
          aria-expanded={expanded}
          onPointerEnter={() => setOpen(true)}
          onClick={() => setOpen(true)}
        >
          <Network aria-hidden="true" size={20} />
        </button>
      )}
      {panel}
    </div>
  );
}
