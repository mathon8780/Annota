import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type PropsWithChildren
} from "react";
import { createEmptyAppData } from "../data/empty";
import type {
  AppData,
  ArticleNode,
  ContentBlock,
  FolderProfile,
  GenerationJob,
  GenerationType,
  Notebook,
  SelectionState
} from "../types";
import {
  loadGenerationTypes,
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

export const APP_DATA_STORAGE_KEY = "annota.desktop.library.v1";
const LEGACY_STORAGE_KEY = "annota.desktop.demo.v1";
const UNFILED_FOLDER_KEY = "未归档";
const LEGACY_DEMO_ROOT_IDS = new Set([
  "ecs-root",
  "cpp-polymorphism-root",
  "cpp-vtable-root",
  "cpp-virtual-destructor-root",
  "cpp-template-root",
  "attention-root",
  "llm-root",
  "graph-root"
]);
const LEGACY_DEMO_FOLDER_KEYS = new Set([
  "技术学习",
  "C++ / 核心",
  "C++ / 对象模型",
  "C++ / 生命周期",
  "C++ / 模板",
  "阅读方法",
  "概念解析",
  "数据库"
]);

type Action =
  | { type: "open-notebook"; notebookId: string; articleId?: string }
  | { type: "navigate"; articleId: string }
  | { type: "go-home" }
  | { type: "update-article"; articleId: string; blocks: ContentBlock[] }
  | { type: "create-notebook"; notebook: Notebook; article: ArticleNode }
  | { type: "update-folder-profiles"; profiles: FolderProfile[] }
  | { type: "delete-folder-profiles"; keys: string[] }
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

function parseStoredData(raw: string): AppData | null {
  const parsed = JSON.parse(raw) as Partial<AppData>;
  if (!Array.isArray(parsed.notebooks) || !parsed.articles) return null;
  return {
    notebooks: parsed.notebooks,
    folderProfiles: Array.isArray(parsed.folderProfiles)
      ? parsed.folderProfiles
      : [],
    deletedFolderKeys: Array.isArray(parsed.deletedFolderKeys)
      ? parsed.deletedFolderKeys
      : [],
    articles: parsed.articles,
    jobs: [],
    currentNotebookId: null,
    currentArticleId: null
  };
}

function removeLegacyDemoData(data: AppData): AppData {
  const notebooks = data.notebooks.filter(
    (notebook) => !LEGACY_DEMO_ROOT_IDS.has(notebook.rootId)
  );
  const retainedRootIds = new Set(notebooks.map((notebook) => notebook.rootId));
  const retainedCategories = new Set(
    notebooks.map((notebook) => notebook.category)
  );
  const articles = Object.fromEntries(
    Object.entries(data.articles)
      .filter(
        ([, article]) =>
          retainedRootIds.has(article.rootId) &&
          !LEGACY_DEMO_ROOT_IDS.has(article.rootId)
      )
      .map(([id, article]) => [
        id,
        {
          ...article,
          childIds: article.childIds.filter(
            (childId) =>
              data.articles[childId] &&
              !LEGACY_DEMO_ROOT_IDS.has(data.articles[childId].rootId)
          )
        }
      ])
  );
  return {
    ...data,
    notebooks,
    folderProfiles: data.folderProfiles.filter(
      (profile) =>
        !LEGACY_DEMO_FOLDER_KEYS.has(profile.key) ||
        retainedCategories.has(profile.key)
    ),
    articles,
    jobs: [],
    currentNotebookId: null,
    currentArticleId: null
  };
}

function loadInitialData(): AppData {
  if (typeof window === "undefined") return createEmptyAppData();
  try {
    const current = window.localStorage.getItem(APP_DATA_STORAGE_KEY);
    if (current) return parseStoredData(current) ?? createEmptyAppData();
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return createEmptyAppData();
    const parsedLegacy = parseStoredData(legacy);
    return parsedLegacy
      ? removeLegacyDemoData(parsedLegacy)
      : createEmptyAppData();
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
      const nextArticle = { ...article, blocks: action.blocks, updatedAt: new Date().toISOString() };
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
    case "update-folder-profiles": {
      const updates = new Map(
        action.profiles.map((profile) => [profile.key, profile])
      );
      const existingKeys = new Set(
        state.folderProfiles.map((profile) => profile.key)
      );
      const additions = action.profiles.filter(
        (profile) => !existingKeys.has(profile.key)
      );
      const updatedKeys = new Set(
        action.profiles.map((profile) => profile.key)
      );
      return {
        ...state,
        folderProfiles: [
          ...additions,
          ...state.folderProfiles.map(
            (profile) => updates.get(profile.key) ?? profile
          )
        ],
        deletedFolderKeys: state.deletedFolderKeys.filter(
          (key) => !updatedKeys.has(key)
        )
      };
    }
    case "delete-folder-profiles": {
      const keys = new Set(
        action.keys.filter((key) => key !== UNFILED_FOLDER_KEY)
      );
      if (!keys.size) return state;
      return {
        ...state,
        folderProfiles: state.folderProfiles.filter(
          (profile) => !keys.has(profile.key)
        ),
        deletedFolderKeys: [
          ...new Set([...state.deletedFolderKeys, ...keys])
        ],
        notebooks: state.notebooks.map((notebook) =>
          keys.has(notebook.category)
            ? { ...notebook, category: UNFILED_FOLDER_KEY }
            : notebook
        )
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
  updateBlocks: (articleId: string, blocks: ContentBlock[]) => void;
  createNotebook: (title: string, text?: string) => string;
  updateFolderProfile: (profile: FolderProfile) => void;
  updateFolderProfiles: (profiles: FolderProfile[]) => void;
  deleteFolderProfiles: (keys: string[]) => void;
  importPackage: (text: string, fileName: string) => { ok: boolean; message: string };
  exportCurrentTree: () => void;
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

function textToBlocks(text: string, prefix: string): ContentBlock[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [{ id: `${prefix}-b1`, kind: "paragraph", text: "" }];
  return normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const heading = /^(#{1,3})\s+/.exec(part);
      return {
        id: `${prefix}-b${index + 1}`,
        kind: heading ? (`h${heading[1].length}` as ContentBlock["kind"]) : "paragraph",
        text: heading ? part.replace(/^#{1,3}\s+/, "") : part
      };
    });
}

export function AppStoreProvider({ children }: PropsWithChildren) {
  const [data, dispatch] = useReducer(reducer, undefined, loadInitialData);

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

  const updateBlocks = useCallback((articleId: string, blocksToSave: ContentBlock[]) => {
    dispatch({ type: "update-article", articleId, blocks: blocksToSave });
  }, []);

  const createNotebook = useCallback((title: string, text = "") => {
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
      type: "主文章",
      tags: ["新笔记"],
      childIds: [],
      createdAt: now,
      updatedAt: now,
      blocks: textToBlocks(text, rootId)
    };
    const notebook: Notebook = {
      id: notebookId,
      rootId,
      title: article.title,
      summary: article.summary,
      tags: article.tags,
      category: "未分类",
      updatedAt: now,
      lastOpenedNodeId: rootId,
      accent: "cobalt"
    };
    dispatch({ type: "create-notebook", notebook, article });
    return notebookId;
  }, []);

  const updateFolderProfile = useCallback((profile: FolderProfile) => {
    dispatch({ type: "update-folder-profiles", profiles: [profile] });
  }, []);

  const updateFolderProfiles = useCallback((profiles: FolderProfile[]) => {
    dispatch({ type: "update-folder-profiles", profiles });
  }, []);

  const deleteFolderProfiles = useCallback((keys: string[]) => {
    dispatch({ type: "delete-folder-profiles", keys });
  }, []);

  const importPackage = useCallback(
    (text: string, fileName: string) => {
      if (/\.annota$|\.json$/i.test(fileName)) {
        try {
          const parsed = JSON.parse(text) as Partial<AppData> & { format?: string };
          if (!Array.isArray(parsed.notebooks) || !parsed.articles) {
            return { ok: false, message: "关系包缺少 notebooks 或 articles 数据。" };
          }
          dispatch({
            type: "replace-data",
            data: {
              notebooks: parsed.notebooks,
              folderProfiles: Array.isArray(parsed.folderProfiles)
                ? parsed.folderProfiles
                : [],
              deletedFolderKeys: Array.isArray(parsed.deletedFolderKeys)
                ? parsed.deletedFolderKeys
                : [],
              articles: parsed.articles,
              jobs: [],
              currentNotebookId: null,
              currentArticleId: null
            }
          });
          return { ok: true, message: `已导入 ${parsed.notebooks.length} 篇主笔记。` };
        } catch {
          return { ok: false, message: "无法解析关系包；请确认文件未损坏。" };
        }
      }
      createNotebook(safeTitle(fileName), text);
      return { ok: true, message: "主笔记已导入并打开。" };
    },
    [createNotebook]
  );

  const exportCurrentTree = useCallback(() => {
    const notebook = data.notebooks.find((item) => item.id === data.currentNotebookId);
    if (!notebook) return;
    const ids = new Set<string>();
    const collect = (id: string) => {
      if (ids.has(id)) return;
      ids.add(id);
      data.articles[id]?.childIds.forEach(collect);
    };
    collect(notebook.rootId);
    const articles = Object.fromEntries(
      Array.from(ids)
        .map((id) => [id, data.articles[id]])
        .filter((entry) => Boolean(entry[1]))
    );
    const payload = {
      format: "annota-v1",
      exportedAt: new Date().toISOString(),
      notebooks: [notebook],
      folderProfiles: data.folderProfiles.filter(
        (profile) => profile.key === notebook.category
      ),
      deletedFolderKeys: [],
      articles,
      jobs: [],
      currentNotebookId: null,
      currentArticleId: null
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${notebook.title.replace(/[\\/:*?"<>|]/g, "_")}.annota`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const startGeneration = useCallback(
    (
      parentId: string,
      selection: SelectionState,
      typeId: GenerationType
    ) => {
      const parent = data.articles[parentId];
      const generationType = loadGenerationTypes().find(
        (item) => item.id === typeId && item.enabled
      );
      if (!parent || !generationType) {
        return {
          ok: false,
          message: "该生成类型当前不可用，请检查“生成与提示词”设置。"
        };
      }
      const resolvedModel = resolveConfiguredModel(
        generationType.modelBindingId
      );
      if (!resolvedModel) {
        return {
          ok: false,
          message:
            "没有可用模型。请先在“AI 模型服务”填写 API Key、通过联通检测，再为该生成类型选择模型。"
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
          const context = assembleGenerationContext(
            data.articles,
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
            `${generationType.name}：${selection.text.slice(0, 28)}`,
            articleId
          );
          const now = new Date().toISOString();
          const article: ArticleNode = {
            id: articleId,
            rootId: parent.rootId,
            parentId: parent.id,
            title: generated.title,
            summary: generated.summary,
            type: generationType.relationLabel || generationType.name,
            tags: generated.tags,
            blocks: generated.blocks,
            childIds: [],
            createdAt: now,
            updatedAt: now,
            source: {
              parentId: parent.id,
              blockId: selection.blockId,
              quote: selection.text,
              generationType: generationType.id
            }
          };
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
      updateBlocks,
      createNotebook,
      updateFolderProfile,
      updateFolderProfiles,
      deleteFolderProfiles,
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
      updateBlocks,
      createNotebook,
      updateFolderProfile,
      updateFolderProfiles,
      deleteFolderProfiles,
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
