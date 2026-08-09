import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type PropsWithChildren
} from "react";
import { createEmptyAppData } from "../data/empty";
import type {
  AppData,
  ArticleNode,
  GenerationJob,
  GenerationType,
  Notebook,
  SelectionState
} from "../types";
import {
  clearBrowserMarkdownDocuments,
  loadMarkdownDocument,
  saveMarkdownDocument
} from "../editor/markdownRepository";
import {
  isGenerationTypeIconId,
  isTopologyCardVariant,
  loadGenerationTypes,
  rootDefaults,
  renderPromptTemplate
} from "../utils/generationConfig";
import {
  GENERATION_OUTPUT_INSTRUCTION,
  generateModelText
} from "../utils/modelGeneration";
import {
  assembleGenerationContext,
  parseGeneratedArticle
} from "../utils/generationRuntime";
import { resolveConfiguredModel } from "../utils/modelProviders";
import {
  deleteTopologyNode,
  deleteTopologyRelation,
  loadTopologyGraph,
  upsertTopologyCollection,
  upsertTopologyInteraction,
  upsertTopologyNode,
  upsertTopologyRelation,
  type TopologyGraphRecord,
  type TopologyNodeRecord
} from "../utils/topologyRepository";
import type {
  GenerationTypeIconId,
  TopologyCardVariant
} from "../utils/generationConfig";

export const APP_DATA_STORAGE_KEY = "annota.desktop.library.v2";
const LEGACY_STORAGE_KEY = "annota.desktop.demo.v1";
const RETIRED_LIBRARY_STORAGE_KEY = "annota.desktop.library.v1";
const CONTENT_RESET_STORAGE_KEY = "annota:content-reset.single-markdown-v1";

function normalizedNodeAppearance(value: unknown): ArticleNode["appearance"] {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.typeId !== "string" ||
    !isGenerationTypeIconId(record.icon) ||
    !isTopologyCardVariant(record.cardVariant) ||
    typeof record.color !== "string"
  ) {
    return undefined;
  }
  return {
    typeId: record.typeId,
    icon: record.icon,
    cardVariant: record.cardVariant,
    color: record.color
  };
}
type Action =
  | { type: "open-notebook"; notebookId: string; articleId?: string }
  | { type: "navigate"; articleId: string }
  | { type: "go-home" }
  | { type: "touch-article"; articleId: string }
  | { type: "create-notebook"; notebook: Notebook; article: ArticleNode }
  | { type: "create-root-article"; notebookId: string; article: ArticleNode }
  | { type: "replace-data"; data: AppData }
  | { type: "start-job"; job: GenerationJob }
  | {
      type: "job-status";
      jobId: string;
      status: GenerationJob["status"];
      error?: string;
    }
  | { type: "complete-job"; jobId: string; article: ArticleNode }
  | { type: "cancel-job"; jobId: string };

function metadataOnlyArticles(value: unknown): Record<string, ArticleNode> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([id, candidate]) => {
      if (!candidate || typeof candidate !== "object") return [];
      const record = candidate as Partial<ArticleNode>;
      if (
        typeof record.id !== "string" ||
        typeof record.rootId !== "string" ||
        typeof record.title !== "string"
      ) {
        return [];
      }
      const article: ArticleNode = {
        id: record.id,
        rootId: record.rootId,
        parentId: typeof record.parentId === "string" ? record.parentId : null,
        title: record.title,
        summary: typeof record.summary === "string" ? record.summary : "",
        type: typeof record.type === "string" ? record.type : "文章",
        childIds: Array.isArray(record.childIds)
          ? record.childIds.filter((childId): childId is string => typeof childId === "string")
          : [],
        createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
        appearance: normalizedNodeAppearance(record.appearance),
        source: record.source
      };
      return [[id, article]];
    })
  ) as Record<string, ArticleNode>;
}

function metadataOnlyNotebooks(value: unknown): Notebook[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Partial<Notebook>;
    if (
      typeof record.id !== "string" ||
      typeof record.rootId !== "string" ||
      typeof record.title !== "string"
    ) {
      return [];
    }
    return [{
      id: record.id,
      rootId: record.rootId,
      rootIds: Array.isArray(record.rootIds)
        ? Array.from(
            new Set([
              record.rootId,
              ...record.rootIds.filter((rootId): rootId is string => typeof rootId === "string")
            ])
          )
        : [record.rootId],
      title: record.title,
      summary: typeof record.summary === "string" ? record.summary : "",
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
      lastOpenedNodeId:
        typeof record.lastOpenedNodeId === "string"
          ? record.lastOpenedNodeId
          : record.rootId,
      accent:
        record.accent === "amber" || record.accent === "green"
          ? record.accent
          : "cobalt"
    }];
  });
}

function parseStoredData(raw: string): AppData | null {
  const parsed = JSON.parse(raw) as Partial<AppData>;
  if (!Array.isArray(parsed.notebooks) || !parsed.articles) return null;
  return {
    notebooks: metadataOnlyNotebooks(parsed.notebooks),
    articles: metadataOnlyArticles(parsed.articles),
    jobs: [],
    currentNotebookId: null,
    currentArticleId: null
  };
}

function loadInitialData(): AppData {
  if (typeof window === "undefined") return createEmptyAppData();
  try {
    if (window.localStorage.getItem(CONTENT_RESET_STORAGE_KEY) !== "done") {
      window.localStorage.removeItem(RETIRED_LIBRARY_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      clearBrowserMarkdownDocuments();
      window.localStorage.setItem(CONTENT_RESET_STORAGE_KEY, "done");
      return createEmptyAppData();
    }
    const current = window.localStorage.getItem(APP_DATA_STORAGE_KEY);
    if (current) return parseStoredData(current) ?? createEmptyAppData();
    return createEmptyAppData();
  } catch {
    return createEmptyAppData();
  }
}

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case "open-notebook": {
      const notebook = state.notebooks.find((item) => item.id === action.notebookId);
      if (!notebook) return state;
      const articleId = action.articleId ?? notebook.lastOpenedNodeId ?? notebook.rootId;
      return {
        ...state,
        currentNotebookId: notebook.id,
        currentArticleId: articleId,
        notebooks: state.notebooks.map((item) =>
          item.id === notebook.id
            ? { ...item, lastOpenedNodeId: articleId, updatedAt: new Date().toISOString() }
            : item
        )
      };
    }
    case "navigate":
      if (!state.articles[action.articleId]) return state;
      return {
        ...state,
        currentArticleId: action.articleId,
        notebooks: state.notebooks.map((item) =>
          item.id === state.currentNotebookId
            ? { ...item, lastOpenedNodeId: action.articleId, updatedAt: new Date().toISOString() }
            : item
        )
      };
    case "go-home":
      return { ...state, currentNotebookId: null, currentArticleId: null };
    case "touch-article": {
      const article = state.articles[action.articleId];
      if (!article) return state;
      const nextArticle = {
        ...article,
        updatedAt: new Date().toISOString()
      };
      return {
        ...state,
        articles: { ...state.articles, [article.id]: nextArticle },
        notebooks: state.notebooks.map((notebook) =>
          notebook.rootId === article.rootId
            ? {
                ...notebook,
                title: article.parentId === null ? nextArticle.title : notebook.title,
                updatedAt: nextArticle.updatedAt
              }
            : notebook
        )
      };
    }
    case "create-notebook":
      return {
        ...state,
        notebooks: [action.notebook, ...state.notebooks],
        articles: { ...state.articles, [action.article.id]: action.article },
        currentNotebookId: action.notebook.id,
        currentArticleId: action.article.id
      };
    case "create-root-article": {
      const notebook = state.notebooks.find((item) => item.id === action.notebookId);
      if (!notebook) return state;
      return {
        ...state,
        articles: { ...state.articles, [action.article.id]: action.article },
        notebooks: state.notebooks.map((item) =>
          item.id === action.notebookId
            ? {
                ...item,
                rootIds: Array.from(
                  new Set([...(item.rootIds ?? [item.rootId]), action.article.id])
                ),
                lastOpenedNodeId: action.article.id,
                updatedAt: action.article.updatedAt
              }
            : item
        ),
        currentNotebookId: action.notebookId,
        currentArticleId: action.article.id
      };
    }
    case "replace-data":
      return action.data;
    case "start-job":
      return { ...state, jobs: [...state.jobs, action.job] };
    case "job-status":
      return {
        ...state,
        jobs: state.jobs.map((job) =>
          job.id === action.jobId
            ? { ...job, status: action.status, error: action.error }
            : job
        )
      };
    case "cancel-job":
      return { ...state, jobs: state.jobs.filter((job) => job.id !== action.jobId) };
    case "complete-job": {
      const job = state.jobs.find((item) => item.id === action.jobId);
      if (!job) return state;
      const parent = state.articles[job.parentId];
      if (!parent) return { ...state, jobs: state.jobs.filter((item) => item.id !== action.jobId) };
      return {
        ...state,
        jobs: state.jobs.filter((item) => item.id !== action.jobId),
        articles: {
          ...state.articles,
          [parent.id]: {
            ...parent,
            childIds: [...parent.childIds, action.article.id],
            updatedAt: new Date().toISOString()
          },
          [action.article.id]: action.article
        },
        notebooks: state.notebooks.map((notebook) =>
          notebook.rootId === parent.rootId
            ? { ...notebook, updatedAt: new Date().toISOString() }
            : notebook
        )
      };
    }
    default:
      return state;
  }
}

interface AppStoreValue {
  data: AppData;
  currentArticle: ArticleNode | null;
  currentNotebook: Notebook | null;
  openNotebook: (notebookId: string, articleId?: string) => void;
  navigateTo: (articleId: string) => void;
  goHome: () => void;
  touchArticle: (articleId: string) => void;
  createNotebook: (title: string, text?: string) => Promise<string>;
  createRootArticle: (title: string, text?: string) => Promise<string | null>;
  topologyGraph: TopologyGraphRecord | null;
  topologyError: string;
  createManualTopologyNode: (draft: {
    nodeType: string;
    title: string;
    content: string;
    parentId: string | null;
    isRoot: boolean;
    interactive: boolean;
    icon: GenerationTypeIconId;
    cardVariant: TopologyCardVariant;
    color: string;
  }) => Promise<TopologyNodeRecord | null>;
  updateManualTopologyNode: (node: TopologyNodeRecord) => Promise<void>;
  removeManualTopologyNode: (nodeId: string) => Promise<void>;
  createTopologyRelation: (
    sourceNodeId: string,
    targetNodeId: string,
    label: string,
    directed?: boolean
  ) => Promise<void>;
  removeTopologyRelation: (relationId: string) => Promise<void>;
  updateTopologyInteraction: (
    nodeId: string,
    interactionType: string,
    state: Record<string, unknown>
  ) => Promise<void>;
  importPackage: (text: string, fileName: string) => Promise<{ ok: boolean; message: string }>;
  exportCurrentTree: () => Promise<void>;
  startGeneration: (
    parentId: string,
    selection: SelectionState,
    type: GenerationType
  ) => { ok: boolean; message: string };
  cancelGeneration: (jobId: string) => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

function safeTitle(fileName: string): string {
  return fileName.replace(/\.(md|markdown|txt|annota|json)$/i, "").trim() || "未命名笔记";
}

export function AppStoreProvider({ children }: PropsWithChildren) {
  const [data, dispatch] = useReducer(reducer, undefined, loadInitialData);
  const [topologyGraph, setTopologyGraph] = useState<TopologyGraphRecord | null>(null);
  const [topologyError, setTopologyError] = useState("");

  useEffect(() => {
    const persistable = { ...data, jobs: [] };
    window.localStorage.setItem(
      APP_DATA_STORAGE_KEY,
      JSON.stringify(persistable)
    );
  }, [data]);

  const openNotebook = useCallback((notebookId: string, articleId?: string) => {
    dispatch({ type: "open-notebook", notebookId, articleId });
  }, []);

  const navigateTo = useCallback((articleId: string) => {
    dispatch({ type: "navigate", articleId });
  }, []);

  const goHome = useCallback(() => dispatch({ type: "go-home" }), []);

  const touchArticle = useCallback((articleId: string) => {
    dispatch({ type: "touch-article", articleId });
  }, []);

  const createNotebook = useCallback(async (title: string, text = "") => {
    const stamp = Date.now();
    const rootId = `root-${stamp}`;
    const notebookId = `notebook-${stamp}`;
    const now = new Date().toISOString();
    const article: ArticleNode = {
      id: rootId,
      rootId,
      parentId: null,
      title: title.trim() || "未命名笔记",
      summary: text.trim()
        ? text.replace(/\s+/g, " ").slice(0, 90)
        : "从这里开始记录内容，或导入 Markdown / TXT 材料。",
      type: "根节点",
      childIds: [],
      createdAt: now,
      updatedAt: now,
      appearance: {
        typeId: rootDefaults.id,
        icon: rootDefaults.icon,
        cardVariant: rootDefaults.cardVariant,
        color: rootDefaults.color
      },
    };
    const notebook: Notebook = {
      id: notebookId,
      rootId,
      rootIds: [rootId],
      title: article.title,
      summary: article.summary,
      updatedAt: now,
      lastOpenedNodeId: rootId,
      accent: "cobalt"
    };
    await saveMarkdownDocument(rootId, text.replace(/\r\n?/g, "\n"));
    dispatch({ type: "create-notebook", notebook, article });
    return notebookId;
  }, []);

  const createRootArticle = useCallback(
    async (title: string, text = "") => {
      if (!data.currentNotebookId) return null;
      const stamp = Date.now();
      const articleId = `root-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const article: ArticleNode = {
        id: articleId,
        rootId: articleId,
        parentId: null,
        title: title.trim() || "未命名根节点",
        summary: text.trim()
          ? text.replace(/\s+/g, " ").slice(0, 90)
          : "独立于其他根节点的 Markdown 内容入口。",
        type: "根节点",
        childIds: [],
        createdAt: now,
        updatedAt: now,
        appearance: {
          typeId: rootDefaults.id,
          icon: rootDefaults.icon,
          cardVariant: rootDefaults.cardVariant,
          color: rootDefaults.color
        }
      };
      await saveMarkdownDocument(articleId, text.replace(/\r\n?/g, "\n"));
      dispatch({
        type: "create-root-article",
        notebookId: data.currentNotebookId,
        article
      });
      return articleId;
    },
    [data.currentNotebookId]
  );

  const refreshTopologyGraph = useCallback(async (collectionId: string) => {
    const graph = await loadTopologyGraph(collectionId);
    setTopologyGraph(graph);
    setTopologyError("");
    return graph;
  }, []);

  useEffect(() => {
    const notebook = data.notebooks.find((item) => item.id === data.currentNotebookId);
    if (!notebook) {
      setTopologyGraph(null);
      setTopologyError("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await upsertTopologyCollection({
          id: notebook.id,
          title: notebook.title,
          description: notebook.summary
        });
        const rootIds = new Set(notebook.rootIds ?? [notebook.rootId]);
        const articles = Object.values(data.articles).filter(
          (article) => rootIds.has(article.rootId) || rootIds.has(article.id)
        );
        await Promise.all(
          articles.map((article) =>
            upsertTopologyNode({
              id: article.id,
              collectionId: notebook.id,
              nodeType: article.appearance?.typeId ?? (article.parentId ? "explain" : "root"),
              title: article.title,
              summary: article.summary,
              contentMode: "markdown",
              content: null,
              documentId: article.id,
              isRoot: article.parentId === null,
              isManual: false,
              enabled: true,
              interactive: false,
              interactionStateJson: "{}",
              appearanceJson: JSON.stringify(article.appearance ?? {})
            })
          )
        );
        await Promise.all(
          articles.flatMap((article) =>
            article.childIds.map((childId) =>
              upsertTopologyRelation({
                id: `tree:${article.id}:${childId}`,
                collectionId: notebook.id,
                sourceNodeId: article.id,
                targetNodeId: childId,
                relationType: "contains",
                label: data.articles[childId]?.type ?? "下一级",
                directed: true,
                metadataJson: JSON.stringify({ source: "markdown-tree" })
              })
            )
          )
        );
        const graph = await loadTopologyGraph(notebook.id);
        if (!cancelled) {
          setTopologyGraph(graph);
          setTopologyError("");
        }
      } catch (error) {
        if (!cancelled) {
          setTopologyError(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data.articles, data.currentNotebookId, data.notebooks]);

  const createManualTopologyNode = useCallback(
    async (draft: {
      nodeType: string;
      title: string;
      content: string;
      parentId: string | null;
      isRoot: boolean;
      interactive: boolean;
      icon: GenerationTypeIconId;
      cardVariant: TopologyCardVariant;
      color: string;
    }) => {
      if (!data.currentNotebookId) return null;
      const stamp = Date.now();
      const node = await upsertTopologyNode({
        id: `node-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
        collectionId: data.currentNotebookId,
        nodeType: draft.nodeType,
        title: draft.title.trim() || "未命名节点",
        summary: draft.content.trim().replace(/\s+/g, " ").slice(0, 90),
        contentMode: "database",
        content: draft.content,
        documentId: null,
        isRoot: draft.isRoot,
        isManual: true,
        enabled: true,
        interactive: draft.interactive,
        interactionStateJson: "{}",
        appearanceJson: JSON.stringify({
          typeId: draft.nodeType,
          icon: draft.icon,
          cardVariant: draft.cardVariant,
          color: draft.color
        })
      });
      if (!draft.isRoot && draft.parentId) {
        await upsertTopologyRelation({
          id: `manual:${draft.parentId}:${node.id}`,
          collectionId: data.currentNotebookId,
          sourceNodeId: draft.parentId,
          targetNodeId: node.id,
          relationType: "manual-child",
          label: "关联节点",
          directed: true,
          metadataJson: "{}"
        });
      }
      await refreshTopologyGraph(data.currentNotebookId);
      return node;
    },
    [data.currentNotebookId, refreshTopologyGraph]
  );

  const updateManualTopologyNode = useCallback(
    async (node: TopologyNodeRecord) => {
      if (!data.currentNotebookId || node.contentMode !== "database") return;
      await upsertTopologyNode({
        id: node.id,
        collectionId: node.collectionId,
        nodeType: node.nodeType,
        title: node.title,
        summary: node.summary,
        contentMode: "database",
        content: node.content,
        documentId: null,
        isRoot: node.isRoot,
        isManual: true,
        enabled: node.enabled,
        interactive: node.interactive,
        interactionStateJson: node.interactionStateJson,
        appearanceJson: node.appearanceJson
      });
      await refreshTopologyGraph(data.currentNotebookId);
    },
    [data.currentNotebookId, refreshTopologyGraph]
  );

  const removeManualTopologyNode = useCallback(
    async (nodeId: string) => {
      if (!data.currentNotebookId) return;
      await deleteTopologyNode(nodeId);
      await refreshTopologyGraph(data.currentNotebookId);
    },
    [data.currentNotebookId, refreshTopologyGraph]
  );

  const createTopologyRelation = useCallback(
    async (
      sourceNodeId: string,
      targetNodeId: string,
      label: string,
      directed = true
    ) => {
      if (!data.currentNotebookId || sourceNodeId === targetNodeId) return;
      await upsertTopologyRelation({
        id: `relation:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
        collectionId: data.currentNotebookId,
        sourceNodeId,
        targetNodeId,
        relationType: "related",
        label: label.trim() || "关联",
        directed,
        metadataJson: "{}"
      });
      await refreshTopologyGraph(data.currentNotebookId);
    },
    [data.currentNotebookId, refreshTopologyGraph]
  );

  const removeTopologyRelation = useCallback(
    async (relationId: string) => {
      if (!data.currentNotebookId) return;
      await deleteTopologyRelation(relationId);
      await refreshTopologyGraph(data.currentNotebookId);
    },
    [data.currentNotebookId, refreshTopologyGraph]
  );

  const updateTopologyInteraction = useCallback(
    async (
      nodeId: string,
      interactionType: string,
      state: Record<string, unknown>
    ) => {
      if (!data.currentNotebookId) return;
      await upsertTopologyInteraction({
        id: `interaction:${nodeId}:${interactionType}`,
        nodeId,
        interactionType,
        title: "拓扑节点互动",
        configJson: "{}",
        stateJson: JSON.stringify(state),
        enabled: true
      });
      await refreshTopologyGraph(data.currentNotebookId);
    },
    [data.currentNotebookId, refreshTopologyGraph]
  );

  const importPackage = useCallback(
    async (text: string, fileName: string) => {
      if (/\.annota$|\.json$/i.test(fileName)) {
        try {
          const parsed = JSON.parse(text) as Partial<AppData> & {
            format?: string;
            documents?: Record<string, string>;
          };
          if (
            parsed.format !== "annota-v2" ||
            !Array.isArray(parsed.notebooks) ||
            !parsed.articles ||
            !parsed.documents
          ) {
            return { ok: false, message: "仅支持包含 Markdown 文档的 annota-v2 关系包。" };
          }
          await Promise.all(
            Object.entries(parsed.documents).map(([id, markdown]) =>
              typeof markdown === "string"
                ? saveMarkdownDocument(id, markdown)
                : Promise.reject(new Error("关系包包含无效 Markdown 文档"))
            )
          );
          dispatch({
            type: "replace-data",
            data: {
              notebooks: metadataOnlyNotebooks(parsed.notebooks),
              articles: metadataOnlyArticles(parsed.articles),
              jobs: [],
              currentNotebookId: null,
              currentArticleId: null
            }
          });
          return { ok: true, message: `已导入 ${parsed.notebooks.length} 个内容集合。` };
        } catch {
          return { ok: false, message: "无法解析关系包；请确认文件未损坏。" };
        }
      }
      await createNotebook(safeTitle(fileName), text);
      return { ok: true, message: "内容已作为根节点导入并打开。" };
    },
    [createNotebook]
  );

  const exportCurrentTree = useCallback(async () => {
    const notebook = data.notebooks.find((item) => item.id === data.currentNotebookId);
    if (!notebook) return;
    const ids = new Set<string>();
    const collect = (id: string) => {
      if (ids.has(id)) return;
      ids.add(id);
      data.articles[id]?.childIds.forEach(collect);
    };
    (notebook.rootIds ?? [notebook.rootId]).forEach(collect);
    const articles = Object.fromEntries(
      Array.from(ids)
        .map((id) => [id, data.articles[id]])
        .filter((entry) => Boolean(entry[1]))
    );
    const documents = Object.fromEntries(
      await Promise.all(
        Array.from(ids).map(async (id) => [id, (await loadMarkdownDocument(id)).content])
      )
    );
    const payload = {
      format: "annota-v2",
      exportedAt: new Date().toISOString(),
      notebooks: [notebook],
      articles,
      documents,
      jobs: [],
      currentNotebookId: null,
      currentArticleId: null
    };
    if (topologyGraph?.collection.id === notebook.id) {
      Object.assign(payload, { topology: topologyGraph });
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${notebook.title.replace(/[\\/:*?"<>|]/g, "_")}.annota`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [data, topologyGraph]);

  const startGeneration = useCallback(
    (
      parentId: string,
      selection: SelectionState,
      typeId: GenerationType
    ) => {
      const parent = data.articles[parentId];
      const generationType = loadGenerationTypes().find(
        (item) =>
          item.id === typeId && item.executionMode === "ai" && item.enabled
      );
      if (!parent || !generationType) {
        return {
          ok: false,
          message: "该拓扑节点当前不可用，请检查“拓扑节点”设置。"
        };
      }
      const resolvedModel = resolveConfiguredModel(
        generationType.modelBindingId
      );
      if (!resolvedModel) {
        return {
          ok: false,
          message:
            "没有可用模型。请先在“AI 模型服务”填写 API Key、通过联通检测，再为该拓扑节点选择模型。"
        };
      }

      const stamp = Date.now();
      const jobId = `generation-${stamp}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const job: GenerationJob = {
        id: jobId,
        parentId,
        blockId: selection.blockId,
        quote: selection.text,
        type: generationType.id,
        typeName: generationType.name,
        model: `${resolvedModel.provider.name} · ${resolvedModel.model}`,
        status: "queued",
        createdAt: new Date().toISOString()
      };
      dispatch({ type: "start-job", job });

      void (async () => {
        dispatch({ type: "job-status", jobId, status: "generating" });
        try {
          const contextArticleIds: string[] = [];
          let contextCursor: ArticleNode | undefined = parent;
          while (contextCursor) {
            contextArticleIds.unshift(contextCursor.id);
            contextCursor = contextCursor.parentId
              ? data.articles[contextCursor.parentId]
              : undefined;
          }
          const documents = Object.fromEntries(
            await Promise.all(
              contextArticleIds.map(async (id) => [id, (await loadMarkdownDocument(id)).content])
            )
          );
          const context = assembleGenerationContext(
            data.articles,
            documents,
            parent,
            selection,
            generationType.contextScope
          );
          const systemPrompt =
            renderPromptTemplate(
              generationType.systemPrompt,
              context.values
            ) + GENERATION_OUTPUT_INSTRUCTION;
          const userPrompt = `${renderPromptTemplate(
            generationType.userPrompt,
            context.values
          )}\n\n<context_scope>${context.suppliedContext}</context_scope>`;
          const response = await generateModelText({
            baseUrl: resolvedModel.provider.baseUrl,
            endpointPath: resolvedModel.provider.endpointPath,
            apiKey: resolvedModel.provider.apiKey,
            protocol: resolvedModel.provider.protocol,
            model: resolvedModel.model,
            systemPrompt,
            userPrompt
          });
          const articleId = `article-${stamp}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;
          const generated = parseGeneratedArticle(
            response,
            `${generationType.name}：${selection.text.slice(0, 28)}`
          );
          const now = new Date().toISOString();
          const article: ArticleNode = {
            id: articleId,
            rootId: parent.rootId,
            parentId: parent.id,
            title: generated.title,
            summary: generated.summary,
            type: generationType.relationLabel || generationType.name,
            childIds: [],
            createdAt: now,
            updatedAt: now,
            appearance: {
              typeId: generationType.id,
              icon: generationType.icon,
              cardVariant: generationType.cardVariant,
              color: generationType.color
            },
            source: {
              parentId: parent.id,
              blockId: selection.blockId,
              quote: selection.text,
              generationType: generationType.id
            }
          };
          await saveMarkdownDocument(articleId, generated.markdown);
          dispatch({ type: "complete-job", jobId, article });
        } catch (error) {
          dispatch({
            type: "job-status",
            jobId,
            status: "failed",
            error: error instanceof Error ? error.message : String(error)
          });
        }
      })();

      return {
        ok: true,
        message: `已使用 ${resolvedModel.provider.name} · ${resolvedModel.model} 开始“${generationType.name}”。`
      };
    },
    [data.articles]
  );

  const cancelGeneration = useCallback((jobId: string) => {
    dispatch({ type: "cancel-job", jobId });
  }, []);

  const currentArticle = data.currentArticleId ? data.articles[data.currentArticleId] ?? null : null;
  const currentNotebook =
    data.notebooks.find((item) => item.id === data.currentNotebookId) ?? null;

  const value = useMemo<AppStoreValue>(
    () => ({
      data,
      currentArticle,
      currentNotebook,
      openNotebook,
      navigateTo,
      goHome,
      touchArticle,
      createNotebook,
      createRootArticle,
      topologyGraph,
      topologyError,
      createManualTopologyNode,
      updateManualTopologyNode,
      removeManualTopologyNode,
      createTopologyRelation,
      removeTopologyRelation,
      updateTopologyInteraction,
      importPackage,
      exportCurrentTree,
      startGeneration,
      cancelGeneration
    }),
    [
      data,
      currentArticle,
      currentNotebook,
      openNotebook,
      navigateTo,
      goHome,
      touchArticle,
      createNotebook,
      createRootArticle,
      topologyGraph,
      topologyError,
      createManualTopologyNode,
      updateManualTopologyNode,
      removeManualTopologyNode,
      createTopologyRelation,
      removeTopologyRelation,
      updateTopologyInteraction,
      importPackage,
      exportCurrentTree,
      startGeneration,
      cancelGeneration
    ]
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error("useAppStore must be used inside AppStoreProvider");
  return value;
}
