import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  FolderTree,
  Hash,
  LibraryBig,
  Star
} from "lucide-react";
import type { ArticleNode, Notebook } from "../types";

export type HomeLibrarySection = "folders" | "tags" | "favorites";

export interface HomeLibraryViewProps {
  section: HomeLibrarySection;
  notebooks: readonly Notebook[];
  articles: Readonly<Record<string, ArticleNode>>;
  renderNotebook: (notebook: Notebook) => ReactNode;
}

interface NotebookGroup {
  key: string;
  label: string;
  notebooks: Notebook[];
}

const SECTION_COPY: Record<
  HomeLibrarySection,
  {
    eyebrow: string;
    title: string;
    description: string;
    emptyTitle: string;
    emptyDescription: string;
  }
> = {
  folders: {
    eyebrow: "资料库 / 文件夹",
    title: "按主题归档",
    description: "沿着已有目录回到一组相关笔记，继续整理同一条知识脉络。",
    emptyTitle: "还没有可归档的笔记",
    emptyDescription: "创建第一篇笔记后，它会按照所属目录显示在这里。"
  },
  tags: {
    eyebrow: "资料库 / 标签",
    title: "从关键词进入",
    description: "用标签横向穿过不同目录，查看围绕同一概念积累的内容。",
    emptyTitle: "还没有可用标签",
    emptyDescription: "为笔记添加标签后，就能从这里按关键词快速聚合。"
  },
  favorites: {
    eyebrow: "资料库 / 收藏",
    title: "留住常看的内容",
    description: "把值得反复返回的笔记集中在一个更短的阅读清单里。",
    emptyTitle: "收藏区还是空的",
    emptyDescription: "有笔记后，这里会先展示一组便于体验的演示收藏。"
  }
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
  articles,
  renderNotebook
}: HomeLibraryViewProps) {
  const copy = SECTION_COPY[section];
  const [activeFolderKey, setActiveFolderKey] = useState<string | null>(null);

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

  const activeFolder = useMemo(
    () =>
      activeFolderKey
        ? folderGroups.find((group) => group.key === activeFolderKey) ?? null
        : null,
    [activeFolderKey, folderGroups]
  );

  useEffect(() => {
    if (section !== "folders" || (activeFolderKey && !activeFolder)) {
      setActiveFolderKey(null);
    }
  }, [activeFolder, activeFolderKey, section]);

  const tagGroups = useMemo(
    () => createGroups(notebooks, (notebook) => notebook.tags),
    [notebooks]
  );

  const favoriteNotebooks = useMemo(() => {
    const sorted = [...notebooks].sort(compareNotebookRecency);
    const amberFavorites = sorted.filter(
      (notebook) => notebook.accent === "amber"
    );
    const selectedIds = new Set(amberFavorites.map((notebook) => notebook.id));

    // 数据模型尚未记录收藏状态：稳定地选取琥珀色笔记，并用最近更新项补足演示清单。
    const recentFill = sorted
      .filter((notebook) => !selectedIds.has(notebook.id))
      .slice(0, Math.max(0, 3 - amberFavorites.length));

    return [...amberFavorites, ...recentFill];
  }, [notebooks]);

  const sectionCount =
    section === "folders"
      ? folderGroups.length
      : section === "tags"
        ? tagGroups.length
        : favoriteNotebooks.length;
  const countLabel =
    section === "folders"
      ? `${sectionCount} 个文件夹`
      : section === "tags"
        ? `${sectionCount} 个标签`
        : `${sectionCount} 篇笔记`;

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
        (folderGroups.length ? (
          activeFolder ? (
            <div className="library-folder-browser">
              <aside className="library-folder-rail" aria-label="文件夹导航">
                <button
                  className="library-folder-back"
                  type="button"
                  onClick={() => setActiveFolderKey(null)}
                >
                  <ChevronLeft aria-hidden="true" size={16} />
                  <span>全部文件夹</span>
                </button>

                <div className="library-folder-rail-summary">
                  <span>COLLECTIONS</span>
                  <strong>{folderGroups.length}</strong>
                </div>

                <nav aria-label="切换文件夹">
                  {folderGroups.map((group) => (
                    <button
                      className={
                        group.key === activeFolder.key ? "is-active" : undefined
                      }
                      type="button"
                      aria-current={
                        group.key === activeFolder.key ? "page" : undefined
                      }
                      key={group.key}
                      onClick={() => setActiveFolderKey(group.key)}
                    >
                      <FolderTree aria-hidden="true" size={15} />
                      <span>{group.label}</span>
                      <small>{group.notebooks.length}</small>
                    </button>
                  ))}
                </nav>
              </aside>

              <section
                className="library-folder-detail"
                aria-labelledby="library-active-folder-title"
              >
                <header className="library-folder-detail-header">
                  <span className="library-folder-detail-icon" aria-hidden="true">
                    <FolderOpen size={24} />
                  </span>
                  <div>
                    <span>当前文件夹</span>
                    <h3 id="library-active-folder-title">
                      {activeFolder.label}
                    </h3>
                    <p>
                      {activeFolder.notebooks.length} 篇笔记 ·{" "}
                      {activeFolder.notebooks.reduce(
                        (total, notebook) =>
                          total +
                          (articleCountByRoot.get(notebook.rootId) ?? 0),
                        0
                      )}{" "}
                      个页面
                    </p>
                  </div>
                </header>

                <NotebookCollection
                  notebooks={activeFolder.notebooks}
                  renderNotebook={renderNotebook}
                />
              </section>
            </div>
          ) : (
            <div className="library-folder-overview">
              <div className="library-folder-definition">
                <FolderOpen aria-hidden="true" size={18} />
                <p>
                  <strong>文件夹是内容集合</strong>
                  每个文件夹可以包含多篇笔记及其关联页面。选择一个集合，进入集中浏览。
                </p>
              </div>

              <ul className="library-folder-card-grid" aria-label="全部文件夹">
                {folderGroups.map((group) => {
                  const pageCount = group.notebooks.reduce(
                    (total, notebook) =>
                      total + (articleCountByRoot.get(notebook.rootId) ?? 0),
                    0
                  );

                  return (
                    <li key={group.key}>
                      <button
                        className="library-folder-card"
                        type="button"
                        aria-label={`打开文件夹：${group.label}`}
                        onClick={() => setActiveFolderKey(group.key)}
                      >
                        <span className="library-folder-card-top">
                          <span aria-hidden="true">
                            <FolderOpen size={22} />
                          </span>
                          <small>{group.notebooks.length} 篇笔记</small>
                        </span>
                        <strong>{group.label}</strong>
                        <span className="library-folder-card-meta">
                          {pageCount} 个页面
                        </span>
                        <span className="library-folder-card-preview">
                          {group.notebooks.slice(0, 3).map((notebook) => (
                            <span key={notebook.id}>{notebook.title}</span>
                          ))}
                        </span>
                        <span className="library-folder-card-action">
                          查看文件夹
                          <ChevronRight aria-hidden="true" size={15} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        ) : (
          <EmptyLibraryState
            title={copy.emptyTitle}
            description={copy.emptyDescription}
          />
        ))}

      {section === "tags" &&
        (tagGroups.length ? (
          <ul className="library-tag-list" aria-label="标签索引">
            {tagGroups.map((group) => (
              <li className="library-tag-item" key={group.key}>
                <article
                  className="library-tag-group"
                  aria-labelledby={`library-tag-${group.key}`}
                >
                  <header className="library-tag-header">
                    <span className="library-tag-symbol" aria-hidden="true">
                      <Hash size={17} />
                    </span>
                    <div>
                      <h3 id={`library-tag-${group.key}`}>{group.label}</h3>
                      <p>{group.notebooks.length} 篇相关笔记</p>
                    </div>
                  </header>
                  <NotebookCollection
                    notebooks={group.notebooks}
                    renderNotebook={renderNotebook}
                  />
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyLibraryState
            title={copy.emptyTitle}
            description={copy.emptyDescription}
          />
        ))}

      {section === "favorites" &&
        (favoriteNotebooks.length ? (
          <div className="library-favorite-content">
            <aside className="library-favorite-demo-note" aria-label="演示说明">
              <Star aria-hidden="true" size={17} />
              <p>
                <strong>演示收藏</strong>
                当前数据尚未保存收藏状态，暂以琥珀色标记与最近更新内容组成此清单。
              </p>
            </aside>
            <div className="library-favorite-list">
              <div className="library-favorite-list-heading">
                <FileText aria-hidden="true" size={18} />
                <h3>收藏笔记</h3>
              </div>
              <NotebookCollection
                notebooks={favoriteNotebooks}
                renderNotebook={renderNotebook}
              />
            </div>
          </div>
        ) : (
          <EmptyLibraryState
            title={copy.emptyTitle}
            description={copy.emptyDescription}
          />
        ))}
    </section>
  );
}
