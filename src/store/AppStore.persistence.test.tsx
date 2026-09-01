import { render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import type { AppData } from "../types";

const repositoryMocks = vi.hoisted(() => ({
  awaitDesktopLibraryWrites: vi.fn(() => Promise.resolve()),
  isDesktopLibrary: vi.fn(() => true),
  loadDesktopLibrary: vi.fn(),
  replaceDesktopLibrary: vi.fn(() => Promise.resolve())
}));

vi.mock("../utils/libraryRepository", () => repositoryMocks);

const workspaceMocks = vi.hoisted(() => ({
  listWorkspaces: vi.fn(() =>
    Promise.resolve({
      activeWorkspaceId: "managed-default",
      workspaces: [
        {
          id: "managed-default",
          displayName: "Annota 默认工作区",
          path: "C:\\Annota",
          kind: "managed",
          lastOpenedAt: "2026-08-31T00:00:00Z",
          active: true
        }
      ],
      diagnostic: {
        workspaceId: "managed-default",
        checkedAt: "2026-08-31T00:00:00Z",
        status: "healthy",
        checks: []
      }
    })
  ),
  createWorkspace: vi.fn(),
  addExistingWorkspace: vi.fn(),
  switchWorkspace: vi.fn(),
  removeWorkspace: vi.fn(),
  diagnoseWorkspace: vi.fn()
}));

vi.mock("../utils/workspaceRepository", () => workspaceMocks);

import {
  APP_DATA_STORAGE_KEY,
  AppStoreProvider,
  useAppStore
} from "./AppStore";

const metadata: Pick<AppData, "notebooks" | "articles"> = {
  notebooks: [
    {
      id: "notebook-1",
      rootId: "root-1",
      rootIds: ["root-1"],
      knowledgePointIds: ["root-1"],
      title: "SQLite 资料库",
      summary: "",
      description: "",
      color: "#315fdb",
      icon: "library",
      updatedAt: "2026-08-31T00:00:00Z",
      lastOpenedNodeId: "root-1",
      accent: "cobalt"
    }
  ],
  articles: {
    "root-1": {
      id: "root-1",
      rootId: "root-1",
      parentId: null,
      title: "SQLite 资料库",
      summary: "",
      type: "根节点",
      childIds: [],
      createdAt: "2026-08-31T00:00:00Z",
      updatedAt: "2026-08-31T00:00:00Z",
      family: "笔记",
      creationMethod: "手动",
      appearance: undefined,
      source: undefined,
      contentJson: undefined,
      anchorJson: undefined,
      generationJson: undefined
    }
  }
};

function Probe() {
  const { data } = useAppStore();
  return <div>{data.notebooks.map((notebook) => notebook.title).join(",") || "empty"}</div>;
}

function renderStore({ children }: PropsWithChildren) {
  return render(<AppStoreProvider>{children}</AppStoreProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
  repositoryMocks.isDesktopLibrary.mockReturnValue(true);
  workspaceMocks.listWorkspaces.mockClear();
  repositoryMocks.loadDesktopLibrary.mockReset();
  repositoryMocks.replaceDesktopLibrary.mockReset();
  repositoryMocks.replaceDesktopLibrary.mockResolvedValue(undefined);
});

it("hydrates desktop metadata before enabling SQLite saves", async () => {
  let resolveLoad: (value: {
    metadata: typeof metadata;
    importedLegacy: boolean;
  }) => void = () => {
    throw new Error("load resolver was not initialized");
  };
  repositoryMocks.loadDesktopLibrary.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
  );
  window.localStorage.setItem(
    APP_DATA_STORAGE_KEY,
    JSON.stringify({ ...metadata, jobs: [], currentNotebookId: null, currentArticleId: null })
  );

  renderStore({ children: <Probe /> });
  expect(screen.getByRole("status")).toHaveTextContent("正在打开工作区资料库");
  await waitFor(() => {
    expect(repositoryMocks.loadDesktopLibrary).toHaveBeenCalledWith(metadata);
  });
  expect(repositoryMocks.replaceDesktopLibrary).not.toHaveBeenCalled();

  resolveLoad({ metadata, importedLegacy: true });
  expect(await screen.findByText("SQLite 资料库")).toBeInTheDocument();
  await waitFor(() => {
    expect(repositoryMocks.replaceDesktopLibrary).toHaveBeenCalledWith(metadata);
  });
  expect(repositoryMocks.replaceDesktopLibrary).not.toHaveBeenCalledWith({
    notebooks: [],
    articles: {}
  });
  expect(
    window.localStorage.getItem("annota.desktop.library.sqlite-v1.imported")
  ).toBe("done");
});

it("does not enable saving when desktop hydration fails", async () => {
  repositoryMocks.loadDesktopLibrary.mockRejectedValue(new Error("database is damaged"));
  renderStore({ children: <Probe /> });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "无法打开工作区资料库：database is damaged"
  );
  expect(repositoryMocks.replaceDesktopLibrary).not.toHaveBeenCalled();
});

it("keeps localStorage as the browser-only fallback", async () => {
  repositoryMocks.isDesktopLibrary.mockReturnValue(false);
  window.localStorage.setItem("annota:content-reset.single-markdown-v1", "done");
  window.localStorage.setItem(
    APP_DATA_STORAGE_KEY,
    JSON.stringify({ ...metadata, jobs: [], currentNotebookId: null, currentArticleId: null })
  );
  renderStore({ children: <Probe /> });
  expect(screen.getByText("SQLite 资料库")).toBeInTheDocument();
  expect(repositoryMocks.loadDesktopLibrary).not.toHaveBeenCalled();
  expect(repositoryMocks.replaceDesktopLibrary).not.toHaveBeenCalled();
});
