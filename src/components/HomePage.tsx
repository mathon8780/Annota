import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent
} from "react";
import {
  BookOpenText,
  Boxes,
  ChevronDown,
  Clock3,
  FileInput,
  FolderTree,
  Import,
  LibraryBig,
  Plus,
  Search,
  Settings2,
  Star,
  Tags,
  WandSparkles,
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
import {
  HomeLibraryView,
  type HomeLibrarySection
} from "./HomeLibraryView";
import { GenerationPage } from "./GenerationPage";
import { SettingsPage } from "./SettingsPage";

interface HomePageProps {
  contentStyle: ContentStyleId;
  customContentStyle: CustomContentStyle;
  shortcuts: ShortcutPreferences;
  terms: ContentTerms;
  settingsOpen: boolean;
  onContentStyleChange: (style: ContentStyleId) => void;
  onCustomContentStyleChange: (style: CustomContentStyle) => void;
  onShortcutChange: (
    actionId: ShortcutActionId,
    binding: ShortcutBinding
  ) => void;
  onResetShortcuts: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
}

function countDescendants(rootId: string, articles: ReturnType<typeof useAppStore>["data"]["articles"]) {
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
  walk(rootId);
  return seen.size;
}

function formatTimelineDay(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(date, today)) return "今天";
  if (sameDay(date, yesterday)) return "昨天";
  return date.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short"
  });
}

function formatClock(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function timelineDateKey(value: string) {
  const date = new Date(value);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");
}

export function HomePage({
  contentStyle,
  customContentStyle,
  shortcuts,
  terms,
  settingsOpen,
  onContentStyleChange,
  onCustomContentStyleChange,
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
    updateFolderProfile,
    updateFolderProfiles,
    deleteFolderProfiles,
    importPackage,
    resetDemo
  } = useAppStore();
  const [activeHomeView, setActiveHomeView] = useState<
    "home" | "generation" | HomeLibrarySection
  >("home");
  const [activePage, setActivePage] = useState<"overview" | "recent">("overview");
  const [filter, setFilter] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const newDialogRef = useRef<HTMLDialogElement>(null);
  const overviewScrollRef = useRef<HTMLElement>(null);
  const recentScrollRef = useRef<HTMLElement>(null);
  const touchStartYRef = useRef<number | null>(null);

  const notebooks = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase("zh-CN");
    const filtered = data.notebooks.filter((notebook) =>
      [notebook.title, notebook.summary, notebook.category, notebook.tags.join(" ")]
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(query)
    );
    return [...filtered].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );
  }, [data.notebooks, filter]);

  const recentPreview = useMemo(
    () =>
      [...data.notebooks]
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime()
        )
        .slice(0, 3),
    [data.notebooks]
  );

  const timelineGroups = useMemo(() => {
    return notebooks.reduce<
      Array<{ key: string; label: string; notebooks: Notebook[] }>
    >((groups, notebook) => {
      const key = timelineDateKey(notebook.updatedAt);
      const current = groups.at(-1);
      if (current?.key === key) {
        current.notebooks.push(notebook);
      } else {
        groups.push({
          key,
          label: formatTimelineDay(notebook.updatedAt),
          notebooks: [notebook]
        });
      }
      return groups;
    }, []);
  }, [notebooks]);

  const totalNodes = Object.keys(data.articles).length;
  const totalTags = new Set(data.notebooks.flatMap((notebook) => notebook.tags)).size;

  useEffect(() => {
    const overview = overviewScrollRef.current as
      | (HTMLElement & { inert: boolean })
      | null;
    const recent = recentScrollRef.current as
      | (HTMLElement & { inert: boolean })
      | null;
    if (overview) overview.inert = activePage !== "overview";
    if (recent) recent.inert = activePage !== "recent";
  }, [activePage]);

  const handleCreate = () => {
    const title = newTitle.trim() || "未命名笔记";
    createNotebook(title);
    setNewTitle("");
    newDialogRef.current?.close();
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    importPackage(text, file.name);
    if (fileRef.current) fileRef.current.value = "";
  };

  const overviewIsAtBottom = () => {
    const overview = overviewScrollRef.current;
    if (!overview) return true;
    return overview.scrollHeight - overview.scrollTop - overview.clientHeight <= 2;
  };

  const showOverview = () => {
    setActivePage("overview");
    overviewScrollRef.current?.focus({ preventScroll: true });
  };

  const showRecent = () => {
    if (!overviewIsAtBottom()) return;
    setActivePage("recent");
    recentScrollRef.current?.focus({ preventScroll: true });
  };

  const handlePageWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) < 8) return;
    if (activePage === "overview" && event.deltaY > 0 && overviewIsAtBottom()) {
      event.preventDefault();
      showRecent();
      return;
    }
    if (
      activePage === "recent" &&
      event.deltaY < 0 &&
      (recentScrollRef.current?.scrollTop ?? 0) <= 1
    ) {
      event.preventDefault();
      showOverview();
    }
  };

  const handlePageKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      activePage === "overview" &&
      (event.key === "PageDown" || event.key === "ArrowDown") &&
      overviewIsAtBottom()
    ) {
      event.preventDefault();
      showRecent();
      return;
    }
    if (
      activePage === "recent" &&
      (event.key === "PageUp" || event.key === "ArrowUp") &&
      (recentScrollRef.current?.scrollTop ?? 0) <= 1
    ) {
      event.preventDefault();
      showOverview();
    }
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const startY = touchStartYRef.current;
    const endY = event.changedTouches[0]?.clientY;
    touchStartYRef.current = null;
    if (startY === null || endY === undefined) return;
    const distance = startY - endY;
    if (activePage === "overview" && distance > 48 && overviewIsAtBottom()) {
      showRecent();
    } else if (
      activePage === "recent" &&
      distance < -48 &&
      (recentScrollRef.current?.scrollTop ?? 0) <= 1
    ) {
      showOverview();
    }
  };

  return (
    <div className="home-app">
      <main className="home-workspace">
        <div className="home-sidebar-shell">
          <aside className="home-sidebar" aria-label={`${terms.home}导航`}>
            <nav>
              <button
                className={`home-nav-item${
                  !settingsOpen && activeHomeView === "home" ? " is-active" : ""
                }`}
                type="button"
                aria-current={
                  !settingsOpen && activeHomeView === "home" ? "page" : undefined
                }
                onClick={() => {
                  onCloseSettings();
                  setActiveHomeView("home");
                  setActivePage("overview");
                }}
              >
                <LibraryBig aria-hidden="true" size={17} />
                <span>{terms.home}</span>
              </button>
              {(
                [
                  ["folders", FolderTree, terms.folders],
                  ["tags", Tags, terms.tags],
                  ["favorites", Star, terms.favorites]
                ] as const
              ).map(([section, Icon, label]) => (
                <button
                  className={`home-nav-item${
                    !settingsOpen && activeHomeView === section
                      ? " is-active"
                      : ""
                  }`}
                  type="button"
                  aria-current={
                    !settingsOpen && activeHomeView === section
                      ? "page"
                      : undefined
                  }
                  key={section}
                  onClick={() => {
                    onCloseSettings();
                    setActionMenuOpen(false);
                    setActiveHomeView(section);
                  }}
                >
                  <Icon aria-hidden="true" size={17} />
                  <span>{label}</span>
                </button>
              ))}
              <button
                className={`home-nav-item${
                  !settingsOpen && activeHomeView === "generation"
                    ? " is-active"
                    : ""
                }`}
                type="button"
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
                <WandSparkles aria-hidden="true" size={17} />
                <span>生成与提示词</span>
              </button>
            </nav>

            <div className="home-sidebar-footer">
              <button type="button" onClick={() => fileRef.current?.click()}>
                <Import aria-hidden="true" size={16} />
                <span>导入材料</span>
              </button>
              <button type="button" onClick={resetDemo}>
                <Clock3 aria-hidden="true" size={16} />
                <span>重置演示数据</span>
              </button>
              <button
                className={settingsOpen ? "is-active" : undefined}
                type="button"
                aria-label="打开设置"
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
            settingsOpen ? " is-settings-open" : " has-mobile-library-nav"
          }`}
        >
          {settingsOpen ? (
            <SettingsPage
              contentStyle={contentStyle}
              customContentStyle={customContentStyle}
              shortcuts={shortcuts}
              onContentStyleChange={onContentStyleChange}
              onCustomContentStyleChange={onCustomContentStyleChange}
              onShortcutChange={onShortcutChange}
              onResetShortcuts={onResetShortcuts}
            />
          ) : (
            <>
              <nav className="home-mobile-library-nav" aria-label="主导航">
                {(
                  [
                    ["home", LibraryBig, terms.home],
                    ["folders", FolderTree, terms.folders],
                    ["tags", Tags, terms.tags],
                    ["favorites", Star, terms.favorites],
                    ["generation", WandSparkles, "生成与提示词"]
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
                      if (section === "home") setActivePage("overview");
                    }}
                  >
                    <Icon aria-hidden="true" size={16} />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>

              {activeHomeView === "home" ? (
                <div
                  className="home-page-viewport"
                  data-active-page={activePage}
                  role="region"
                  aria-label="主页分页内容"
                  tabIndex={0}
                  onWheel={handlePageWheel}
                  onKeyDown={handlePageKeyDown}
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                >
                  <div className="home-page-track">
                  <section
                    ref={overviewScrollRef}
                    className="home-main home-page-panel home-overview-page"
                    aria-labelledby="home-overview-title"
                    aria-hidden={activePage !== "overview"}
                    tabIndex={-1}
                  >
                    <div className="home-intro">
                      <div>
                        <p className="context-line">周二，7 月 28 日</p>
                        <h1 id="home-overview-title">继续生长你的知识树</h1>
                        <p>
                          从最近阅读处继续，或导入一份材料开始新的学习路径。每次解释与翻译都会保留来源。
                        </p>
                      </div>
                    </div>

                    <div className="home-overview-tools">
                      <div className="home-ledger" aria-label="知识库概况">
                        <div>
                          <BookOpenText aria-hidden="true" size={17} />
                          <span>
                            <strong>{data.notebooks.length}</strong>
                            主笔记
                          </span>
                        </div>
                        <div>
                          <FolderTree aria-hidden="true" size={17} />
                          <span>
                            <strong>{totalNodes}</strong>
                            全部节点
                          </span>
                        </div>
                        <div>
                          <Boxes aria-hidden="true" size={17} />
                          <span>
                            <strong>{totalTags}</strong>
                            {terms.tags}
                          </span>
                        </div>
                      </div>

                      <button
                        className="global-search-trigger home-search-trigger"
                        type="button"
                        onClick={onOpenSearch}
                      >
                        <Search aria-hidden="true" size={17} />
                        <span>搜索标题、正文与{terms.tags}</span>
                        <kbd>{formatShortcut(shortcuts["open-search"])}</kbd>
                      </button>
                    </div>

                    <section
                      className="home-recent-preview"
                      aria-labelledby="home-recent-preview-title"
                    >
                      <header>
                        <div>
                          <p>READING TRAIL</p>
                          <h2 id="home-recent-preview-title">{terms.recent}</h2>
                        </div>
                        <span>按最近打开或修改时间排列</span>
                      </header>
                      <div className="notebook-grid home-recent-preview-grid">
                        {recentPreview.map((notebook) => (
                          <NotebookCard
                            key={notebook.id}
                            notebook={notebook}
                            descendants={countDescendants(
                              notebook.rootId,
                              data.articles
                            )}
                            subNotesLabel={terms.subNotes}
                            onOpen={() => openNotebook(notebook.id)}
                          />
                        ))}
                      </div>
                    </section>

                    <button
                      className="home-scroll-cue"
                      type="button"
                      onClick={showRecent}
                    >
                      <span>下滑查看{terms.recent}</span>
                      <ChevronDown aria-hidden="true" size={17} />
                    </button>
                  </section>

                  <section
                    ref={recentScrollRef}
                    className="home-main home-page-panel home-recent-page"
                    aria-label="最近浏览时间线"
                    aria-hidden={activePage !== "recent"}
                    tabIndex={-1}
                  >
                    <header className="recent-header">
                      <div>
                        <p className="recent-eyebrow">READING TRAIL</p>
                        <h2 id="recent-title">{terms.recent}</h2>
                        <span>按最近打开或修改时间倒序排列</span>
                      </div>
                      <div className="recent-tools">
                        <label className="inline-filter">
                          <Search aria-hidden="true" size={15} />
                          <span className="sr-only">筛选{terms.recent}</span>
                          <input
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                            placeholder="筛选当前卡片"
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
                    </header>

                    {timelineGroups.length ? (
                      <div
                        className="recent-timeline"
                        role="list"
                        aria-label="最近浏览时间线"
                      >
                        {timelineGroups.map((group) => (
                          <section
                            className="recent-timeline-group"
                            role="listitem"
                            key={group.key}
                          >
                            <div className="recent-timeline-stamp">
                              <strong>{group.label}</strong>
                              <small>{group.notebooks.length} 次浏览</small>
                            </div>
                            <div className="recent-timeline-line" aria-hidden="true">
                              <span></span>
                            </div>
                            <div className="notebook-grid recent-timeline-cards">
                              {group.notebooks.map((notebook) => (
                                <NotebookCard
                                  key={notebook.id}
                                  notebook={notebook}
                                  descendants={countDescendants(
                                    notebook.rootId,
                                    data.articles
                                  )}
                                  subNotesLabel={terms.subNotes}
                                  onOpen={() => openNotebook(notebook.id)}
                                />
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <div className="home-empty">
                        <Search aria-hidden="true" size={22} />
                        <strong>没有符合筛选条件的主笔记</strong>
                        <span>清除筛选，或导入一份新的 Markdown / TXT 材料。</span>
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => setFilter("")}
                        >
                          清除筛选
                        </button>
                      </div>
                    )}
                  </section>
                  </div>
                </div>
              ) : activeHomeView === "generation" ? (
                <GenerationPage />
              ) : (
                <div className="home-main library-view-shell">
                  <HomeLibraryView
                    section={activeHomeView}
                    notebooks={data.notebooks}
                    folderProfiles={data.folderProfiles}
                    articles={data.articles}
                    onUpdateFolderProfile={updateFolderProfile}
                    onUpdateFolderProfiles={updateFolderProfiles}
                    onDeleteFolderProfiles={deleteFolderProfiles}
                    renderNotebook={(notebook) => (
                      <NotebookCard
                        notebook={notebook}
                        descendants={countDescendants(
                          notebook.rootId,
                          data.articles
                        )}
                        subNotesLabel={terms.subNotes}
                        onOpen={() => openNotebook(notebook.id)}
                      />
                    )}
                  />
                </div>
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
                        newDialogRef.current?.showModal();
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
              <h2 id="new-note-title">{terms.newNote}</h2>
              <p>创建一棵新的知识树，稍后可在正文中继续编辑。</p>
            </div>
            <button className="icon-button" type="button" onClick={() => newDialogRef.current?.close()}>
              <X aria-hidden="true" size={17} />
              <span className="sr-only">关闭</span>
            </button>
          </header>
          <label htmlFor="new-note-name">笔记标题</label>
          <input
            id="new-note-name"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="例如：ECS 架构学习笔记"
            autoFocus
          />
          <small>标题可稍后修改；正文会自动保存在本机。</small>
          <footer>
            <button className="button secondary" type="button" onClick={() => newDialogRef.current?.close()}>
              取消
            </button>
            <button className="button primary" type="submit" disabled={!newTitle.trim()}>
              创建并打开
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
  onOpen
}: {
  notebook: Notebook;
  descendants: number;
  subNotesLabel: string;
  onOpen: () => void;
}) {
  return (
    <button
      className="notebook-card"
      data-accent={notebook.accent}
      type="button"
      onClick={onOpen}
      aria-label={`打开笔记：${notebook.title}`}
    >
      <span className="card-rail" aria-hidden="true"></span>
      <span className="notebook-meta">
        <time
          dateTime={notebook.updatedAt}
          data-timestamp={new Date(notebook.updatedAt).getTime()}
        >
          {formatClock(notebook.updatedAt)}
        </time>
        <span>{notebook.category}</span>
      </span>
      <strong>{notebook.title}</strong>
      <span className="notebook-summary">{notebook.summary}</span>
      <span className="notebook-footer">
        <span className="connection-count">
          <FolderTree aria-hidden="true" size={14} />
          {descendants
            ? `${descendants} 个${subNotesLabel}`
            : `尚无${subNotesLabel}`}
        </span>
        <span className="notebook-tags">
          {notebook.tags.slice(0, 2).map((tag) => (
            <small key={tag}>#{tag}</small>
          ))}
        </span>
      </span>
    </button>
  );
}
