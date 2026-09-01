import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";
import {
  BookOpenText,
  ChevronLeft,
  FileInput,
  Folder,
  Import,
  LibraryBig,
  Network,
  Plus,
  Search,
  Settings2,
  X
} from "lucide-react";
import { useAppStore } from "../store/AppStore";
import type { Notebook } from "../types";
import type {
  ContentStyleId,
  ContentTerms,
  CustomContentStyle
} from "../utils/contentDisplay";
import { formatShortcut } from "../utils/shortcuts";
import type {
  ShortcutActionId,
  ShortcutBinding,
  ShortcutPreferences
} from "../utils/shortcuts";
import type { AppThemeId } from "../utils/themePreferences";
import type { ReadingPathMode } from "../utils/readingPathPreferences";
import { GenerationPage } from "./GenerationPage";
import { SettingsPage } from "./SettingsPage";

interface HomePageProps {
  appTheme: AppThemeId;
  contentStyle: ContentStyleId;
  customContentStyle: CustomContentStyle;
  readingPathMode: ReadingPathMode;
  shortcuts: ShortcutPreferences;
  terms: ContentTerms;
  settingsOpen: boolean;
  onContentStyleChange: (style: ContentStyleId) => void;
  onCustomContentStyleChange: (style: CustomContentStyle) => void;
  onAppThemeChange: (theme: AppThemeId) => void;
  onReadingPathModeChange: (mode: ReadingPathMode) => void;
  onShortcutChange: (
    actionId: ShortcutActionId,
    binding: ShortcutBinding
  ) => void;
  onResetShortcuts: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
}

function countDescendants(rootIds: string | readonly string[], articles: ReturnType<typeof useAppStore>["data"]["articles"]) {
  const seen = new Set<string>();
  const walk = (id: string) => {
    const article = articles[id];
    if (!article) return;
    article.childIds.forEach((childId) => {
      if (!seen.has(childId)) {
        seen.add(childId);
        walk(childId);
      }
    });
  };
  (Array.isArray(rootIds) ? rootIds : [rootIds]).forEach(walk);
  return seen.size;
}

function collectionKnowledgePointIds(notebook: Notebook) {
  return notebook.knowledgePointIds ?? notebook.rootIds ?? [notebook.rootId];
}

function formatClock(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export function HomePage({
  appTheme,
  contentStyle,
  customContentStyle,
  readingPathMode,
  shortcuts,
  terms,
  settingsOpen,
  onContentStyleChange,
  onCustomContentStyleChange,
  onAppThemeChange,
  onReadingPathModeChange,
  onShortcutChange,
  onResetShortcuts,
  onOpenSearch,
  onOpenSettings,
  onCloseSettings
}: HomePageProps) {
  const {
    data,
    openNotebook,
    createNotebook,
    createKnowledgePoint,
    ensureCollectionForArticle,
    collectArticle,
    importPackage
  } = useAppStore();
  const [activeHomeView, setActiveHomeView] = useState<"home" | "collections" | "generation">("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filter, setFilter] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newColor, setNewColor] = useState("#315fdb");
  const [newIcon, setNewIcon] = useState("library");
  const [targetCollectionId, setTargetCollectionId] = useState<string | null>(null);
  const [collectTargetId, setCollectTargetId] = useState<string | null>(null);
  const [collectSelection, setCollectSelection] = useState<string[]>([]);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const newDialogRef = useRef<HTMLDialogElement>(null);
  const collectDialogRef = useRef<HTMLDialogElement>(null);

  const notebooks = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase("zh-CN");
    const filtered = data.notebooks.filter((notebook) =>
      [
        notebook.title,
        notebook.description,
        notebook.summary,
        ...collectionKnowledgePointIds(notebook).map(
          (id) => data.articles[id]?.title ?? ""
        )
      ]
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(query)
    );
    return [...filtered].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );
  }, [data.articles, data.notebooks, filter]);

  const todayLabel = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date());

  /** 主页展示的知识点(根文章)列表,按最近更新排序。 */
  const knowledgePoints = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase("zh-CN");
    return Object.values(data.articles)
      .filter((article) => article.parentId === null)
      .filter((article) =>
        [article.title, article.summary, article.type]
          .join(" ")
          .toLocaleLowerCase("zh-CN")
          .includes(query)
      )
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime()
      );
  }, [data.articles, filter]);

  const collectionsOfArticle = (articleId: string) =>
    data.notebooks.filter((notebook) =>
      (notebook.knowledgePointIds ?? notebook.rootIds ?? [notebook.rootId]).includes(
        articleId
      )
    );

  const totalNodes = Object.keys(data.articles).length;

  const openKnowledgePoint = async (articleId: string) => {
    const collections = collectionsOfArticle(articleId);
    if (collections.length) {
      openNotebook(collections[0].id);
      return;
    }
    const notebookId = await ensureCollectionForArticle(articleId);
    if (notebookId) openNotebook(notebookId);
  };

  const openCollectDialog = (notebookId: string) => {
    setCollectTargetId(notebookId);
    setCollectSelection([]);
    collectDialogRef.current?.showModal();
  };

  const confirmCollect = async () => {
    if (!collectTargetId || !collectSelection.length) return;
    await collectArticle(collectTargetId, collectSelection);
    setCollectSelection([]);
    setCollectTargetId(null);
    collectDialogRef.current?.close();
  };

  const handleCreate = async () => {
    const title = newTitle.trim() || (targetCollectionId ? "未命名知识点" : "未命名集合");
    if (targetCollectionId) {
      await createKnowledgePoint(targetCollectionId, title);
    } else {
      await createNotebook(title, "", {
        description: newDescription,
        color: newColor,
        icon: newIcon
      });
    }
    setNewTitle("");
    setNewDescription("");
    setNewColor("#315fdb");
    setNewIcon("library");
    setTargetCollectionId(null);
    newDialogRef.current?.close();
  };

  const openCreateDialog = (collectionId: string | null = null) => {
    setTargetCollectionId(collectionId);
    setNewTitle("");
    setNewDescription("");
    newDialogRef.current?.showModal();
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    await importPackage(text, file.name);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="home-app">
      <main
        className={`home-workspace${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}
      >
        <div
          className={`home-sidebar-shell${sidebarCollapsed ? " is-collapsed" : ""}`}
        >
          <aside
            className={`home-sidebar${sidebarCollapsed ? " is-collapsed" : ""}`}
            aria-label={`${terms.home}导航`}
          >
            <div className="home-sidebar-head">
              <button
                className="home-sidebar-collapse"
                type="button"
                aria-label={sidebarCollapsed ? "展开左侧导航" : "收起左侧导航"}
                title={sidebarCollapsed ? "展开左侧导航" : "收起左侧导航"}
                onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              >
                <span className="home-sidebar-collapse-label">收起导航</span>
                <span className="home-sidebar-collapse-track" aria-hidden="true">
                  <span className="home-sidebar-collapse-thumb">
                    <ChevronLeft size={14} />
                  </span>
                </span>
              </button>
            </div>
            <nav>
              <button
                className={`home-nav-item${
                  !settingsOpen && activeHomeView === "collections"
                    ? " is-active"
                    : ""
                }`}
                type="button"
                aria-label="集合"
                title={sidebarCollapsed ? "集合" : undefined}
                aria-current={
                  !settingsOpen && activeHomeView === "collections"
                    ? "page"
                    : undefined
                }
                onClick={() => {
                  onCloseSettings();
                  setActionMenuOpen(false);
                  setActiveHomeView("collections");
                }}
              >
                <Folder aria-hidden="true" size={17} />
                <span>集合</span>
              </button>
              <button
                className={`home-nav-item${
                  !settingsOpen && activeHomeView === "home" ? " is-active" : ""
                }`}
                type="button"
                aria-label={terms.home}
                title={sidebarCollapsed ? terms.home : undefined}
                aria-current={
                  !settingsOpen && activeHomeView === "home" ? "page" : undefined
                }
                onClick={() => {
                  onCloseSettings();
                  setActiveHomeView("home");
                }}
              >
                <LibraryBig aria-hidden="true" size={17} />
                <span>{terms.home}</span>
              </button>
              <button
                className={`home-nav-item${
                  !settingsOpen && activeHomeView === "generation"
                    ? " is-active"
                    : ""
                }`}
                type="button"
                aria-label="拓扑节点"
                title={sidebarCollapsed ? "拓扑节点" : undefined}
                aria-current={
                  !settingsOpen && activeHomeView === "generation"
                    ? "page"
                    : undefined
                }
                onClick={() => {
                  onCloseSettings();
                  setActionMenuOpen(false);
                  setActiveHomeView("generation");
                }}
              >
                <Network aria-hidden="true" size={17} />
                <span>拓扑节点</span>
              </button>
            </nav>

            <div className="home-sidebar-footer">
              <button
                type="button"
                aria-label="导入材料"
                title={sidebarCollapsed ? "导入材料" : undefined}
                onClick={() => fileRef.current?.click()}
              >
                <Import aria-hidden="true" size={16} />
                <span>导入材料</span>
              </button>
              <button
                className={settingsOpen ? "is-active" : undefined}
                type="button"
                aria-label="打开设置"
                title={sidebarCollapsed ? "设置" : undefined}
                aria-current={settingsOpen ? "page" : undefined}
                onClick={onOpenSettings}
              >
                <Settings2 aria-hidden="true" size={16} />
                <span>设置</span>
              </button>
            </div>
          </aside>
        </div>

        <div
          className={`home-content${
            settingsOpen ? " is-settings-open" : " has-mobile-nav"
          }`}
        >
          {settingsOpen ? (
            <SettingsPage
              appTheme={appTheme}
              contentStyle={contentStyle}
              customContentStyle={customContentStyle}
              readingPathMode={readingPathMode}
              shortcuts={shortcuts}
              onContentStyleChange={onContentStyleChange}
              onCustomContentStyleChange={onCustomContentStyleChange}
              onAppThemeChange={onAppThemeChange}
              onReadingPathModeChange={onReadingPathModeChange}
              onShortcutChange={onShortcutChange}
              onResetShortcuts={onResetShortcuts}
            />
          ) : (
            <>
              <nav className="home-mobile-nav" aria-label="主导航">
                {(
                  [
                    ["collections", Folder, "集合"],
                    ["home", LibraryBig, terms.home],
                    ["generation", Network, "拓扑节点"]
                  ] as const
                ).map(([section, Icon, label]) => (
                  <button
                    className={activeHomeView === section ? "is-active" : undefined}
                    type="button"
                    aria-current={
                      activeHomeView === section ? "page" : undefined
                    }
                    key={section}
                    onClick={() => {
                      setActionMenuOpen(false);
                      setActiveHomeView(section);
                    }}
                  >
                    <Icon aria-hidden="true" size={16} />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>

              {activeHomeView === "home" ? (
                <section
                  className="home-main home-knowledge-points-page"
                  aria-labelledby="home-overview-title"
                  tabIndex={-1}
                >
                  <div className="home-intro">
                    <div>
                      <p className="context-line">{todayLabel}</p>
                      <h1 id="home-overview-title">继续生长你的知识树</h1>
                      <p>
                        从最近阅读处继续，或新建、导入一份材料开始新的学习路径。内容保存在当前设备。
                      </p>
                    </div>
                  </div>

                  <div className="home-overview-tools">
                    <div className="home-ledger" aria-label="知识库概况">
                      <div>
                        <BookOpenText aria-hidden="true" size={17} />
                        <span>
                          <strong>{data.notebooks.length}</strong>
                          集合
                        </span>
                      </div>
                      <div>
                        <BookOpenText aria-hidden="true" size={17} />
                        <span>
                          <strong>{totalNodes}</strong>
                          全部节点
                        </span>
                      </div>
                    </div>

                    <button
                      className="global-search-trigger home-search-trigger"
                      type="button"
                      onClick={onOpenSearch}
                    >
                      <Search aria-hidden="true" size={17} />
                      <span>搜索标题与正文</span>
                      <kbd>{formatShortcut(shortcuts["open-search"])}</kbd>
                    </button>
                    <label className="inline-filter home-inline-filter">
                      <Search aria-hidden="true" size={15} />
                      <span className="sr-only">筛选文章</span>
                      <input
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        placeholder="筛选文章"
                      />
                      {filter && (
                        <button
                          type="button"
                          onClick={() => setFilter("")}
                          aria-label="清除筛选"
                        >
                          <X aria-hidden="true" size={14} />
                        </button>
                      )}
                    </label>
                  </div>

                  {knowledgePoints.length ? (
                    <div className="knowledge-point-grid">
                      {knowledgePoints.map((article) => (
                        <KnowledgePointCard
                          key={article.id}
                          article={article}
                          descendants={countDescendants(article.id, data.articles)}
                          collections={collectionsOfArticle(article.id).map(
                            (notebook) => notebook.title
                          )}
                          onOpen={() => void openKnowledgePoint(article.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="home-empty home-first-run">
                      <BookOpenText aria-hidden="true" size={24} />
                      <strong>知识库还是空的</strong>
                      <span>
                        创建第一篇笔记，或导入 Markdown、TXT 与 Annota 关系包。
                      </span>
                      <div>
                        <button
                          className="button primary"
                          type="button"
                          onClick={() => openCreateDialog()}
                        >
                          <Plus aria-hidden="true" size={16} />
                          {terms.newNote}
                        </button>
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => fileRef.current?.click()}
                        >
                          <FileInput aria-hidden="true" size={16} />
                          导入材料
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              ) : activeHomeView === "collections" ? (
                <section
                  className="home-main home-collections-page"
                  aria-labelledby="collections-page-title"
                >
                  <header className="recent-header">
                    <div>
                      <p className="recent-eyebrow">COLLECTIONS</p>
                      <h2 id="collections-page-title">集合</h2>
                      <span>归类与整理知识点；每个集合可收纳多篇文章。</span>
                    </div>
                    <div className="recent-tools">
                      <button
                        className="button primary"
                        type="button"
                        onClick={() => openCreateDialog()}
                      >
                        <Plus aria-hidden="true" size={15} />
                        新建集合
                      </button>
                    </div>
                  </header>

                  {notebooks.length ? (
                    <div className="notebook-grid collections-grid">
                      {notebooks.map((notebook) => (
                        <NotebookCard
                          key={notebook.id}
                          notebook={notebook}
                          descendants={countDescendants(
                            notebook.rootIds ?? [notebook.rootId],
                            data.articles
                          )}
                          subNotesLabel={terms.subNotes}
                          knowledgePointTitles={collectionKnowledgePointIds(notebook).map(
                            (id) => data.articles[id]?.title ?? "未命名知识点"
                          )}
                          onOpen={() => openNotebook(notebook.id)}
                          onCollectArticle={() => openCollectDialog(notebook.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="home-empty">
                      <Folder aria-hidden="true" size={22} />
                      <strong>还没有集合</strong>
                      <span>创建集合以归类知识点，或从主页文章列表中收集文章。</span>
                      <button
                        className="button primary"
                        type="button"
                        onClick={() => openCreateDialog()}
                      >
                        <Plus aria-hidden="true" size={15} />
                        新建集合
                      </button>
                    </div>
                  )}
                </section>
              ) : (
                <GenerationPage />
              )}

              {activeHomeView === "home" && (
                <div
                  className={`home-action-dock${actionMenuOpen ? " is-open" : ""}`}
                  onMouseEnter={() => setActionMenuOpen(true)}
                  onMouseLeave={() => setActionMenuOpen(false)}
                  onFocus={() => setActionMenuOpen(true)}
                  onBlur={(event) => {
                    if (
                      !event.currentTarget.contains(
                        event.relatedTarget as Node | null
                      )
                    ) {
                      setActionMenuOpen(false);
                    }
                  }}
                >
                  <button
                    className="home-action-trigger"
                    type="button"
                    aria-label="打开主页操作"
                    aria-expanded={actionMenuOpen}
                    onClick={() => setActionMenuOpen(true)}
                  >
                    <Plus aria-hidden="true" size={24} />
                  </button>
                  <div
                    className="home-action-menu"
                    role="group"
                    aria-label="主页操作"
                  >
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => {
                        setActionMenuOpen(false);
                        openCreateDialog();
                      }}
                    >
                      <Plus aria-hidden="true" size={17} />
                      {terms.newNote}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        setActionMenuOpen(false);
                        fileRef.current?.click();
                      }}
                    >
                      <FileInput aria-hidden="true" size={17} />
                      导入材料
                    </button>
                  </div>
                </div>
              )}
              <input
                ref={fileRef}
                hidden
                type="file"
                accept=".md,.markdown,.txt,.annota,.json,text/plain,text/markdown,application/json"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
            </>
          )}
        </div>
      </main>

      <dialog
        ref={newDialogRef}
        className="form-dialog"
        aria-labelledby="new-note-title"
        onClick={(event) => {
          if (event.target === newDialogRef.current) newDialogRef.current?.close();
        }}
      >
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            handleCreate();
          }}
        >
          <header>
            <div>
              <h2 id="new-note-title">
                {targetCollectionId ? "添加知识点" : "新建集合"}
              </h2>
              <p>
                {targetCollectionId
                  ? `添加到“${data.notebooks.find((item) => item.id === targetCollectionId)?.title ?? "当前集合"}”，创建后直接进入正文。`
                  : "集合用于归类多个知识点；创建时会同时生成第一篇主文章。"}
              </p>
            </div>
            <button className="icon-button" type="button" onClick={() => newDialogRef.current?.close()}>
              <X aria-hidden="true" size={17} />
              <span className="sr-only">关闭</span>
            </button>
          </header>
          <label htmlFor="new-note-name">
            {targetCollectionId ? "知识点标题" : "集合名称"}
          </label>
          <input
            id="new-note-name"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder={targetCollectionId ? "例如：注意力机制" : "例如：深度学习"}
            autoFocus
          />
          <small>
            {targetCollectionId
              ? "知识点主文章和延伸 Markdown 会保存在同一个随机目录中。"
              : "集合名称独立于知识点标题，可用于长期归类和总结。"}
          </small>
          {!targetCollectionId && (
            <div className="collection-metadata-fields">
              <label htmlFor="new-collection-description">集合描述</label>
              <textarea
                id="new-collection-description"
                value={newDescription}
                rows={3}
                maxLength={240}
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="这个集合用于整理什么内容？"
              />
              <div>
                <label>
                  <span>颜色</span>
                  <input
                    type="color"
                    value={newColor}
                    onChange={(event) => setNewColor(event.target.value)}
                  />
                </label>
                <label>
                  <span>图标</span>
                  <select value={newIcon} onChange={(event) => setNewIcon(event.target.value)}>
                    <option value="library">资料库</option>
                    <option value="book-open">阅读</option>
                    <option value="folder">文件夹</option>
                  </select>
                </label>
              </div>
            </div>
          )}
          <footer>
            <button className="button secondary" type="button" onClick={() => newDialogRef.current?.close()}>
              取消
            </button>
            <button className="button primary" type="submit" disabled={!newTitle.trim()}>
              {targetCollectionId ? "创建知识点" : "创建集合"}
            </button>
          </footer>
        </form>
      </dialog>

      <dialog
        ref={collectDialogRef}
        className="form-dialog"
        aria-labelledby="collect-title"
        onClick={(event) => {
          if (event.target === collectDialogRef.current) collectDialogRef.current?.close();
        }}
      >
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            void confirmCollect();
          }}
        >
          <header>
            <div>
              <h2 id="collect-title">收集文章</h2>
              <p>
                {`把主页上的知识点加入“${
                  data.notebooks.find((item) => item.id === collectTargetId)?.title ?? "当前集合"
                }”。`}
              </p>
            </div>
            <button className="icon-button" type="button" onClick={() => collectDialogRef.current?.close()}>
              <X aria-hidden="true" size={17} />
              <span className="sr-only">关闭</span>
            </button>
          </header>
          <div className="collect-article-list">
            {Object.values(data.articles)
              .filter((article) => article.parentId === null)
              .map((article) => {
                const included = Boolean(
                  collectTargetId &&
                    data.notebooks
                      .find((item) => item.id === collectTargetId)
                      ?.knowledgePointIds?.includes(article.id)
                );
                return (
                  <label
                    key={article.id}
                    className={`collect-article-item${included ? " is-included" : ""}`}
                  >
                    <input
                      type="checkbox"
                      disabled={included}
                      checked={included || collectSelection.includes(article.id)}
                      onChange={(event) => {
                        if (included) return;
                        setCollectSelection((current) =>
                          event.target.checked
                            ? [...current, article.id]
                            : current.filter((id) => id !== article.id)
                        );
                      }}
                    />
                    <span>
                      <strong>{article.title}</strong>
                      <small>{article.summary || article.type}</small>
                    </span>
                    {included && <em>已收录</em>}
                  </label>
                );
              })}
          </div>
          <footer>
            <button className="button secondary" type="button" onClick={() => collectDialogRef.current?.close()}>
              取消
            </button>
            <button className="button primary" type="submit" disabled={!collectSelection.length}>
              加入集合
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}

function NotebookCard({
  notebook,
  descendants,
  subNotesLabel,
  knowledgePointTitles,
  onOpen,
  onCollectArticle
}: {
  notebook: Notebook;
  descendants: number;
  subNotesLabel: string;
  knowledgePointTitles: string[];
  onOpen: () => void;
  onCollectArticle: () => void;
}) {
  const CollectionIcon =
    notebook.icon === "book-open"
      ? BookOpenText
      : notebook.icon === "folder"
        ? Folder
        : LibraryBig;
  return (
    <article
      className="notebook-card"
      data-accent={notebook.accent}
      style={{ "--collection-color": notebook.color } as CSSProperties}
    >
      <span className="card-rail" aria-hidden="true"></span>
      <button
        className="notebook-card-open"
        type="button"
        onClick={onOpen}
        aria-label={`打开集合：${notebook.title}`}
      >
        <span className="notebook-meta">
          <time
            dateTime={notebook.updatedAt}
            data-timestamp={new Date(notebook.updatedAt).getTime()}
          >
            {formatClock(notebook.updatedAt)}
          </time>
          <span>{knowledgePointTitles.length} 个知识点</span>
        </span>
        <span className="notebook-card-title">
          <CollectionIcon aria-hidden="true" size={18} />
          <strong>{notebook.title}</strong>
        </span>
        <span className="notebook-summary">{notebook.description || notebook.summary}</span>
        <span className="collection-knowledge-preview" aria-label="集合中的知识点">
          {knowledgePointTitles.slice(0, 2).map((title, index) => (
            <span key={`${title}-${index}`}>{title}</span>
          ))}
          {knowledgePointTitles.length > 2 && (
            <small>另有 {knowledgePointTitles.length - 2} 个</small>
          )}
        </span>
      </button>
      <span className="notebook-footer">
        <span className="connection-count">
          <BookOpenText aria-hidden="true" size={14} />
          {descendants
            ? `${descendants} 个${subNotesLabel}`
            : `尚无${subNotesLabel}`}
        </span>
        <button type="button" onClick={onCollectArticle}>
          <Plus aria-hidden="true" size={14} />
          收集文章
        </button>
      </span>
    </article>
  );
}

function KnowledgePointCard({
  article,
  descendants,
  collections,
  onOpen
}: {
  article: { id: string; title: string; summary: string; updatedAt: string };
  descendants: number;
  collections: string[];
  onOpen: () => void;
}) {
  return (
    <article className="knowledge-point-card">
      <button
        className="knowledge-point-open"
        type="button"
        onClick={onOpen}
        aria-label={`打开文章：${article.title}`}
      >
        <span className="knowledge-point-meta">
          <time
            dateTime={article.updatedAt}
            data-timestamp={new Date(article.updatedAt).getTime()}
          >
            {formatClock(article.updatedAt)}
          </time>
          <span>{descendants} 个节点</span>
        </span>
        <span className="knowledge-point-title">
          <BookOpenText aria-hidden="true" size={18} />
          <strong>{article.title}</strong>
        </span>
        {article.summary && (
          <span className="knowledge-point-summary">{article.summary}</span>
        )}
        <span className="knowledge-point-collections" aria-label="所属集合">
          {collections.length ? (
            collections.map((title) => (
              <span className="collection-chip" key={title}>{title}</span>
            ))
          ) : (
            <span className="collection-chip is-uncategorized">未归类</span>
          )}
        </span>
      </button>
    </article>
  );
}
