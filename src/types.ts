import type {
  GenerationTypeIconId,
  TopologyCardVariant
} from "./utils/generationConfig";

export type GenerationType = string;
export type JobStatus = "queued" | "generating" | "failed";
export type ViewName = "home" | "reader";
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
  };
}

export interface Notebook {
  id: string;
  rootId: string;
  rootIds?: string[];
  title: string;
  summary: string;
  updatedAt: string;
  lastOpenedNodeId: string;
  accent: "cobalt" | "amber" | "green";
}

export interface GenerationJob {
  id: string;
  parentId: string;
  blockId: string;
  quote: string;
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
