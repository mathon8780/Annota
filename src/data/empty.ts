import type { AppData } from "../types";

export function createEmptyAppData(): AppData {
  return {
    notebooks: [],
    articles: {},
    jobs: [],
    currentNotebookId: null,
    currentArticleId: null
  };
}
