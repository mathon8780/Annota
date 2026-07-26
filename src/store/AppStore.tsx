import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type PropsWithChildren
} from "react";
import { seedData } from "../data/seed";
import type {
  AppData,
  ArticleNode,
  ContentBlock,
  GenerationJob,
  GenerationType,
  Notebook
} from "../types";

const STORAGE_KEY = "annota.desktop.demo.v1";

type Action =
  | { type: "open-notebook"; notebookId: string; articleId?: string }
  | { type: "navigate"; articleId: string }
  | { type: "go-home" }
  | { type: "update-article"; articleId: string; blocks: ContentBlock[] }
  | { type: "create-notebook"; notebook: Notebook; article: ArticleNode }
  | { type: "replace-data"; data: AppData }
  | { type: "start-job"; job: GenerationJob }
  | { type: "job-status"; jobId: string; status: GenerationJob["status"] }
  | { type: "complete-job"; jobId: string; article: ArticleNode }
  | { type: "cancel-job"; jobId: string };

function cloneSeed(): AppData {
  return JSON.parse(JSON.stringify(seedData)) as AppData;
}

function loadInitialData(): AppData {
  if (typeof window === "undefined") return cloneSeed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneSeed();
    const parsed = JSON.parse(raw) as AppData;
    if (!Array.isArray(parsed.notebooks) || !parsed.articles) return cloneSeed();
    return {
      ...parsed,
      jobs: [],
      currentNotebookId: null,
      currentArticleId: null
    };
  } catch {
    return cloneSeed();
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
    case "replace-data":
      return action.data;
    case "start-job":
      return { ...state, jobs: [...state.jobs, action.job] };
    case "job-status":
      return {
        ...state,
        jobs: state.jobs.map((job) =>
          job.id === action.jobId ? { ...job, status: action.status } : job
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
  importPackage: (text: string, fileName: string) => { ok: boolean; message: string };
  exportCurrentTree: () => void;
  startGeneration: (
    parentId: string,
    blockId: string,
    quote: string,
    type: GenerationType
  ) => string;
  cancelGeneration: (jobId: string) => void;
  resetDemo: () => void;
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

function generatedCopy(type: GenerationType, quote: string): {
  title: string;
  summary: string;
  blocks: ContentBlock[];
} {
  const short = quote.length > 22 ? `${quote.slice(0, 22)}…` : quote;
  if (type === "translate") {
    return {
      title: `“${short}”的双语对照`,
      summary: "本地演示生成的双语学习节点；接入模型后会替换为真实翻译结果。",
      blocks: [
        { id: "generated-b1", kind: "quote", text: quote },
        {
          id: "generated-b2",
          kind: "paragraph",
          text: "Translation preview: This node preserves the selected source and its reading path. Configure an OpenAI Compatible service to generate the complete bilingual result."
        }
      ]
    };
  }
  return {
    title: `理解“${short}”`,
    summary: "从定义、因果关系与应用边界三个角度拆解选中内容。",
    blocks: [
      { id: "generated-b1", kind: "quote", text: quote },
      {
        id: "generated-b2",
        kind: "paragraph",
        text: "这是本地任务流的演示结果：系统会保留选区、父文档与生成类型，并将完整结果作为新的可编辑子文章写入知识树。"
      },
      {
        id: "generated-b3",
        kind: "paragraph",
        text: "接入 OpenAI Compatible 服务后，这里将使用选区附近上下文与父级摘要生成真实解释；当前版本不会伪装为已经完成远端调用。"
      }
    ]
  };
}

export function AppStoreProvider({ children }: PropsWithChildren) {
  const [data, dispatch] = useReducer(reducer, undefined, loadInitialData);
  const generationTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    const persistable = { ...data, jobs: [] };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  }, [data]);

  useEffect(
    () => () => {
      Object.values(generationTimers.current).forEach((timer) => window.clearTimeout(timer));
    },
    []
  );

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
      format: "annota-demo-v1",
      exportedAt: new Date().toISOString(),
      notebooks: [notebook],
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
    (parentId: string, blockId: string, quote: string, type: GenerationType) => {
      const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const job: GenerationJob = {
        id,
        parentId,
        blockId,
        quote,
        type,
        status: "queued",
        createdAt: new Date().toISOString()
      };
      dispatch({ type: "start-job", job });
      generationTimers.current[id] = window.setTimeout(() => {
        dispatch({ type: "job-status", jobId: id, status: "generating" });
        generationTimers.current[id] = window.setTimeout(() => {
          const parent = data.articles[parentId];
          if (!parent) return;
          const copy = generatedCopy(type, quote);
          const articleId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
          const now = new Date().toISOString();
          const article: ArticleNode = {
            id: articleId,
            rootId: parent.rootId,
            parentId,
            title: copy.title,
            summary: copy.summary,
            type: type === "translate" ? "翻译" : "解释",
            tags: [type === "translate" ? "翻译" : "解释", "AI 生成"],
            blocks: copy.blocks.map((block, index) => ({
              ...block,
              id: `${articleId}-b${index + 1}`
            })),
            childIds: [],
            createdAt: now,
            updatedAt: now,
            source: { parentId, blockId, quote, generationType: type }
          };
          dispatch({ type: "complete-job", jobId: id, article });
          delete generationTimers.current[id];
        }, 900);
      }, 350);
      return id;
    },
    [data.articles]
  );

  const cancelGeneration = useCallback((jobId: string) => {
    window.clearTimeout(generationTimers.current[jobId]);
    delete generationTimers.current[jobId];
    dispatch({ type: "cancel-job", jobId });
  }, []);

  const resetDemo = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    dispatch({ type: "replace-data", data: cloneSeed() });
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
      importPackage,
      exportCurrentTree,
      startGeneration,
      cancelGeneration,
      resetDemo
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
      importPackage,
      exportCurrentTree,
      startGeneration,
      cancelGeneration,
      resetDemo
    ]
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error("useAppStore must be used inside AppStoreProvider");
  return value;
}
