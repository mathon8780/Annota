import type {
  GenerationTypeIconId,
  TopologyCardVariant
} from "./utils/generationConfig";

export type GenerationType = string;
export type JobStatus = "queued" | "generating" | "failed";
export type ViewName = "home" | "reader";
export type NodeFamily = "笔记" | "记录" | "交互";
export type MarkdownFormatType =
  | "bold"
  | "italic"
  | "strikethrough"
  | "underline"
  | "wavyUnderline"
  | "border"
  | "textColor"
  | "backgroundColor";

export interface ArticleNode {
  id: string;
  rootId: string;
  parentId: string | null;
  title: string;
  summary: string;
  type: string;
  childIds: string[];
  createdAt: string;
  updatedAt: string;
  appearance?: {
    typeId: string;
    icon: GenerationTypeIconId;
    cardVariant: TopologyCardVariant;
    color: string;
  };
  source?: {
    parentId: string;
    blockId: string;
    quote: string;
    generationType: GenerationType;
    start?: number;
    end?: number;
    documentStart?: number;
    documentEnd?: number;
  };
  /** 数据契约字段(拓扑Card节点内容结构化JSON):家族、创建方式、结构化内容、原文锚点、生成信息。 */
  family?: NodeFamily;
  creationMethod?: string;
  contentJson?: unknown;
  anchorJson?: unknown;
  generationJson?: unknown;
}

export interface Collection {
  id: string;
  rootId: string;
  rootIds?: string[];
  knowledgePointIds?: string[];
  title: string;
  summary: string;
  description: string;
  color: string;
  icon: string;
  updatedAt: string;
  lastOpenedNodeId: string;
  accent: "cobalt" | "amber" | "green";
}

/** 一篇主文章及其派生节点构成一个知识点；根 ArticleNode 即知识点记录。 */
export type KnowledgePoint = ArticleNode;

/** 旧组件名仍在逐步收敛，运行时语义已经是集合。 */
export type Notebook = Collection;

export interface GenerationJob {
  id: string;
  parentId: string;
  blockId: string;
  quote: string;
  start?: number;
  end?: number;
  documentStart?: number;
  documentEnd?: number;
  type: GenerationType;
  typeName: string;
  model?: string;
  error?: string;
  status: JobStatus;
  createdAt: string;
}

export interface SelectionState {
  text: string;
  blockId: string;
  start: number;
  end: number;
  documentStart?: number;
  documentEnd?: number;
  rect?: { left: number; top: number; width: number };
}

export interface InlineFormatCommand {
  id: number;
  selection: SelectionState;
  type: MarkdownFormatType;
  color?: string;
}

export interface AppData {
  notebooks: Notebook[];
  articles: Record<string, ArticleNode>;
  jobs: GenerationJob[];
  currentNotebookId: string | null;
  currentArticleId: string | null;
}
