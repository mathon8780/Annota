import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { flushSync } from "react-dom";
import {
  Archive,
  BookOpenText,
  Briefcase,
  Check,
  CheckSquare2,
  ChevronLeft,
  Code2,
  Cpu,
  Database,
  FileText,
  FlaskConical,
  FolderKanban,
  Globe2,
  GraduationCap,
  Layers3,
  LibraryBig,
  Lightbulb,
  ListChecks,
  Network,
  Palette,
  PanelTop,
  Plus,
  Rocket,
  Search,
  Shapes,
  ShieldCheck,
  Sparkles,
  Tags,
  Trash2,
  Wrench,
  X,
  type LucideIcon
} from "lucide-react";
import type {
  ArticleNode,
  FolderIconId,
  FolderProfile,
  Notebook
} from "../types";

export type HomeLibrarySection = "folders" | "tags" | "favorites";

export interface HomeLibraryViewProps {
  section: HomeLibrarySection;
  notebooks: readonly Notebook[];
  folderProfiles: readonly FolderProfile[];
  articles: Readonly<Record<string, ArticleNode>>;
  renderNotebook: (notebook: Notebook) => ReactNode;
  onUpdateFolderProfile: (profile: FolderProfile) => void;
  onUpdateFolderProfiles: (profiles: FolderProfile[]) => void;
  onDeleteFolderProfiles: (keys: string[]) => void;
}

interface NotebookGroup {
  key: string;
  label: string;
  notebooks: Notebook[];
}

interface FolderCollection extends NotebookGroup {
  profile: FolderProfile;
}

const FOLDER_COLORS = [
  "#3158D8",
  "#7658A5",
  "#B36A3E",
  "#2F806E",
  "#A35C74",
  "#4E7A8A",
  "#5B6E9D",
  "#7C7048"
] as const;
const UNFILED_FOLDER_KEY = "未归档";

const FOLDER_ICON_OPTIONS: Array<{
  id: FolderIconId;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "archive", label: "档案", icon: Archive },
  { id: "book", label: "阅读", icon: BookOpenText },
  { id: "briefcase", label: "项目", icon: Briefcase },
  { id: "code", label: "代码", icon: Code2 },
  { id: "cpu", label: "系统", icon: Cpu },
  { id: "database", label: "数据", icon: Database },
  { id: "flask", label: "实验", icon: FlaskConical },
  { id: "folder", label: "文件夹", icon: FolderKanban },
  { id: "globe", label: "网络", icon: Globe2 },
  { id: "graduation", label: "学习", icon: GraduationCap },
  { id: "layers", label: "层级", icon: Layers3 },
  { id: "lightbulb", label: "灵感", icon: Lightbulb },
  { id: "network", label: "关系", icon: Network },
  { id: "palette", label: "设计", icon: Palette },
  { id: "rocket", label: "探索", icon: Rocket },
  { id: "shapes", label: "组件", icon: Shapes },
  { id: "shield", label: "安全", icon: ShieldCheck },
  { id: "sparkles", label: "概念", icon: Sparkles },
  { id: "template", label: "模板", icon: PanelTop },
  { id: "wrench", label: "工具", icon: Wrench }
];

const FOLDER_ICONS = Object.fromEntries(
  FOLDER_ICON_OPTIONS.map((option) => [option.id, option.icon])
) as Record<FolderIconId, LucideIcon>;

function createDefaultFolderProfile(
  group: NotebookGroup,
  index: number
): FolderProfile {
  const classifications = group.label
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    key: group.key,
    name: group.label,
    color: FOLDER_COLORS[index % FOLDER_COLORS.length],
    icon: index % 2 === 0 ? "archive" : "book",
    classifications:
      classifications.length > 1 ? classifications : ["知识集合"],
    description: `集中整理与“${group.label}”相关的笔记、页面和阅读进度。`
  };
}

function folderAccentStyle(color: string) {
  return { "--folder-accent": color } as CSSProperties;
}

function folderTransitionStyle(color: string, key: string) {
  const transitionName = `folder-${Array.from(key)
    .map((character) => character.codePointAt(0)?.toString(36) ?? "0")
    .join("-")}`;

  return {
    "--folder-accent": color,
    "--folder-transition-name": transitionName
  } as CSSProperties;
}

function formatFolderActivity(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

const FOLDER_SECTION_COPY = {
  eyebrow: "资料库 / 文件夹",
  title: "按主题归档",
  description: "沿着已有目录回到一组相关笔记，继续整理同一条知识脉络。",
  emptyTitle: "还没有文件夹",
  emptyDescription: "使用右下角加号创建第一个文件夹，并设置名称、颜色与图标。"
};

function compareNotebookRecency(left: Notebook, right: Notebook) {
  const difference =
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  return difference || left.id.localeCompare(right.id, "zh-CN");
}

function createGroups(
  notebooks: readonly Notebook[],
  getKeys: (notebook: Notebook) => readonly string[]
) {
  const groups = new Map<string, Notebook[]>();

  notebooks.forEach((notebook) => {
    getKeys(notebook).forEach((rawKey) => {
      const key = rawKey.trim();
      if (!key) return;
      const group = groups.get(key);
      if (group) {
        group.push(notebook);
      } else {
        groups.set(key, [notebook]);
      }
    });
  });

  return [...groups.entries()]
    .map<NotebookGroup>(([key, groupedNotebooks]) => ({
      key,
      label: key,
      notebooks: [...groupedNotebooks].sort(compareNotebookRecency)
    }))
    .sort(
      (left, right) =>
        right.notebooks.length - left.notebooks.length ||
        left.label.localeCompare(right.label, "zh-CN")
    );
}

function EmptyLibraryState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="library-view-empty" role="status">
      <LibraryBig aria-hidden="true" size={24} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function NotebookCollection({
  notebooks,
  renderNotebook
}: {
  notebooks: readonly Notebook[];
  renderNotebook: HomeLibraryViewProps["renderNotebook"];
}) {
  return (
    <div className="library-view-card-grid">
      {notebooks.map((notebook) => (
        <div className="library-view-card-slot" key={notebook.id}>
          {renderNotebook(notebook)}
        </div>
      ))}
    </div>
  );
}

export function HomeLibraryView({
  section,
  notebooks,
  folderProfiles,
  articles,
  renderNotebook,
  onUpdateFolderProfile,
  onUpdateFolderProfiles,
  onDeleteFolderProfiles
}: HomeLibraryViewProps) {
  const copy = FOLDER_SECTION_COPY;
  const [activeFolderKey, setActiveFolderKey] = useState<string | null>(null);
  const [folderQuery, setFolderQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFolderKeys, setSelectedFolderKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [batchPanel, setBatchPanel] = useState<
    "color" | "classifications" | null
  >(null);
  const [batchClassificationDraft, setBatchClassificationDraft] = useState("");
  const [folderDraft, setFolderDraft] = useState<FolderProfile | null>(null);
  const [folderEditorMode, setFolderEditorMode] = useState<"create" | "edit">(
    "edit"
  );
  const [classificationDraft, setClassificationDraft] = useState("");
  const [iconQuery, setIconQuery] = useState("");
  const [deleteFolderKeys, setDeleteFolderKeys] = useState<string[] | null>(
    null
  );
  const folderEditorRef = useRef<HTMLDialogElement>(null);
  const navigateToFolder = (folderKey: string | null) => {
    const transitionDocument = document as Document & {
      startViewTransition?: (
        updateCallback: () => void
      ) => { finished: Promise<void> };
    };
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (!transitionDocument.startViewTransition || reduceMotion) {
      if (reduceMotion) {
        setActiveFolderKey(folderKey);
        return;
      }

      document
        .querySelectorAll<HTMLElement>("[data-folder-motion-clone]")
        .forEach((clone) => clone.remove());
      document
        .querySelectorAll<HTMLElement>("[data-folder-transition-key]")
        .forEach((card) => {
          card.style.opacity = "";
          card.style.pointerEvents = "";
        });

      const sourceCards = new Map<
        string,
        { clone: HTMLElement; rect: DOMRect }
      >();
      document
        .querySelectorAll<HTMLElement>(
          "[data-folder-transition-key]:not([data-folder-motion-clone])"
        )
        .forEach((card) => {
          const key = card.dataset.folderTransitionKey;
          if (!key) return;

          const rect = card.getBoundingClientRect();
          const clone = card.cloneNode(true) as HTMLElement;
          const computedStyle = window.getComputedStyle(card);
          clone.dataset.folderMotionClone = "true";
          clone.setAttribute("aria-hidden", "true");
          clone.style.setProperty(
            "--folder-accent",
            computedStyle.getPropertyValue("--folder-accent")
          );
          Object.assign(clone.style, {
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            margin: "0",
            position: "fixed",
            zIndex: "400",
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            pointerEvents: "none",
            transformOrigin: "top left"
          });
          document.body.append(clone);
          sourceCards.set(key, { clone, rect });
        });

      flushSync(() => setActiveFolderKey(folderKey));

      const destinationCards = new Map<string, HTMLElement>();
      document
        .querySelectorAll<HTMLElement>(
          "[data-folder-transition-key]:not([data-folder-motion-clone])"
        )
        .forEach((card) => {
          const key = card.dataset.folderTransitionKey;
          if (!key) return;
          card.style.opacity = "0";
          card.style.pointerEvents = "none";
          destinationCards.set(key, card);
        });

      sourceCards.forEach(({ clone, rect }, key) => {
        const destination = destinationCards.get(key);
        if (!destination) {
          clone.remove();
          return;
        }

        const destinationRect = destination.getBoundingClientRect();
        const translateX = destinationRect.left - rect.left;
        const translateY = destinationRect.top - rect.top;
        const scaleX = destinationRect.width / Math.max(rect.width, 1);
        const scaleY = destinationRect.height / Math.max(rect.height, 1);
        let finished = false;
        const finishAnimation = () => {
          if (finished) return;
          finished = true;
          clone.remove();
          destination.style.opacity = "";
          destination.style.pointerEvents = "";
        };

        clone.addEventListener("transitionend", finishAnimation, {
          once: true
        });
        window.setTimeout(finishAnimation, 520);
        clone.style.transition =
          "transform 440ms cubic-bezier(0.22, 1, 0.36, 1)";
        void clone.offsetWidth;
        clone.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
      });
      return;
    }

    transitionDocument.startViewTransition(() => {
      flushSync(() => setActiveFolderKey(folderKey));
    });
  };
  const deleteFolderDialogRef = useRef<HTMLDialogElement>(null);

  const articleCountByRoot = useMemo(() => {
    return Object.values(articles).reduce<Map<string, number>>(
      (counts, article) => {
        counts.set(article.rootId, (counts.get(article.rootId) ?? 0) + 1);
        return counts;
      },
      new Map()
    );
  }, [articles]);

  const folderGroups = useMemo(
    () =>
      createGroups(notebooks, (notebook) => [
        notebook.category.trim() || "未归档"
      ]),
    [notebooks]
  );

  const folderCollections = useMemo<FolderCollection[]>(() => {
    const groups = new Map(folderGroups.map((group) => [group.key, group]));
    const profiles = new Map(
      folderProfiles.map((profile) => [profile.key, profile])
    );
    const profiledCollections = folderProfiles.map((profile) => {
      const group = groups.get(profile.key);
      return {
        key: profile.key,
        label: profile.name,
        notebooks: group?.notebooks ?? [],
        profile
      };
    });
    const unprofiledCollections = folderGroups
      .filter((group) => !profiles.has(group.key))
      .map((group, index) => ({
        ...group,
        profile: createDefaultFolderProfile(
          group,
          folderProfiles.length + index
        )
      }));
    return [...profiledCollections, ...unprofiledCollections];
  }, [folderGroups, folderProfiles]);

  const visibleFolderCollections = useMemo(() => {
    const query = folderQuery.trim().toLocaleLowerCase("zh-CN");
    if (!query) return folderCollections;
    return folderCollections.filter((collection) =>
      [
        collection.profile.name,
        collection.profile.description,
        collection.profile.classifications.join(" "),
        collection.notebooks.map((notebook) => notebook.title).join(" ")
      ]
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(query)
    );
  }, [folderCollections, folderQuery]);

  const activeFolder = useMemo(
    () =>
      activeFolderKey
        ? folderCollections.find((group) => group.key === activeFolderKey) ??
          null
        : null,
    [activeFolderKey, folderCollections]
  );

  useEffect(() => {
    if (section !== "folders" || (activeFolderKey && !activeFolder)) {
      setActiveFolderKey(null);
    }
  }, [activeFolder, activeFolderKey, section]);

  useEffect(() => {
    if (section === "folders") return;
    setSelectionMode(false);
    setSelectedFolderKeys(new Set());
    setBatchPanel(null);
    setFolderQuery("");
  }, [section]);

  useEffect(() => {
    const validKeys = new Set(
      folderCollections.map((collection) => collection.key)
    );
    setSelectedFolderKeys((current) => {
      const next = new Set([...current].filter((key) => validKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [folderCollections]);

  useEffect(() => {
    const dialog = folderEditorRef.current;
    if (!folderDraft || !dialog || dialog.open) return;
    dialog.showModal();
  }, [folderDraft]);

  useEffect(() => {
    const dialog = deleteFolderDialogRef.current;
    if (!deleteFolderKeys || !dialog || dialog.open) return;
    dialog.showModal();
  }, [deleteFolderKeys]);

  const openFolderEditor = (collection: FolderCollection) => {
    setFolderEditorMode("edit");
    setFolderDraft({ ...collection.profile });
    setClassificationDraft(collection.profile.classifications.join("，"));
    setIconQuery("");
  };

  const openFolderCreator = () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setFolderEditorMode("create");
    setFolderDraft({
      key: `folder-${stamp}`,
      name: "",
      color: FOLDER_COLORS[0],
      icon: "folder",
      classifications: ["知识集合"],
      description: ""
    });
    setClassificationDraft("知识集合");
    setIconQuery("");
  };

  const closeFolderEditor = () => {
    setFolderDraft(null);
    setClassificationDraft("");
    setIconQuery("");
  };

  const saveFolderProfile = () => {
    if (!folderDraft) return;
    const classifications = [
      ...new Set(
        classificationDraft
          .split(/[,，]/)
          .map((classification) => classification.trim())
          .filter(Boolean)
      )
    ].slice(0, 6);
    onUpdateFolderProfile({
      ...folderDraft,
      name: folderDraft.name.trim() || folderDraft.key,
      description: folderDraft.description.trim(),
      classifications:
        classifications.length > 0 ? classifications : ["知识集合"]
    });
    closeFolderEditor();
  };

  const toggleFolderSelection = (key: string) => {
    setSelectedFolderKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const closeBatchMode = () => {
    setSelectionMode(false);
    setSelectedFolderKeys(new Set());
    setBatchPanel(null);
    setBatchClassificationDraft("");
  };

  const selectAllVisibleFolders = () => {
    setSelectedFolderKeys(
      new Set(visibleFolderCollections.map((collection) => collection.key))
    );
  };

  const selectedFolderCollections = folderCollections.filter((collection) =>
    selectedFolderKeys.has(collection.key)
  );

  const applyBatchColor = (color: string) => {
    if (!selectedFolderCollections.length) return;
    onUpdateFolderProfiles(
      selectedFolderCollections.map((collection) => ({
        ...collection.profile,
        color
      }))
    );
    setBatchPanel(null);
  };

  const applyBatchClassifications = () => {
    const classifications = [
      ...new Set(
        batchClassificationDraft
          .split(/[,，]/)
          .map((classification) => classification.trim())
          .filter(Boolean)
      )
    ].slice(0, 6);
    if (!selectedFolderCollections.length || !classifications.length) return;
    onUpdateFolderProfiles(
      selectedFolderCollections.map((collection) => ({
        ...collection.profile,
        classifications
      }))
    );
    setBatchPanel(null);
    setBatchClassificationDraft("");
  };

  const requestFolderDeletion = (keys: string[]) => {
    const uniqueKeys = [...new Set(keys)].filter(
      (key) => key !== UNFILED_FOLDER_KEY
    );
    if (!uniqueKeys.length) return;
    setDeleteFolderKeys(uniqueKeys);
  };

  const closeDeleteConfirmation = () => {
    setDeleteFolderKeys(null);
  };

  const confirmFolderDeletion = () => {
    if (!deleteFolderKeys?.length) return;
    onDeleteFolderProfiles(deleteFolderKeys);
    if (activeFolderKey && deleteFolderKeys.includes(activeFolderKey)) {
      setActiveFolderKey(null);
    }
    closeFolderEditor();
    closeBatchMode();
    closeDeleteConfirmation();
  };

  const foldersPendingDeletion = deleteFolderKeys
    ? folderCollections.filter((collection) =>
        deleteFolderKeys.includes(collection.key)
      )
    : [];
  const notebooksPendingReassignment = foldersPendingDeletion.reduce(
    (total, collection) => total + collection.notebooks.length,
    0
  );
  const selectedDeletableFolderCount = selectedFolderCollections.filter(
    (collection) => collection.key !== UNFILED_FOLDER_KEY
  ).length;

  const visibleIconOptions = useMemo(() => {
    const query = iconQuery.trim().toLocaleLowerCase("zh-CN");
    if (!query) return FOLDER_ICON_OPTIONS;
    return FOLDER_ICON_OPTIONS.filter((option) =>
      `${option.label} ${option.id}`.toLocaleLowerCase("zh-CN").includes(query)
    );
  }, [iconQuery]);

  if (section !== "folders") {
    return (
      <section
        className={`library-view library-view-${section}`}
        aria-label={section === "tags" ? "标签" : "收藏"}
      />
    );
  }

  const countLabel = `${folderCollections.length} 个文件夹`;
  const folderPageCount = (collection: FolderCollection) =>
    collection.notebooks.reduce(
      (total, notebook) =>
        total + (articleCountByRoot.get(notebook.rootId) ?? 0),
      0
    );
  const recentArticleFor = (collection: FolderCollection) => {
    const notebook = collection.notebooks[0];
    return notebook
      ? (articles[notebook.lastOpenedNodeId] ??
          articles[notebook.rootId] ??
          null)
      : null;
  };

  return (
    <section
      className={`library-view library-view-${section}`}
      aria-labelledby={`library-view-${section}-title`}
    >
      <header className="library-view-header">
        <div className="library-view-heading">
          <span className="library-view-eyebrow">{copy.eyebrow}</span>
          <h2 id={`library-view-${section}-title`}>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <span className="library-view-count" aria-label={`当前共有${countLabel}`}>
          {countLabel}
        </span>
      </header>

      {section === "folders" &&
        (folderCollections.length ? (
          activeFolder ? (
            <div
              className="library-folder-browser"
              style={folderAccentStyle(activeFolder.profile.color)}
            >
              <aside className="library-folder-rail" aria-label="文件夹导航">
                <button
                  className="library-folder-back"
                  type="button"
                  onClick={() => navigateToFolder(null)}
                >
                  <ChevronLeft aria-hidden="true" size={16} />
                  <span>全部文件夹</span>
                </button>

                <div className="library-folder-rail-summary">
                  <span>COLLECTIONS</span>
                  <strong>{folderCollections.length}</strong>
                </div>

                <nav aria-label="切换文件夹">
                  <ul
                    className="library-folder-rail-list"
                    aria-label="文件夹卡片列表"
                  >
                    {folderCollections.map((collection) => {
                      const CollectionIcon =
                        FOLDER_ICONS[collection.profile.icon];
                      const isActive = collection.key === activeFolder.key;
                      const recentNotebook = collection.notebooks[0];

                      return (
                        <li key={collection.key}>
                          <button
                            className={`library-folder-rail-card${isActive ? " is-active" : ""}`}
                            type="button"
                            data-folder-transition-key={collection.key}
                            aria-label={`切换到文件夹：${collection.profile.name}`}
                            aria-current={isActive ? "page" : undefined}
                            onClick={() => navigateToFolder(collection.key)}
                            style={folderTransitionStyle(
                              collection.profile.color,
                              collection.key
                            )}
                          >
                            <span
                              className="library-folder-rail-card-icon"
                              aria-hidden="true"
                            >
                              <CollectionIcon size={19} />
                            </span>
                            <span className="library-folder-rail-card-copy">
                              <strong>{collection.profile.name}</strong>
                              <small>
                                {collection.notebooks.length} 篇笔记 ·{" "}
                                {folderPageCount(collection)} 个页面
                              </small>
                              <span>
                                {recentNotebook?.title ?? "暂无笔记内容"}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              </aside>

              <section
                className="library-folder-detail"
                aria-labelledby="library-active-folder-title"
              >
                <header className="library-folder-detail-header">
                  <button
                    className="library-folder-detail-icon library-folder-edit"
                    type="button"
                    aria-label={`编辑文件夹属性：${activeFolder.profile.name}`}
                    onClick={() => openFolderEditor(activeFolder)}
                  >
                    {(() => {
                      const ActiveIcon =
                        FOLDER_ICONS[activeFolder.profile.icon];
                      return <ActiveIcon aria-hidden="true" size={24} />;
                    })()}
                  </button>
                  <div className="library-folder-detail-copy">
                    <span className="library-folder-detail-kicker">
                      文件夹集合
                    </span>
                    <h3 id="library-active-folder-title">
                      {activeFolder.profile.name}
                    </h3>
                    <div className="library-folder-classifications">
                      {activeFolder.profile.classifications.map(
                        (classification) => (
                          <span key={classification}>{classification}</span>
                        )
                      )}
                    </div>
                    <p className="library-folder-detail-description">
                      {activeFolder.profile.description}
                    </p>
                    <p className="library-folder-detail-meta">
                      {activeFolder.notebooks.length} 篇笔记 ·{" "}
                      {folderPageCount(activeFolder)} 个页面
                    </p>
                  </div>
                </header>

                {activeFolder.notebooks.length ? (
                  <NotebookCollection
                    notebooks={activeFolder.notebooks}
                    renderNotebook={renderNotebook}
                  />
                ) : (
                  <div className="library-folder-detail-empty" role="status">
                    <FileText aria-hidden="true" size={20} />
                    <strong>这个文件夹还是空的</strong>
                    <span>文件夹已经创建，可以继续向其中归档笔记。</span>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="library-folder-overview">
              <div className="library-folder-management">
                <label className="library-folder-search">
                  <Search aria-hidden="true" size={16} />
                  <span className="sr-only">查找文件夹</span>
                  <input
                    value={folderQuery}
                    placeholder="查找名称、归类或内部笔记"
                    onChange={(event) => setFolderQuery(event.target.value)}
                  />
                  {folderQuery && (
                    <button
                      type="button"
                      aria-label="清除文件夹查找"
                      onClick={() => setFolderQuery("")}
                    >
                      <X aria-hidden="true" size={14} />
                    </button>
                  )}
                </label>
                <div className="library-folder-management-actions">
                  <button
                    className="library-folder-create-button"
                    type="button"
                    aria-label="新建文件夹"
                    title="新建文件夹"
                    onClick={openFolderCreator}
                  >
                    <Plus aria-hidden="true" size={18} />
                  </button>
                  <button
                    className={selectionMode ? "is-active" : undefined}
                    type="button"
                    aria-pressed={selectionMode}
                    onClick={() => {
                      if (selectionMode) {
                        closeBatchMode();
                      } else {
                        setSelectionMode(true);
                      }
                    }}
                  >
                    <ListChecks aria-hidden="true" size={16} />
                    <span>{selectionMode ? "退出批量管理" : "批量管理"}</span>
                  </button>
                </div>
              </div>

              {selectionMode && (
                <div className="library-folder-batch">
                  <div className="library-folder-batch-summary">
                    <CheckSquare2 aria-hidden="true" size={17} />
                    <span>
                      已选择 <strong>{selectedFolderKeys.size}</strong> 个文件夹
                    </span>
                  </div>
                  <div className="library-folder-batch-actions">
                    <button type="button" onClick={selectAllVisibleFolders}>
                      全选当前结果
                    </button>
                    <button
                      type="button"
                      disabled={!selectedFolderKeys.size}
                      onClick={() =>
                        setBatchPanel(
                          batchPanel === "color" ? null : "color"
                        )
                      }
                    >
                      <Palette aria-hidden="true" size={14} />
                      批量改色
                    </button>
                    <button
                      type="button"
                      disabled={!selectedFolderKeys.size}
                      onClick={() =>
                        setBatchPanel(
                          batchPanel === "classifications"
                            ? null
                            : "classifications"
                        )
                      }
                    >
                      <Tags aria-hidden="true" size={14} />
                      批量归类
                    </button>
                    <button
                      className="is-danger"
                      type="button"
                      disabled={!selectedDeletableFolderCount}
                      onClick={() =>
                        requestFolderDeletion([...selectedFolderKeys])
                      }
                    >
                      <Trash2 aria-hidden="true" size={14} />
                      删除
                    </button>
                    <button
                      type="button"
                      disabled={!selectedFolderKeys.size}
                      onClick={() => setSelectedFolderKeys(new Set())}
                    >
                      取消选择
                    </button>
                  </div>

                  {batchPanel === "color" && (
                    <div
                      className="library-folder-batch-panel"
                      aria-label="批量选择文件夹颜色"
                    >
                      <span>应用颜色</span>
                      <div className="folder-color-options">
                        {FOLDER_COLORS.map((color) => (
                          <button
                            type="button"
                            aria-label={`批量应用颜色 ${color}`}
                            key={color}
                            style={{ backgroundColor: color }}
                            onClick={() => applyBatchColor(color)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {batchPanel === "classifications" && (
                    <div className="library-folder-batch-panel">
                      <label>
                        <span>覆盖文件夹归类</span>
                        <input
                          value={batchClassificationDraft}
                          placeholder="例如：语言底层，C++"
                          onChange={(event) =>
                            setBatchClassificationDraft(event.target.value)
                          }
                        />
                      </label>
                      <button
                        className="button primary"
                        type="button"
                        disabled={!batchClassificationDraft.trim()}
                        onClick={applyBatchClassifications}
                      >
                        应用
                      </button>
                    </div>
                  )}
                </div>
              )}

              <ul className="library-folder-card-grid" aria-label="全部文件夹">
                {visibleFolderCollections.map((collection, index) => {
                  const pageCount = folderPageCount(collection);
                  const recentNotebook = collection.notebooks[0];
                  const recentArticle = recentArticleFor(collection);
                  const CollectionIcon =
                    FOLDER_ICONS[collection.profile.icon];
                  const isSelected = selectedFolderKeys.has(collection.key);

                  return (
                    <li
                      key={collection.key}
                      style={
                          {
                          ...folderTransitionStyle(
                            collection.profile.color,
                            collection.key
                          ),
                          "--folder-card-delay": `${index * 42}ms`
                        } as CSSProperties
                      }
                    >
                      <article
                        className={`library-folder-card${selectionMode ? " is-selection-mode" : ""}${isSelected ? " is-selected" : ""}`}
                        data-folder-transition-key={collection.key}
                      >
                        <button
                          className="library-folder-card-open"
                          type="button"
                          aria-label={
                            selectionMode
                              ? `${isSelected ? "取消选择" : "选择"}文件夹：${collection.profile.name}`
                              : `打开文件夹：${collection.profile.name}`
                          }
                          aria-pressed={selectionMode ? isSelected : undefined}
                          onClick={() => {
                            if (selectionMode) {
                              toggleFolderSelection(collection.key);
                            } else {
                              navigateToFolder(collection.key);
                            }
                          }}
                        >
                          <span
                            className="library-folder-card-spine"
                            aria-hidden="true"
                          >
                            {selectionMode && <CollectionIcon size={24} />}
                          </span>
                          <span className="library-folder-card-content">
                            <span className="library-folder-card-heading">
                              <span>
                                <strong>{collection.profile.name}</strong>
                                <small>
                                  {collection.notebooks.length} 篇笔记 ·{" "}
                                  {pageCount} 个页面
                                </small>
                              </span>
                            </span>

                            <span className="library-folder-classifications">
                              {collection.profile.classifications.map(
                                (classification) => (
                                  <span key={classification}>
                                    {classification}
                                  </span>
                                )
                              )}
                            </span>

                            <span className="library-folder-card-description">
                              {collection.profile.description}
                            </span>

                            <span className="library-folder-card-information">
                              <span className="library-folder-card-preview">
                                <small>集合内容</small>
                                {collection.notebooks
                                  .slice(0, 2)
                                  .map((notebook) => (
                                    <span key={notebook.id}>
                                      {notebook.title}
                                    </span>
                                  ))}
                              </span>

                              <span className="library-folder-card-recent">
                                <BookOpenText aria-hidden="true" size={15} />
                                <span>
                                  <small>最近打开</small>
                                  <strong>
                                    {recentArticle?.title ??
                                      recentNotebook?.title ??
                                      "暂无阅读记录"}
                                  </strong>
                                </span>
                                {recentNotebook && (
                                  <time dateTime={recentNotebook.updatedAt}>
                                    {formatFolderActivity(
                                      recentNotebook.updatedAt
                                    )}
                                  </time>
                                )}
                              </span>
                            </span>
                          </span>
                        </button>
                        {!selectionMode && (
                          <button
                            className="library-folder-edit library-folder-card-icon-edit"
                            type="button"
                            aria-label={`编辑文件夹属性：${collection.profile.name}`}
                            onClick={() => openFolderEditor(collection)}
                          >
                            <CollectionIcon aria-hidden="true" size={24} />
                          </button>
                        )}
                        {selectionMode && (
                          <span
                            className="library-folder-selection-mark"
                            aria-hidden="true"
                          >
                            {isSelected && <Check size={15} strokeWidth={2.5} />}
                          </span>
                        )}
                      </article>
                    </li>
                  );
                })}
              </ul>
              {!visibleFolderCollections.length && (
                <div className="library-folder-search-empty" role="status">
                  <Search aria-hidden="true" size={20} />
                  <strong>没有找到匹配的文件夹</strong>
                  <span>换一个名称、归类或笔记标题再试。</span>
                  <button type="button" onClick={() => setFolderQuery("")}>
                    清除查找
                  </button>
                </div>
              )}
            </div>
          )
        ) : (
          <EmptyLibraryState
            title={copy.emptyTitle}
            description={copy.emptyDescription}
          />
        ))}

      {folderDraft && (
        <dialog
          ref={folderEditorRef}
          className="folder-editor-dialog"
          aria-labelledby="folder-editor-title"
          onCancel={(event) => {
            event.preventDefault();
            closeFolderEditor();
          }}
          onClick={(event) => {
            if (event.target === folderEditorRef.current) closeFolderEditor();
          }}
        >
          <form
            className="folder-editor-panel"
            onSubmit={(event) => {
              event.preventDefault();
              saveFolderProfile();
            }}
          >
            <header className="folder-editor-header">
              <div>
                <span>
                  {folderEditorMode === "create"
                    ? "NEW COLLECTION"
                    : "COLLECTION PROFILE"}
                </span>
                <h3 id="folder-editor-title">
                  {folderEditorMode === "create"
                    ? "新建文件夹"
                    : "编辑文件夹属性"}
                </h3>
                <p>
                  {folderEditorMode === "create"
                    ? "先设置集合的基础信息，创建后即可继续添加笔记。"
                    : "这些设置只描述集合，不会改变内部笔记的标签。"}
                </p>
              </div>
              <button
                className="folder-editor-close"
                type="button"
                aria-label="关闭文件夹编辑"
                onClick={closeFolderEditor}
              >
                <X aria-hidden="true" size={17} />
              </button>
            </header>

            <div className="folder-editor-body">
              <div className="folder-editor-fields">
                <label className="folder-editor-field">
                  <span>名称</span>
                  <input
                    autoFocus
                    required
                    maxLength={40}
                    value={folderDraft.name}
                    onChange={(event) =>
                      setFolderDraft({
                        ...folderDraft,
                        name: event.target.value
                      })
                    }
                  />
                </label>

                <fieldset className="folder-editor-field folder-color-field">
                  <legend>颜色</legend>
                  <div className="folder-color-options">
                    {FOLDER_COLORS.map((color) => (
                      <button
                        className={
                          folderDraft.color.toLocaleLowerCase() ===
                          color.toLocaleLowerCase()
                            ? "is-active"
                            : undefined
                        }
                        type="button"
                        aria-label={`选择颜色 ${color}`}
                        aria-pressed={
                          folderDraft.color.toLocaleLowerCase() ===
                          color.toLocaleLowerCase()
                        }
                        key={color}
                        style={{ backgroundColor: color }}
                        onClick={() =>
                          setFolderDraft({ ...folderDraft, color })
                        }
                      />
                    ))}
                    <label className="folder-custom-color">
                      <input
                        type="color"
                        value={folderDraft.color}
                        onChange={(event) =>
                          setFolderDraft({
                            ...folderDraft,
                            color: event.target.value.toUpperCase()
                          })
                        }
                      />
                      <span>自定义</span>
                    </label>
                  </div>
                </fieldset>

                <fieldset className="folder-editor-field folder-icon-field">
                  <legend>应用内图标</legend>
                  <div className="folder-icon-search">
                    <Search aria-hidden="true" size={14} />
                    <input
                      aria-label="查找文件夹图标"
                      value={iconQuery}
                      placeholder="搜索图标名称"
                      onChange={(event) => setIconQuery(event.target.value)}
                    />
                    <span
                      className="folder-icon-search-count"
                      aria-live="polite"
                    >
                      {visibleIconOptions.length}/{FOLDER_ICON_OPTIONS.length}
                    </span>
                    {iconQuery && (
                      <button
                        type="button"
                        aria-label="清除图标查找"
                        onClick={() => setIconQuery("")}
                      >
                        <X aria-hidden="true" size={13} />
                      </button>
                    )}
                  </div>
                  <div className="folder-icon-options">
                    {visibleIconOptions.map((option) => {
                      const OptionIcon = option.icon;
                      return (
                        <button
                          className={
                            folderDraft.icon === option.id
                              ? "is-active"
                              : undefined
                          }
                          type="button"
                          aria-label={`使用${option.label}图标`}
                          title={option.label}
                          aria-pressed={folderDraft.icon === option.id}
                          key={option.id}
                          onClick={() =>
                            setFolderDraft({
                              ...folderDraft,
                              icon: option.id
                            })
                          }
                        >
                          <OptionIcon aria-hidden="true" size={20} />
                        </button>
                      );
                    })}
                  </div>
                  {!visibleIconOptions.length && (
                    <small>没有匹配的图标，换一个关键词再试。</small>
                  )}
                </fieldset>

                <aside
                  className="folder-editor-preview"
                  aria-label="文件夹属性预览"
                  style={folderAccentStyle(folderDraft.color)}
                >
                  <span
                    className="folder-editor-preview-icon"
                    aria-hidden="true"
                  >
                    {(() => {
                      const PreviewIcon = FOLDER_ICONS[folderDraft.icon];
                      return <PreviewIcon size={25} />;
                    })()}
                  </span>
                  <span>文件夹预览</span>
                  <strong>{folderDraft.name || folderDraft.key}</strong>
                  <div className="library-folder-classifications">
                    {classificationDraft
                      .split(/[,，]/)
                      .map((classification) => classification.trim())
                      .filter(Boolean)
                      .slice(0, 3)
                      .map((classification, index) => (
                        <span key={`${classification}-${index}`}>
                          {classification}
                        </span>
                      ))}
                  </div>
                  <p>
                    {folderDraft.description ||
                      "添加一段说明，帮助你快速判断这个集合收录什么内容。"}
                  </p>
                </aside>
              </div>

              <div className="folder-editor-meta-fields">
                <label className="folder-editor-field">
                  <span>文件夹归类</span>
                  <input
                    value={classificationDraft}
                    placeholder="例如：语言底层，C++"
                    onChange={(event) =>
                      setClassificationDraft(event.target.value)
                    }
                  />
                  <small>使用逗号分隔，最多保留 6 项。</small>
                </label>

                <label className="folder-editor-field">
                  <span>集合说明</span>
                  <textarea
                    maxLength={120}
                    rows={3}
                    value={folderDraft.description}
                    onChange={(event) =>
                      setFolderDraft({
                        ...folderDraft,
                        description: event.target.value
                      })
                    }
                  />
                </label>
              </div>
            </div>

            <footer className="folder-editor-footer">
              {folderEditorMode === "edit" &&
              folderDraft.key !== UNFILED_FOLDER_KEY ? (
                <button
                  className="folder-editor-delete"
                  type="button"
                  onClick={() => {
                    const key = folderDraft.key;
                    closeFolderEditor();
                    requestFolderDeletion([key]);
                  }}
                >
                  <Trash2 aria-hidden="true" size={15} />
                  删除文件夹
                </button>
              ) : (
                <span />
              )}
              <div>
                <button
                  className="button secondary"
                  type="button"
                  onClick={closeFolderEditor}
                >
                  取消
                </button>
                <button className="button primary" type="submit">
                  <Check aria-hidden="true" size={16} />
                  {folderEditorMode === "create" ? "创建文件夹" : "保存属性"}
                </button>
              </div>
            </footer>
          </form>
        </dialog>
      )}

      {deleteFolderKeys && (
        <dialog
          ref={deleteFolderDialogRef}
          className="folder-delete-dialog"
          aria-labelledby="folder-delete-title"
          onCancel={(event) => {
            event.preventDefault();
            closeDeleteConfirmation();
          }}
          onClick={(event) => {
            if (event.target === deleteFolderDialogRef.current) {
              closeDeleteConfirmation();
            }
          }}
        >
          <form
            className="folder-delete-panel"
            onSubmit={(event) => {
              event.preventDefault();
              confirmFolderDeletion();
            }}
          >
            <span className="folder-delete-icon" aria-hidden="true">
              <Trash2 size={20} />
            </span>
            <div>
              <span>SAFE DELETE</span>
              <h3 id="folder-delete-title">
                删除 {foldersPendingDeletion.length} 个文件夹？
              </h3>
              <p>
                文件夹属性会被移除。其中{" "}
                <strong>{notebooksPendingReassignment} 篇笔记</strong>{" "}
                将移动到“未归档”，笔记和文章内容不会被删除。
              </p>
              <div className="folder-delete-list">
                {foldersPendingDeletion.slice(0, 4).map((collection) => (
                  <span key={collection.key}>{collection.profile.name}</span>
                ))}
                {foldersPendingDeletion.length > 4 && (
                  <span>另有 {foldersPendingDeletion.length - 4} 个</span>
                )}
              </div>
            </div>
            <footer>
              <button
                className="button secondary"
                type="button"
                onClick={closeDeleteConfirmation}
              >
                取消
              </button>
              <button className="folder-delete-confirm" type="submit">
                确认删除
              </button>
            </footer>
          </form>
        </dialog>
      )}
    </section>
  );
}
