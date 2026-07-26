export type BlockKind = "paragraph" | "h1" | "h2" | "h3" | "quote";
export type GenerationType = "explain" | "translate";
export type JobStatus = "queued" | "generating" | "failed";
export type ViewName = "home" | "reader";

export interface ContentBlock {
  id: string;
  kind: BlockKind;
  text: string;
}

export interface ArticleNode {
  id: string;
  rootId: string;
  parentId: string | null;
  title: string;
  summary: string;
  type: string;
  tags: string[];
  blocks: ContentBlock[];
  childIds: string[];
  createdAt: string;
  updatedAt: string;
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
  title: string;
  summary: string;
  tags: string[];
  category: string;
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
  status: JobStatus;
  createdAt: string;
}

export interface SelectionState {
  text: string;
  blockId: string;
  rect?: { left: number; top: number; width: number };
}

export interface AppData {
  notebooks: Notebook[];
  articles: Record<string, ArticleNode>;
  jobs: GenerationJob[];
  currentNotebookId: string | null;
  currentArticleId: string | null;
}
