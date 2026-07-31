export type BlockKind = "paragraph" | "h1" | "h2" | "h3" | "quote";
export type GenerationType = string;
export type JobStatus = "queued" | "generating" | "failed";
export type ViewName = "home" | "reader";
export type InlineMarkType =
  | "bold"
  | "italic"
  | "strikethrough"
  | "underline"
  | "wavyUnderline"
  | "border"
  | "textColor"
  | "backgroundColor";

export interface InlineMark {
  id: string;
  type: InlineMarkType;
  start: number;
  end: number;
  color?: string;
}

export interface ContentBlock {
  id: string;
  kind: BlockKind;
  text: string;
  marks?: InlineMark[];
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

export type FolderIconId =
  | "archive"
  | "book"
  | "briefcase"
  | "code"
  | "cpu"
  | "database"
  | "flask"
  | "folder"
  | "globe"
  | "graduation"
  | "layers"
  | "lightbulb"
  | "network"
  | "palette"
  | "rocket"
  | "shapes"
  | "shield"
  | "sparkles"
  | "template"
  | "wrench";

export interface FolderProfile {
  key: string;
  name: string;
  color: string;
  icon: FolderIconId;
  classifications: string[];
  description: string;
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
  rect?: { left: number; top: number; width: number };
}

export interface InlineFormatCommand {
  id: number;
  selection: SelectionState;
  type: InlineMarkType;
  color?: string;
}

export interface AppData {
  notebooks: Notebook[];
  folderProfiles: FolderProfile[];
  deletedFolderKeys: string[];
  articles: Record<string, ArticleNode>;
  jobs: GenerationJob[];
  currentNotebookId: string | null;
  currentArticleId: string | null;
}
