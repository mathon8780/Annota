import type { AppData, ArticleNode, Notebook } from "../types";
import type { LibraryMetadata } from "./libraryRepository";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function hasStrings(value: Record<string, unknown>, keys: string[]) {
  return keys.every((key) => typeof value[key] === "string");
}

/** 外部关系包与浏览器存储只在此验证；桌面仓储返回的数据直接使用。 */
export function decodeLibraryMetadata(value: unknown): LibraryMetadata {
  if (!record(value) || !record(value.articles) || !Array.isArray(value.notebooks)) {
    throw new Error("资料库缺少文章或集合数据");
  }
  const articles: Record<string, ArticleNode> = {};
  for (const [id, candidate] of Object.entries(value.articles)) {
    if (!record(candidate) || !validId(id) || candidate.id !== id ||
        !hasStrings(candidate, ["id", "rootId", "title", "summary", "type", "createdAt", "updatedAt"]) ||
        !(candidate.parentId === null || typeof candidate.parentId === "string") ||
        !strings(candidate.childIds)) {
      throw new Error(`文章 ${id} 的数据格式无效`);
    }
    for (const key of ["appearance", "source", "contentJson", "anchorJson", "generationJson", "configJson"]) {
      if (candidate[key] != null && !record(candidate[key])) throw new Error(`文章 ${id} 的 ${key} 格式无效`);
    }
    if (candidate.family != null && !["笔记", "记录", "交互"].includes(candidate.family as string)) {
      throw new Error(`文章 ${id} 的家族无效`);
    }
    if (candidate.creationMethod != null && !["导入", "AI", "手动"].includes(candidate.creationMethod as string)) {
      throw new Error(`文章 ${id} 的创建方式无效`);
    }
    articles[id] = {
      ...candidate,
      family: candidate.family ?? "笔记",
      creationMethod: candidate.creationMethod ?? "手动"
    } as unknown as ArticleNode;
  }
  const notebooks = value.notebooks.map((candidate) => {
    if (!record(candidate) || !validId(candidate.id) ||
        !hasStrings(candidate, ["id", "rootId", "title", "summary", "description", "color", "icon", "updatedAt", "lastOpenedNodeId"]) ||
        !strings(candidate.rootIds) || !candidate.rootIds.includes(candidate.rootId as string) ||
        !["cobalt", "amber", "green"].includes(candidate.accent as string)) {
      throw new Error("集合数据格式无效");
    }
    return candidate as unknown as Notebook;
  });
  for (const article of Object.values(articles)) {
    const root = articles[article.rootId];
    const parent = article.parentId === null ? null : articles[article.parentId];
    if (!root || root.parentId !== null || root.rootId !== root.id ||
        (article.parentId === null ? article.rootId !== article.id :
          !parent || parent.rootId !== article.rootId || !parent.childIds.includes(article.id)) ||
        new Set(article.childIds).size !== article.childIds.length ||
        article.childIds.some((id) => id === article.id || articles[id]?.parentId !== article.id)) {
      throw new Error(`文章 ${article.id} 的父子关系无效`);
    }
  }
  if (new Set(notebooks.map((notebook) => notebook.id)).size !== notebooks.length) {
    throw new Error("资料库包含重复集合");
  }
  for (const notebook of notebooks) {
    if (!articles[notebook.lastOpenedNodeId] ||
        notebook.rootIds.some((id) => !articles[id] || articles[id].parentId !== null)) {
      throw new Error(`集合 ${notebook.title} 引用了不存在的文章`);
    }
  }
  // 父链必须终止于根节点，避免导入循环后导航和生成无法结束。
  const resolved = new Set<string>();
  for (const article of Object.values(articles)) {
    const path = new Set<string>();
    let cursor: ArticleNode | undefined = article;
    while (cursor && !resolved.has(cursor.id)) {
      if (path.has(cursor.id)) throw new Error("资料库包含循环父子关系");
      path.add(cursor.id);
      cursor = cursor.parentId ? articles[cursor.parentId] : undefined;
    }
    path.forEach((id) => resolved.add(id));
  }
  return { notebooks, articles };
}

export function libraryAppData(metadata: LibraryMetadata): AppData {
  return {
    ...metadata,
    jobs: [],
    currentNotebookId: null,
    currentArticleId: null
  };
}
