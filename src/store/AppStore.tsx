import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
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
  SelectionState,
  TopologyCardPatch
} from "../types";
import {
  clearMarkdownWorkspaceSession,
  loadMarkdownDocument,
  saveMarkdownDocument
} from "../editor/markdownRepository";
import {
  hydrateGenerationTypesFromDatabase,
  awaitGenerationTypeWrites,
  loadGenerationTypes,
  mergeNodeLevelConfig,
  normalizeNodeLevelConfig,
  rootDefaults,
  typeFamily,
  type NodeLevelConfig
} from "../utils/generationConfig";
import { generateNodeContent } from "../utils/generationService";
import { decodeLibraryMetadata, libraryAppData } from "../utils/libraryData";
import { resolveConfiguredModel } from "../utils/modelProviders";
import {
  awaitDesktopLibraryWrites,
  isDesktopLibrary,
  loadDesktopLibrary,
  replaceDesktopLibrary,
  type LibraryMetadata
} from "../utils/libraryRepository";
import {
  addExistingWorkspace,
  createWorkspace,
  diagnoseWorkspace,
  listWorkspaces,
  removeWorkspace,
  switchWorkspace,
  type WorkspaceCatalog,
  type WorkspaceDiagnosticReport
} from "../utils/workspaceRepository";
import {
  deleteTopologyNode,
  deleteTopologyRelation,
  decodeTopologyGraph,
  loadTopologyGraph,
  setBrowserLibraryMetadata,
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

type Action =
  | { type: "open-notebook"; notebookId: string; articleId?: string }
  | { type: "navigate"; articleId: string }
  | { type: "go-home" }
  | { type: "touch-article"; articleId: string }
  | { type: "update-article"; articleId: string; patch: Partial<ArticleNode> }
  | { type: "create-notebook"; notebook: Notebook; article: ArticleNode }
  | { type: "add-notebook"; notebook: Notebook }
  | { type: "add-to-collection"; notebookId: string; articleIds: string[] }
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

function loadInitialData(): AppData {
  if (typeof window === "undefined") return createEmptyAppData();
  if (isDesktopLibrary()) return createEmptyAppData();
  try {
    const current = window.localStorage.getItem(APP_DATA_STORAGE_KEY);
    if (current) return libraryAppData(decodeLibraryMetadata(JSON.parse(current)));
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
    case "update-article": {
      const article = state.articles[action.articleId];
      if (!article) return state;
      return {
        ...state,
        articles: {
          ...state.articles,
          [article.id]: { ...article, ...action.patch, updatedAt: new Date().toISOString() }
        }
      };
    }
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
          notebook.rootIds.includes(
            article.rootId
          )
            ? {
                ...notebook,
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
    case "add-notebook":
      if (state.notebooks.some((item) => item.id === action.notebook.id)) {
        return state;
      }
      return {
        ...state,
        notebooks: [action.notebook, ...state.notebooks]
      };
    case "add-to-collection":
      return {
        ...state,
        notebooks: state.notebooks.map((item) =>
          item.id === action.notebookId
            ? {
                ...item,
                rootIds: Array.from(
                  new Set([...item.rootIds, ...action.articleIds])
                ),
                updatedAt: new Date().toISOString()
              }
            : item
        )
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
                  new Set([...item.rootIds, action.article.id])
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
          notebook.rootIds.includes(parent.rootId)
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
  workspaceCatalog: WorkspaceCatalog | null;
  workspaceBusy: boolean;
  workspaceError: string;
  createWorkspaceAt: (path: string, displayName: string) => Promise<boolean>;
  addWorkspaceFrom: (path: string) => Promise<boolean>;
  activateWorkspace: (workspaceId: string) => Promise<boolean>;
  forgetWorkspace: (workspaceId: string) => Promise<boolean>;
  runWorkspaceDiagnostics: () => Promise<WorkspaceDiagnosticReport | null>;
  openNotebook: (notebookId: string, articleId?: string) => void;
  navigateTo: (articleId: string) => void;
  goHome: () => void;
  touchArticle: (articleId: string) => void;
  createNotebook: (
    title: string,
    text?: string,
    metadata?: { description?: string; color?: string; icon?: string }
  ) => Promise<string>;
  createKnowledgePoint: (
    collectionId: string,
    title: string,
    text?: string
  ) => Promise<string | null>;
  createRootArticle: (title: string, text?: string) => Promise<string | null>;
  ensureCollectionForArticle: (articleId: string) => Promise<string | null>;
  collectArticle: (
    notebookId: string,
    articleIds: string[]
  ) => Promise<void>;
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
  updateNodeConfig: (
    nodeId: string,
    config: NodeLevelConfig | null
  ) => Promise<void>;
  updateTopologyCard: (nodeId: string, patch: TopologyCardPatch) => Promise<void>;
  regenerateNode: (
    nodeId: string
  ) => Promise<{ ok: boolean; message: string }>;
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
  return fileName.replace(/\.(md|markdown|txt|annota|json)$/i, "").trim() || "未命名知识点";
}

function randomEntityId(prefix: string) {
  const value = globalThis.crypto?.randomUUID?.().replaceAll("-", "") ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${value}`;
}

export function AppStoreProvider({ children }: PropsWithChildren) {
  const desktopLibrary = isDesktopLibrary();
  const [data, dispatch] = useReducer(reducer, undefined, loadInitialData);
  const [topologyGraph, setTopologyGraph] = useState<TopologyGraphRecord | null>(null);
  const [topologyError, setTopologyError] = useState("");
  const [libraryPhase, setLibraryPhase] = useState<"loading" | "ready" | "error">(
    desktopLibrary ? "loading" : "ready"
  );
  const [libraryError, setLibraryError] = useState("");
  const [workspaceCatalog, setWorkspaceCatalog] = useState<WorkspaceCatalog | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const savedMetadata = useRef<LibraryMetadata | null>(null);

  const durableLibraryMetadata = useMemo<LibraryMetadata>(
    () => ({ notebooks: data.notebooks, articles: data.articles }),
    [data.articles, data.notebooks]
  );

  useEffect(() => {
    if (!desktopLibrary) return;
    let cancelled = false;
    void (async () => {
      const catalog = await listWorkspaces();
      const metadata = await loadDesktopLibrary();
      await hydrateGenerationTypesFromDatabase();
      return { catalog, metadata };
    })()
      .then(({ catalog, metadata }) => {
        if (cancelled) return;
        savedMetadata.current = metadata;
        setWorkspaceCatalog(catalog);
        dispatch({
          type: "replace-data",
          data: libraryAppData(metadata)
        });
        setLibraryError("");
        setWorkspaceError("");
        setLibraryPhase("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setLibraryError(
          `无法打开工作区资料库：${error instanceof Error ? error.message : String(error)}`
        );
        setLibraryPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [desktopLibrary]);

  const applyWorkspaceChange = useCallback(
    async (operation: () => Promise<WorkspaceCatalog>) => {
      if (!desktopLibrary) {
        setWorkspaceError("工作区目录管理仅在桌面应用中可用");
        return false;
      }
      setWorkspaceBusy(true);
      setWorkspaceError("");
      try {
        await Promise.all([awaitDesktopLibraryWrites(), awaitGenerationTypeWrites()]);
        const catalog = await operation();
        clearMarkdownWorkspaceSession();
        const metadata = await loadDesktopLibrary();
        await hydrateGenerationTypesFromDatabase();
        savedMetadata.current = metadata;
        dispatch({
          type: "replace-data",
          data: libraryAppData(metadata)
        });
        setTopologyGraph(null);
        setTopologyError("");
        setWorkspaceCatalog(catalog);
        setLibraryError("");
        return true;
      } catch (error) {
        setWorkspaceError(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setWorkspaceBusy(false);
      }
    },
    [desktopLibrary]
  );

  const createWorkspaceAt = useCallback(
    (path: string, displayName: string) =>
      applyWorkspaceChange(() => createWorkspace(path, displayName)),
    [applyWorkspaceChange]
  );

  const addWorkspaceFrom = useCallback(
    (path: string) => applyWorkspaceChange(() => addExistingWorkspace(path)),
    [applyWorkspaceChange]
  );

  const activateWorkspace = useCallback(
    (workspaceId: string) => applyWorkspaceChange(() => switchWorkspace(workspaceId)),
    [applyWorkspaceChange]
  );

  const forgetWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!desktopLibrary) {
        setWorkspaceError("工作区目录管理仅在桌面应用中可用");
        return false;
      }
      setWorkspaceBusy(true);
      setWorkspaceError("");
      try {
        setWorkspaceCatalog(await removeWorkspace(workspaceId));
        return true;
      } catch (error) {
        setWorkspaceError(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setWorkspaceBusy(false);
      }
    },
    [desktopLibrary]
  );

  const runWorkspaceDiagnostics = useCallback(async () => {
    if (!desktopLibrary || !workspaceCatalog) {
      setWorkspaceError("工作区诊断仅在桌面应用中可用");
      return null;
    }
    setWorkspaceBusy(true);
    setWorkspaceError("");
    try {
      const diagnostic = await diagnoseWorkspace();
      setWorkspaceCatalog((current) =>
        current ? { ...current, diagnostic } : current
      );
      return diagnostic;
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setWorkspaceBusy(false);
    }
  }, [desktopLibrary, workspaceCatalog]);

  useEffect(() => {
    if (!desktopLibrary) {
      window.localStorage.setItem(APP_DATA_STORAGE_KEY, JSON.stringify(durableLibraryMetadata));
      setBrowserLibraryMetadata(durableLibraryMetadata);
      return;
    }
    if (libraryPhase !== "ready") return;
    if (savedMetadata.current?.articles === data.articles &&
        savedMetadata.current.notebooks === data.notebooks) return;
    savedMetadata.current = durableLibraryMetadata;
    void replaceDesktopLibrary(durableLibraryMetadata)
      .then(() => setLibraryError(""))
      .catch((error) => {
        setLibraryError(
          `工作区资料库保存失败：${error instanceof Error ? error.message : String(error)}`
        );
      });
  }, [desktopLibrary, durableLibraryMetadata, libraryPhase]);

  useEffect(() => {
    const collectionId = data.currentNotebookId;
    if (!collectionId || libraryPhase !== "ready") {
      setTopologyGraph(null);
      return;
    }
    let active = true;
    void (async () => {
      await awaitDesktopLibraryWrites();
      const graph = await loadTopologyGraph(collectionId);
      if (active) {
        setTopologyGraph(graph);
        setTopologyError("");
      }
    })().catch((error) => {
      if (active) setTopologyError(error instanceof Error ? error.message : String(error));
    });
    return () => { active = false; };
  }, [data.currentNotebookId, durableLibraryMetadata, libraryPhase]);

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

  const createNotebook = useCallback(async (
    title: string,
    text = "",
    metadata: { description?: string; color?: string; icon?: string } = {}
  ) => {
    const rootId = randomEntityId("knowledge");
    const notebookId = randomEntityId("collection");
    const now = new Date().toISOString();
    const article: ArticleNode = {
      id: rootId,
      rootId,
      parentId: null,
      title: title.trim() || "未命名知识点",
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
      family: "笔记",
      creationMethod: "手动"
    };
    const notebook: Notebook = {
      id: notebookId,
      rootId,
      rootIds: [rootId],
      title: title.trim() || "未命名集合",
      summary: metadata.description?.trim() || article.summary,
      description: metadata.description?.trim() || article.summary,
      color: metadata.color?.trim() || "#315fdb",
      icon: metadata.icon?.trim() || "library",
      updatedAt: now,
      lastOpenedNodeId: rootId,
      accent: "cobalt"
    };
    await saveMarkdownDocument(rootId, text.replace(/\r\n?/g, "\n"), rootId);
    dispatch({ type: "create-notebook", notebook, article });
    return notebookId;
  }, []);

  const createKnowledgePoint = useCallback(
    async (collectionId: string, title: string, text = "") => {
      if (!data.notebooks.some((notebook) => notebook.id === collectionId)) return null;
      const articleId = randomEntityId("knowledge");
      const now = new Date().toISOString();
      const article: ArticleNode = {
        id: articleId,
        rootId: articleId,
        parentId: null,
        title: title.trim() || "未命名知识点",
        summary: text.trim()
          ? text.replace(/\s+/g, " ").slice(0, 90)
          : "独立于其他知识点的 Markdown 主文章入口。",
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
        family: "笔记",
        creationMethod: "手动"
      };
      await saveMarkdownDocument(articleId, text.replace(/\r\n?/g, "\n"), articleId);
      dispatch({
        type: "create-root-article",
        notebookId: collectionId,
        article
      });
      return articleId;
    },
    [data.notebooks]
  );

  const createRootArticle = useCallback(
    async (title: string, text = "") => {
      if (!data.currentNotebookId) return null;
      return createKnowledgePoint(data.currentNotebookId, title, text);
    },
    [createKnowledgePoint, data.currentNotebookId]
  );

  const ensureCollectionForArticle = useCallback(
    async (articleId: string): Promise<string | null> => {
      const article = data.articles[articleId];
      if (!article) return null;
      const existing = data.notebooks.find((notebook) =>
        notebook.rootIds.includes(
          articleId
        )
      );
      if (existing) return existing.id;
      const notebookId = randomEntityId("collection");
      const now = new Date().toISOString();
      const notebook: Notebook = {
        id: notebookId,
        rootId: articleId,
        rootIds: [articleId],
        title: article.title,
        summary: article.summary,
        description: "",
        color: "#315fdb",
        icon: "library",
        updatedAt: now,
        lastOpenedNodeId: articleId,
        accent: "cobalt"
      };
      dispatch({ type: "add-notebook", notebook });
      return notebookId;
    },
    [data.articles, data.notebooks]
  );

  const collectArticle = useCallback(
    async (notebookId: string, articleIds: string[]) => {
      const notebook = data.notebooks.find((item) => item.id === notebookId);
      if (!notebook) return;
      const existing = new Set(
        notebook.rootIds
      );
      const ids = articleIds.filter((id) => !existing.has(id));
      if (!ids.length) return;
      dispatch({ type: "add-to-collection", notebookId, articleIds: ids });
    },
    [data.notebooks]
  );

  const refreshTopologyGraph = useCallback(async (collectionId: string) => {
    const graph = await loadTopologyGraph(collectionId);
    setTopologyGraph(graph);
    setTopologyError("");
    return graph;
  }, []);

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
        interactionStateJson: {},
        appearanceJson: {
          typeId: draft.nodeType,
          icon: draft.icon,
          cardVariant: draft.cardVariant,
          color: draft.color
        },
        family:
          loadGenerationTypes().find((type) => type.id === draft.nodeType)?.family ??
          typeFamily(draft.nodeType),
        creationMethod: "手动"
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
          metadataJson: {}
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
      await upsertTopologyNode({ ...node, isManual: true });
      await refreshTopologyGraph(data.currentNotebookId);
    },
    [data.currentNotebookId, refreshTopologyGraph]
  );

  const updateNodeConfig = useCallback(
    async (nodeId: string, config: NodeLevelConfig | null) => {
      if (!data.currentNotebookId) return;
      if (data.articles[nodeId]) {
        dispatch({ type: "update-article", articleId: nodeId, patch: { configJson: config ? { ...config } : null } });
        return;
      }
      const node = topologyGraph?.nodes.find((item) => item.id === nodeId);
      if (!node || node.contentMode !== "database") return;
      await upsertTopologyNode({ ...node, configJson: config ? { ...config } : null });
      await refreshTopologyGraph(data.currentNotebookId);
    },
    [data.currentNotebookId, data.articles, topologyGraph, refreshTopologyGraph]
  );

  const updateTopologyCard = useCallback<AppStoreValue["updateTopologyCard"]>(
    async (nodeId, patch) => {
      if (data.articles[nodeId]) {
        const { title, summary, contentJson } = patch;
        dispatch({ type: "update-article", articleId: nodeId, patch: {
          ...(title === undefined ? {} : { title }),
          ...(summary === undefined ? {} : { summary }),
          ...(contentJson === undefined ? {} : { contentJson })
        } });
        return;
      }
      const node = topologyGraph?.nodes.find((item) => item.id === nodeId);
      if (!node) throw new Error("节点已不存在");
      await upsertTopologyNode({ ...node, ...patch });
      await refreshTopologyGraph(node.collectionId);
    },
    [data.articles, topologyGraph, refreshTopologyGraph]
  );

  const regenerateNode = useCallback(
    async (nodeId: string): Promise<{ ok: boolean; message: string }> => {
      if (!data.currentNotebookId) {
        return { ok: false, message: "未打开任何集合。" };
      }
      const node = topologyGraph?.nodes.find((item) => item.id === nodeId);
      if (!node || node.contentMode !== "database") {
        return { ok: false, message: "该节点不是数据库节点，无法重新生成。" };
      }
      const anchor = node.anchorJson as Record<string, unknown> | null;
      const parentId = anchor?.["文档标识"];
      const blockId = anchor?.["块标识"];
      const text = anchor?.["原文"];
      const start = anchor?.["起始位置"];
      const end = anchor?.["结束位置"];
      if (
        typeof parentId !== "string" ||
        typeof blockId !== "string" ||
        typeof text !== "string"
      ) {
        return { ok: false, message: "该节点没有来源选区，无法重新生成。" };
      }
      const parent = data.articles[parentId];
      if (!parent) {
        return { ok: false, message: "该节点的来源文章已不存在。" };
      }
      const generationTypes = loadGenerationTypes();
      const generationType =
        generationTypes.find(
          (item) => item.id === node.nodeType && item.executionMode === "ai"
        ) ?? generationTypes.find((item) => item.id === node.nodeType);
      if (!generationType) {
        return { ok: false, message: "该节点的拓扑节点类型已不存在。" };
      }
      const effectiveType = mergeNodeLevelConfig(
        normalizeNodeLevelConfig(node.configJson),
        generationType
      );
      const resolvedModel = resolveConfiguredModel(effectiveType.modelBindingId);
      if (!resolvedModel) {
        return {
          ok: false,
          message:
            "没有可用模型。请先在“AI 模型服务”填写 API Key、通过联通检测，再为该节点配置模型。"
        };
      }
      const selection: SelectionState = {
        text,
        blockId,
        start: typeof start === "number" ? start : 0,
        end: typeof end === "number" ? end : 0,
        documentStart: typeof start === "number" ? start : undefined,
        documentEnd: typeof end === "number" ? end : undefined
      };
      const generated = await generateNodeContent(
        data.articles, parent, selection, effectiveType, resolvedModel
      );
      await upsertTopologyNode({
        id: node.id,
        collectionId: node.collectionId,
        nodeType: node.nodeType,
        title: generated.title || node.title,
        summary: generated.summary,
        contentMode: "database",
        content: generated.markdown,
        documentId: null,
        isRoot: node.isRoot,
        isManual: node.isManual,
        enabled: node.enabled,
        interactive: node.interactive,
        interactionStateJson: node.interactionStateJson,
        appearanceJson: node.appearanceJson,
        family: node.family ?? typeFamily(node.nodeType),
        creationMethod: node.creationMethod ?? "手动",
        contentJson: {
          "文本": generated.markdown,
          "引文": selection.text
        },
        anchorJson: node.anchorJson,
        generationJson: {
          "模型": resolvedModel.model,
          "Temperature": effectiveType.modelParameters.temperature,
          "Top P": effectiveType.modelParameters.topP,
          "最大 Tokens": effectiveType.modelParameters.maxTokens
        },
        configJson: node.configJson
      });
      await refreshTopologyGraph(data.currentNotebookId);
      return {
        ok: true,
        message: `已使用 ${resolvedModel.provider.name} · ${resolvedModel.model} 重新生成“${generated.title}”。`
      };
    },
    [data.currentNotebookId, data.articles, topologyGraph, refreshTopologyGraph]
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
        metadataJson: {}
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
        configJson: {},
        stateJson: state,
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
            topology?: unknown;
          };
          if (
            parsed.format !== "annota-v2" ||
            !Array.isArray(parsed.notebooks) ||
            !parsed.articles ||
            !parsed.documents
          ) {
            return { ok: false, message: "仅支持包含 Markdown 文档的 annota-v2 关系包。" };
          }
          const metadata = decodeLibraryMetadata(parsed);
          const graph = parsed.topology ? decodeTopologyGraph(parsed.topology) : null;
          const documents = parsed.documents;
          const articles = Object.values(metadata.articles);
          if (articles.some((article) => typeof documents[article.id] !== "string")) {
            throw new Error("关系包缺少文章对应的 Markdown 文档");
          }
          await Promise.all(articles.map((article) =>
            saveMarkdownDocument(article.id, documents[article.id], article.rootId)
          ));
          if (desktopLibrary) {
            await replaceDesktopLibrary(metadata);
            savedMetadata.current = metadata;
          } else {
            setBrowserLibraryMetadata(metadata);
            window.localStorage.setItem(APP_DATA_STORAGE_KEY, JSON.stringify(metadata));
          }
          if (graph) {
            for (const node of graph.nodes.filter((node) => node.contentMode === "database")) {
              await upsertTopologyNode(node);
            }
            for (const relation of graph.relations.filter((relation) => relation.relationType !== "contains")) {
              await upsertTopologyRelation(relation);
            }
            for (const interaction of graph.interactions) await upsertTopologyInteraction(interaction);
          }
          dispatch({
            type: "replace-data",
            data: libraryAppData(metadata)
          });
          return { ok: true, message: `已导入 ${parsed.notebooks.length} 个集合。` };
        } catch (error) {
          return { ok: false, message: `无法导入关系包：${error instanceof Error ? error.message : String(error)}` };
        }
      }
      await createNotebook(safeTitle(fileName), text);
      return { ok: true, message: "内容已作为知识点导入并打开。" };
    },
    [createNotebook, desktopLibrary]
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
    notebook.rootIds.forEach(collect);
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

      const jobId = randomEntityId("generation");
      const job: GenerationJob = {
        id: jobId,
        parentId,
        blockId: selection.blockId,
        quote: selection.text,
        start: selection.start,
        end: selection.end,
        documentStart: selection.documentStart,
        documentEnd: selection.documentEnd,
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
          const generated = await generateNodeContent(
            data.articles, parent, selection, generationType, resolvedModel
          );
          if (generationType.family !== "笔记") {
            const collection = data.notebooks.find((notebook) =>
              notebook.rootIds
                .includes(parent.rootId)
            );
            if (!collection) {
              throw new Error("当前知识点不属于任何集合，无法保存数据库节点");
            }
            const nodeId = randomEntityId("node");
            const anchorJson = {
              "文档标识": parent.id,
              "块标识": selection.blockId,
              "原文": selection.text,
              "起始位置": selection.documentStart,
              "结束位置": selection.documentEnd
            };
            await upsertTopologyNode({
              id: nodeId,
              collectionId: collection.id,
              nodeType: generationType.id,
              title: generated.title,
              summary: generated.summary,
              contentMode: "database",
              content: generated.markdown,
              documentId: null,
              isRoot: false,
              isManual: false,
              enabled: true,
              interactive:
                generationType.family === "交互" || generationType.interactive,
              interactionStateJson: {},
              appearanceJson: {
                typeId: generationType.id,
                icon: generationType.icon,
                cardVariant: generationType.cardVariant,
                color: generationType.color
              },
              family: generationType.family,
              creationMethod: "AI",
              contentJson: {
                "文本": generated.markdown,
                "引文": selection.text
              },
              anchorJson,
              generationJson: {
                "模型": resolvedModel.model,
                "Temperature": generationType.modelParameters.temperature,
                "Top P": generationType.modelParameters.topP,
                "最大 Tokens": generationType.modelParameters.maxTokens
              }
            });
            await upsertTopologyRelation({
              id: randomEntityId("relation"),
              collectionId: collection.id,
              sourceNodeId: parent.id,
              targetNodeId: nodeId,
              relationType: "generated-from-selection",
              label: generationType.relationLabel || generationType.name,
              directed: true,
              metadataJson: anchorJson
            });
            await refreshTopologyGraph(collection.id);
            dispatch({ type: "cancel-job", jobId });
            return;
          }
          const articleId = randomEntityId("article");
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
              generationType: generationType.id,
              start: selection.start,
              end: selection.end,
              documentStart: selection.documentStart,
              documentEnd: selection.documentEnd
            },
            family: generationType.family,
            creationMethod: "AI",
            anchorJson: {
              "文档标识": parent.id,
              "选区字数":
                typeof selection.start === "number" &&
                typeof selection.end === "number"
                  ? selection.end - selection.start
                  : undefined
            },
            generationJson: {
              "模型": resolvedModel.model
            }
          };
          await saveMarkdownDocument(articleId, generated.markdown, parent.rootId);
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
    [data.articles, data.notebooks, refreshTopologyGraph]
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
      workspaceCatalog,
      workspaceBusy,
      workspaceError,
      createWorkspaceAt,
      addWorkspaceFrom,
      activateWorkspace,
      forgetWorkspace,
      runWorkspaceDiagnostics,
      openNotebook,
      navigateTo,
      goHome,
      touchArticle,
      createNotebook,
      createKnowledgePoint,
      createRootArticle,
      ensureCollectionForArticle,
      collectArticle,
      topologyGraph,
      topologyError,
      createManualTopologyNode,
      updateManualTopologyNode,
      updateNodeConfig,
      updateTopologyCard,
      regenerateNode,
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
      workspaceCatalog,
      workspaceBusy,
      workspaceError,
      createWorkspaceAt,
      addWorkspaceFrom,
      activateWorkspace,
      forgetWorkspace,
      runWorkspaceDiagnostics,
      openNotebook,
      navigateTo,
      goHome,
      touchArticle,
      createNotebook,
      createKnowledgePoint,
      createRootArticle,
      ensureCollectionForArticle,
      collectArticle,
      topologyGraph,
      topologyError,
      createManualTopologyNode,
      updateManualTopologyNode,
      updateNodeConfig,
      updateTopologyCard,
      regenerateNode,
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

  if (libraryPhase === "loading") {
    return <div role="status">正在打开工作区资料库…</div>;
  }
  if (libraryPhase === "error") {
    return <div role="alert">{libraryError}</div>;
  }
  return (
    <AppStoreContext.Provider value={value}>
      {libraryError ? <div role="alert">{libraryError}</div> : null}
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore() {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error("useAppStore must be used inside AppStoreProvider");
  return value;
}
