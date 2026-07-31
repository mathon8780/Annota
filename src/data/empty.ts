import type { AppData } from "../types";

export function createEmptyAppData(): AppData {
  return {
    notebooks: [],
    folderProfiles: [],
    deletedFolderKeys: [],
    articles: {},
    jobs: [],
    currentNotebookId: null,
    currentArticleId: null
  };
}
