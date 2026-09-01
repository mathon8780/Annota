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
  clearMarkdownWorkspaceSession,
  loadMarkdownDocument,
  saveMarkdownDocument
} from "../editor/markdownRepository";
import {
  createGenerationTypeIndex,
  hydrateGenerationTypesFromDatabase,
  isGenerationTypeIconId,
  isTopologyCardVariant,
  loadGenerationTypes,
  mergeNodeLevelConfig,
  normalizeNodeLevelConfig,
  rootDefaults,
  renderPromptTemplate,
  typeFamily,
  type NodeLevelConfig
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
  loadTopologyGraph,
  syncMarkdownTopology,
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
const SQLITE_IMPORT_STORAGE_KEY = "annota.desktop.library.sqlite-v1.imported";

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
        source: record.source,
        // 契约字段必须透传,否则 replaceDesktopLibrary 回写时丢失
        family:
          record.family === "笔记" || record.family === "记录" || record.family === "交互"
            ? record.family
            : "笔记",
        creationMethod:
          record.creationMethod === "导入" ||
          record.creationMethod === "AI" ||
          record.creationMethod === "手动"
            ? record.creationMethod
            : "手动",
        contentJson: record.contentJson,
        anchorJson: record.anchorJson,
        generationJson: record.generationJson
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
      knowledgePointIds: Array.isArray(record.knowledgePointIds)
        ? Array.from(
            new Set([
              record.rootId,
              ...record.knowledgePointIds.filter(
                (rootId): rootId is string => typeof rootId === "string"
              )
            ])
          )
        : Array.isArray(record.rootIds)
          ? Array.from(new Set([record.rootId, ...record.rootIds]))
          : [record.rootId],
      title: record.title,
      summary: typeof record.summary === "string" ? record.summary : "",
      description:
        typeof record.description === "string"
          ? record.description
          : typeof record.summary === "string"
            ? record.summary
            : "",
      color: typeof record.color === "string" ? record.color : "#315fdb",
      icon: typeof record.icon === "string" ? record.icon : "library",
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

function normalizedLibraryData(value: LibraryMetadata): AppData {
  return {
    notebooks: metadataOnlyNotebooks(value.notebooks),
    articles: metadataOnlyArticles(value.articles),
    jobs: [],
    currentNotebookId: null,
    currentArticleId: null
  };
}

function loadDesktopLegacyMetadata(): LibraryMetadata | null {
  try {
    const current = window.localStorage.getItem(APP_DATA_STORAGE_KEY);
    if (!current) return null;
    const parsed = parseStoredData(current);
    if (!parsed) return null;
    return { notebooks: parsed.notebooks, articles: parsed.articles };
  } catch {
    return null;
  }
}

function loadInitialData(): AppData {
  if (typeof window === "undefined") return createEmptyAppData();
  if (isDesktopLibrary()) return createEmptyAppData();
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
          (notebook.knowledgePointIds ?? notebook.rootIds ?? [notebook.rootId]).includes(
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
                  new Set([...(item.rootIds ?? [item.rootId]), ...action.articleIds])
                ),
                knowledgePointIds: Array.from(
                  new Set([
                    ...(item.knowledgePointIds ?? item.rootIds ?? [item.rootId]),
                    ...action.articleIds
                  ])
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
                  new Set([...(item.rootIds ?? [item.rootId]), action.article.id])
                ),
                knowledgePointIds: Array.from(
                  new Set([
                    ...(item.knowledgePointIds ?? item.rootIds ?? [item.rootId]),
                    action.article.id
                  ])
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

  const durableLibraryMetadata = useMemo<LibraryMetadata>(
    () => ({ notebooks: data.notebooks, articles: data.articles }),
    [data.articles, data.notebooks]
  );
  const durableAppDataJson = useMemo(
    () =>
      JSON.stringify({
        ...durableLibraryMetadata,
        jobs: [],
        currentNotebookId: null,
        currentArticleId: null
      }),
    [durableLibraryMetadata]
  );

  useEffect(() => {
    if (!desktopLibrary) return;
    let cancelled = false;
    void (async () => {
      const catalog = await listWorkspaces();
      const active = catalog.workspaces.find((workspace) => workspace.active);
      const canImportLegacy =
        active?.kind === "managed" &&
        window.localStorage.getItem(SQLITE_IMPORT_STORAGE_KEY) !== "done";
      const result = await loadDesktopLibrary(
        canImportLegacy ? loadDesktopLegacyMetadata() : null
      );
      await hydrateGenerationTypesFromDatabase();
      return { catalog, result };
    })()
      .then(({ catalog, result }) => {
        if (cancelled) return;
        setWorkspaceCatalog(catalog);
        dispatch({
          type: "replace-data",
          data: normalizedLibraryData(result.metadata)
        });
        if (result.importedLegacy) {
          window.localStorage.setItem(SQLITE_IMPORT_STORAGE_KEY, "done");
        }
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
        await awaitDesktopLibraryWrites();
        const catalog = await operation();
        clearMarkdownWorkspaceSession();
        const result = await loadDesktopLibrary(null);
        await hydrateGenerationTypesFromDatabase();
        dispatch({
          type: "replace-data",
          data: normalizedLibraryData(result.metadata)
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
      window.localStorage.setItem(APP_DATA_STORAGE_KEY, durableAppDataJson);
      return;
    }
    if (libraryPhase !== "ready") return;
    void replaceDesktopLibrary(durableLibraryMetadata)
      .then(() => setLibraryError(""))
      .catch((error) => {
        setLibraryError(
          `工作区资料库保存失败：${error instanceof Error ? error.message : String(error)}`
        );
      });
  }, [desktopLibrary, durableAppDataJson, durableLibraryMetadata, libraryPhase]);

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
      knowledgePointIds: [rootId],
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
        (notebook.knowledgePointIds ?? notebook.rootIds ?? [notebook.rootId]).includes(
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
        knowledgePointIds: [articleId],
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
        notebook.knowledgePointIds ?? notebook.rootIds ?? [notebook.rootId]
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

  const markdownTopologySync = useMemo(() => {
    const notebook = data.notebooks.find(
      (item) => item.id === data.currentNotebookId
    );
    if (!notebook) return null;
    const rootIds = new Set(notebook.rootIds ?? [notebook.rootId]);
    const articles = Object.values(data.articles).filter(
      (article) => rootIds.has(article.rootId) || rootIds.has(article.id)
    );
    const nodeTypeIndex = createGenerationTypeIndex(loadGenerationTypes());
    const request = {
      collection: {
        id: notebook.id,
        title: notebook.title,
        description: notebook.description || notebook.summary
      },
      nodes: articles.map((article) => ({
        id: article.id,
        collectionId: notebook.id,
        nodeType:
          article.appearance?.typeId ??
          nodeTypeIndex.byRelationLabel.get(article.type)?.id ??
          nodeTypeIndex.byName.get(article.type)?.id ??
          (article.parentId ? "explain" : "root"),
        title: article.title,
        summary: article.summary,
        contentMode: "markdown" as const,
        content: null,
        documentId: article.id,
        isRoot: article.parentId === null,
        isManual: false,
        enabled: true,
        interactive: false,
        interactionStateJson: "{}",
        appearanceJson: JSON.stringify(article.appearance ?? {}),
        family: article.family ?? "笔记",
        creationMethod: article.creationMethod ?? "手动",
        contentJson: article.contentJson,
        anchorJson: article.anchorJson,
        generationJson: article.generationJson
      })),
      relations: articles.flatMap((article) =>
        article.childIds.map((childId) => ({
          id: `tree:${article.id}:${childId}`,
          collectionId: notebook.id,
          sourceNodeId: article.id,
          targetNodeId: childId,
          relationType: "contains",
          label: data.articles[childId]?.type ?? "下一级",
          directed: true,
          metadataJson: '{"source":"markdown-tree"}'
        }))
      )
    };
    return { request, signature: JSON.stringify(request) };
  }, [data.articles, data.currentNotebookId, data.notebooks]);

  useEffect(() => {
    if (!markdownTopologySync) {
      setTopologyGraph(null);
      setTopologyError("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const graph = await syncMarkdownTopology(markdownTopologySync.request);
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
  }, [markdownTopologySync?.signature]);

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
        }),
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
        appearanceJson: node.appearanceJson,
        family: node.family ?? typeFamily(node.nodeType),
        creationMethod: node.creationMethod ?? "手动",
        contentJson: node.contentJson,
        anchorJson: node.anchorJson,
        generationJson: node.generationJson,
        configJson: node.configJson
      });
      await refreshTopologyGraph(data.currentNotebookId);
    },
    [data.currentNotebookId, refreshTopologyGraph]
  );

  const updateNodeConfig = useCallback(
    async (nodeId: string, config: NodeLevelConfig | null) => {
      if (!data.currentNotebookId) return;
      const node = topologyGraph?.nodes.find((item) => item.id === nodeId);
      if (!node || node.contentMode !== "database") return;
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
        isManual: node.isManual,
        enabled: node.enabled,
        interactive: node.interactive,
        interactionStateJson: node.interactionStateJson,
        appearanceJson: node.appearanceJson,
        family: node.family ?? typeFamily(node.nodeType),
        creationMethod: node.creationMethod ?? "手动",
        contentJson: node.contentJson,
        anchorJson: node.anchorJson,
        generationJson: node.generationJson,
        configJson: config === null ? undefined : JSON.stringify(config)
      });
      await refreshTopologyGraph(data.currentNotebookId);
    },
    [data.currentNotebookId, topologyGraph, refreshTopologyGraph]
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
      let anchor: Record<string, unknown> | null = null;
      if (node.anchorJson) {
        const parsed =
          typeof node.anchorJson === "string"
            ? JSON.parse(node.anchorJson)
            : node.anchorJson;
        if (parsed && typeof parsed === "object") {
          anchor = parsed as Record<string, unknown>;
        }
      }
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
        effectiveType.contextScope
      );
      const systemPrompt =
        renderPromptTemplate(effectiveType.systemPrompt, context.values) +
        GENERATION_OUTPUT_INSTRUCTION;
      const userPrompt = `${renderPromptTemplate(
        effectiveType.userPrompt,
        context.values
      )}\n\n<context_scope>${context.suppliedContext}</context_scope>`;
      const response = await generateModelText({
        baseUrl: resolvedModel.provider.baseUrl,
        endpointPath: resolvedModel.provider.endpointPath,
        apiKey: resolvedModel.provider.apiKey,
        protocol: resolvedModel.provider.protocol,
        model: resolvedModel.model,
        systemPrompt,
        userPrompt,
        temperature: effectiveType.modelParameters.temperature,
        topP: effectiveType.modelParameters.topP,
        maxTokens: effectiveType.modelParameters.maxTokens
      });
      const generated = parseGeneratedArticle(
        response,
        `${effectiveType.name}：${selection.text.slice(0, 28)}`
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
            Object.entries(parsed.documents).map(([id, markdown]) => {
              const rootId = parsed.articles?.[id]?.rootId ?? id;
              return typeof markdown === "string"
                ? saveMarkdownDocument(id, markdown, rootId)
                : Promise.reject(new Error("关系包包含无效 Markdown 文档"));
            })
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
          return { ok: true, message: `已导入 ${parsed.notebooks.length} 个集合。` };
        } catch {
          return { ok: false, message: "无法解析关系包；请确认文件未损坏。" };
        }
      }
      await createNotebook(safeTitle(fileName), text);
      return { ok: true, message: "内容已作为知识点导入并打开。" };
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
            userPrompt,
            temperature: generationType.modelParameters.temperature,
            topP: generationType.modelParameters.topP,
            maxTokens: generationType.modelParameters.maxTokens
          });
          const generated = parseGeneratedArticle(
            response,
            `${generationType.name}：${selection.text.slice(0, 28)}`
          );
          if (generationType.family !== "笔记") {
            const collection = data.notebooks.find((notebook) =>
              (notebook.knowledgePointIds ?? notebook.rootIds ?? [notebook.rootId])
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
              interactionStateJson: JSON.stringify({
                content: generated.markdown
              }),
              appearanceJson: JSON.stringify({
                typeId: generationType.id,
                icon: generationType.icon,
                cardVariant: generationType.cardVariant,
                color: generationType.color
              }),
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
              metadataJson: JSON.stringify(anchorJson)
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
