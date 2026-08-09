import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import { flushSync } from "react-dom";
import {
  AlignLeft,
  ArrowLeft,
  BookOpenText,
  Check,
  CircleHelp,
  CircleStop,
  Code2,
  Download,
  FileInput,
  GalleryHorizontalEnd,
  GitCompareArrows,
  Highlighter,
  Home,
  Languages,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  Network,
  NotebookPen,
  Quote,
  Save,
  Sparkles,
  Tag
} from "lucide-react";
import { useAppStore } from "../store/AppStore";
import type {
  ArticleNode,
  GenerationType,
  InlineFormatCommand,
  MarkdownFormatType,
  SelectionState
} from "../types";
import type { ContentTerms } from "../utils/contentDisplay";
import {
  loadContentZoom,
  saveContentZoom,
  stepContentZoom
} from "../utils/contentZoom";
import {
  loadGenerationTypes,
  type GenerationTypeConfig,
  type GenerationTypeIconId
} from "../utils/generationConfig";
import {
  formatShortcut,
  matchesShortcut
} from "../utils/shortcuts";
import type { ShortcutPreferences } from "../utils/shortcuts";
import {
  reconcileReadingTrail,
  type ReadingPathMode
} from "../utils/readingPathPreferences";
import { MarkdownEditor } from "./MarkdownEditor";
import { Brand } from "./Brand";
import { InlineFormattingToolbar } from "./InlineFormattingToolbar";
import { TopologyPanel } from "./TopologyPanel";

const READING_PATH_DEFAULT_WIDTH = 246;
const READING_PATH_MIN_WIDTH = 190;
const READING_PATH_MAX_WIDTH = 420;
const READING_PATH_STORAGE_KEY = "annota:reading-path-width";
type ArticleMotion = "settle" | "forward" | "back";
const generationActionIcons: Record<GenerationTypeIconId, typeof Sparkles> = {
  root: BookOpenText,
  explain: MessageSquareText,
  translate: Languages,
  summary: AlignLeft,
  highlight: Highlighter,
  question: CircleHelp,
  terms: Tag,
  compare: GitCompareArrows,
  code: Code2,
  checklist: ListChecks,
  note: NotebookPen,
  source: Quote,
  flashcard: GalleryHorizontalEnd
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (
    updateCallback: () => void
  ) => { finished: Promise<void> };
};

const READER_INTERACTIVE_TARGETS = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='separator']",
  ".reading-block",
  ".document-editor",
  ".inline-formatting-toolbar"
].join(", ");

function clampReadingPathWidth(width: number) {
  return Math.min(READING_PATH_MAX_WIDTH, Math.max(READING_PATH_MIN_WIDTH, Math.round(width)));
}

function readStoredPathWidth() {
  const stored = Number(window.localStorage.getItem(READING_PATH_STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0
    ? clampReadingPathWidth(stored)
    : READING_PATH_DEFAULT_WIDTH;
}

function rootPixelValue(property: string, fallback: number) {
  const value = Number.parseFloat(
    window.getComputedStyle(document.documentElement).getPropertyValue(property)
  );
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function articleContentZoomStyle(zoom: number) {
  const scaled = (pixels: number) =>
    `${Math.round(pixels * zoom * 100) / 100}px`;
  const readingFontSize = rootPixelValue("--reading-font-size", 16);
  return {
    "--reader-content-scale": String(zoom),
    "--reader-reading-font-size": scaled(readingFontSize),
    "--reader-body-line-height": scaled(readingFontSize * 1.45),
    "--reader-code-font-size": scaled(rootPixelValue("--code-font-size", 13)),
    "--reader-text-xs": scaled(12),
    "--reader-text-sm": scaled(14),
    "--reader-text-base": scaled(16),
    "--reader-text-lg": scaled(18),
    "--reader-text-xl": scaled(20),
    "--reader-text-2xl": scaled(24),
    "--reader-text-3xl": scaled(32),
    "--reader-title-min": scaled(32),
    "--reader-title-max": scaled(48)
  } as CSSProperties;
}

function descendants(id: string, articles: Record<string, ArticleNode>) {
  const seen = new Set<string>();
  const visit = (nodeId: string) => {
    articles[nodeId]?.childIds.forEach((childId) => {
      if (seen.has(childId)) return;
      seen.add(childId);
      visit(childId);
    });
  };
  visit(id);
  return seen.size;
}

function resolveNodeType(
  article: ArticleNode,
  nodeTypes: readonly GenerationTypeConfig[]
): GenerationTypeConfig {
  const typeById = new Map(nodeTypes.map((type) => [type.id, type]));
  const rootType = typeById.get("root") ?? nodeTypes[0];
  const sourceType = article.source?.generationType
    ? typeById.get(article.source.generationType)
    : undefined;
  const relationType = nodeTypes.find(
    (type) => type.relationLabel === article.type || type.name === article.type
  );
  const configuredType = article.parentId === null ? rootType : sourceType ?? relationType;
  if (configuredType) return configuredType;

  const appearance = article.appearance;
  const fallback = typeById.get("explain") ?? rootType ?? nodeTypes[0];
  if (!appearance || !fallback) return nodeTypes[0];
  return {
    ...fallback,
    id: appearance.typeId,
    name: article.type,
    relationLabel: article.type,
    icon: appearance.icon,
    cardVariant: appearance.cardVariant,
    color: appearance.color
  };
}

export function ReaderPage({
  readingPathMode,
  shortcuts,
  terms
}: {
  readingPathMode: ReadingPathMode;
  shortcuts: ShortcutPreferences;
  terms: ContentTerms;
}) {
  const {
    data,
    currentArticle,
    currentNotebook,
    navigateTo,
    goHome,
    touchArticle,
    createRootArticle,
    importPackage,
    exportCurrentTree,
    startGeneration,
    cancelGeneration,
    topologyGraph,
    topologyError,
    createManualTopologyNode,
    updateManualTopologyNode,
    removeManualTopologyNode,
    createTopologyRelation,
    removeTopologyRelation,
    updateTopologyInteraction
  } = useAppStore();
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [formatCommand, setFormatCommand] = useState<InlineFormatCommand | null>(null);
  const [editorResetVersion, setEditorResetVersion] = useState(0);
  const [saveState, setSaveState] = useState("已保存到本机");
  const [fullTopology, setFullTopology] = useState(false);
  const [sharedTopologyTransition, setSharedTopologyTransition] = useState(false);
  const [fullWidthArticle, setFullWidthArticle] = useState(false);
  const [notice, setNotice] = useState("");
  const [readingPathWidth, setReadingPathWidth] = useState(readStoredPathWidth);
  const [contentZoom, setContentZoom] = useState(loadContentZoom);
  const allNodeTypes = useMemo(() => loadGenerationTypes(), []);
  const generationTypes = useMemo(
    () =>
      allNodeTypes.filter(
        (type) => type.executionMode === "ai" && type.enabled
      ),
    [allNodeTypes]
  );
  const [resizingPath, setResizingPath] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const readerSurfaceRef = useRef<HTMLElement>(null);
  const contentZoomRef = useRef(contentZoom);
  const noticeTimer = useRef<number>();
  const formatCommandSequence = useRef(0);
  const pathResizeRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [articleTransition, setArticleTransition] = useState<{
    articleId: string | null;
    motion: ArticleMotion;
  }>(() => ({
    articleId: currentArticle?.id ?? null,
    motion: "settle"
  }));

  const path = useMemo(() => {
    if (!currentArticle) return [];
    const result: ArticleNode[] = [];
    let cursor: ArticleNode | undefined = currentArticle;
    while (cursor) {
      result.unshift(cursor);
      cursor = cursor.parentId ? data.articles[cursor.parentId] : undefined;
    }
    return result;
  }, [currentArticle, data.articles]);
  const currentPathIds = useMemo(() => path.map((article) => article.id), [path]);
  const [retainedPathIds, setRetainedPathIds] = useState<readonly string[]>(
    () => currentPathIds
  );
  const resolvedRetainedPathIds = reconcileReadingTrail(
    retainedPathIds,
    currentPathIds
  );
  const displayedPath = useMemo(
    () =>
      (readingPathMode === "retain-branch"
        ? resolvedRetainedPathIds
        : currentPathIds
      )
        .map((id) => data.articles[id])
        .filter((article): article is ArticleNode => Boolean(article)),
    [
      currentPathIds,
      data.articles,
      readingPathMode,
      resolvedRetainedPathIds
    ]
  );

  useEffect(() => {
    if (resolvedRetainedPathIds !== retainedPathIds) {
      setRetainedPathIds(resolvedRetainedPathIds);
    }
  }, [resolvedRetainedPathIds, retainedPathIds]);

  const childNodes = useMemo(
    () =>
      currentArticle
        ? currentArticle.childIds
            .map((id) => data.articles[id])
            .filter((item): item is ArticleNode => Boolean(item))
        : [],
    [currentArticle, data.articles]
  );

  const activeJobs = useMemo(
    () => data.jobs.filter((job) => job.parentId === currentArticle?.id),
    [currentArticle?.id, data.jobs]
  );

  let articleMotion = articleTransition.motion;
  if (currentArticle && currentArticle.id !== articleTransition.articleId) {
    articleMotion =
      articleTransition.articleId &&
      currentArticle.childIds.includes(articleTransition.articleId)
        ? "back"
        : articleTransition.articleId
          ? "forward"
          : "settle";
    setArticleTransition({
      articleId: currentArticle.id,
      motion: articleMotion
    });
  }

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2600);
  }, []);

  const handleContentZoomWheel = useCallback(
    (event: WheelEvent) => {
      if (!event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      const nextZoom = stepContentZoom(contentZoomRef.current, event.deltaY);
      if (nextZoom === contentZoomRef.current) return;
      const savedZoom = saveContentZoom(nextZoom);
      contentZoomRef.current = savedZoom;
      setContentZoom(savedZoom);
      showNotice(`显示比例 ${Math.round(savedZoom * 100)}%`);
    },
    [showNotice]
  );

  const setTopologyFullscreen = useCallback(
    (value: boolean) => {
      if (value === fullTopology) return;
      const panel = document.getElementById("article-topology-panel");
      const shell = panel?.parentElement;
      const transitionDocument = document as ViewTransitionDocument;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      const smallTopologyExpanded = shell?.dataset.smallExpanded === "true";
      const useSharedTransition =
        (value ? smallTopologyExpanded : sharedTopologyTransition && smallTopologyExpanded) &&
        Boolean(transitionDocument.startViewTransition) &&
        !reduceMotion;

      if (!useSharedTransition || !transitionDocument.startViewTransition) {
        if (!value) {
          setSharedTopologyTransition(false);
        }
        setFullTopology(value);
        return;
      }

      const root = document.documentElement;
      root.classList.add("is-topology-transitioning");
      root.classList.toggle("is-topology-transitioning-back", !value);
      const transition = transitionDocument.startViewTransition(() => {
        flushSync(() => {
          setSharedTopologyTransition(value);
          setFullTopology(value);
        });
      });
      void transition.finished.finally(() => {
        root.classList.remove(
          "is-topology-transitioning",
          "is-topology-transitioning-back"
        );
      });
    },
    [fullTopology, sharedTopologyTransition]
  );

  useEffect(() => {
    setSelection(null);
    setFormatCommand(null);
    setSaveState("已保存到本机");
  }, [currentArticle?.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        (target.matches("textarea, input") || target.isContentEditable);
      if (
        matchesShortcut(event, shortcuts["go-parent"]) &&
        currentArticle?.parentId
      ) {
        event.preventDefault();
        navigateTo(currentArticle.parentId);
      }
      if (matchesShortcut(event, shortcuts["toggle-topology"])) {
        event.preventDefault();
        setTopologyFullscreen(!fullTopology);
      }
      if (
        matchesShortcut(event, shortcuts["go-root"]) &&
        !editing &&
        currentNotebook
      ) {
        event.preventDefault();
        navigateTo(currentArticle?.rootId ?? currentNotebook.rootId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    currentArticle?.parentId,
    currentArticle?.rootId,
    currentNotebook,
    fullTopology,
    navigateTo,
    setTopologyFullscreen,
    shortcuts
  ]);

  useEffect(() => {
    const surface = readerSurfaceRef.current;
    if (!surface) return;
    surface.addEventListener("wheel", handleContentZoomWheel, { passive: false });
    return () => surface.removeEventListener("wheel", handleContentZoomWheel);
  }, [currentArticle?.id, handleContentZoomWheel]);

  if (!currentArticle || !currentNotebook) return null;

  const setAndStorePathWidth = (width: number) => {
    const nextWidth = clampReadingPathWidth(width);
    setReadingPathWidth(nextWidth);
    window.localStorage.setItem(READING_PATH_STORAGE_KEY, String(nextWidth));
  };

  const handlePathPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pathResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: readingPathWidth
    };
    setResizingPath(true);
  };

  const handlePathPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = pathResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    setReadingPathWidth(clampReadingPathWidth(resize.startWidth + event.clientX - resize.startX));
  };

  const finishPathResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = pathResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const finalWidth =
      event.type === "pointercancel"
        ? readingPathWidth
        : clampReadingPathWidth(resize.startWidth + event.clientX - resize.startX);
    pathResizeRef.current = null;
    setResizingPath(false);
    setReadingPathWidth(finalWidth);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    window.localStorage.setItem(READING_PATH_STORAGE_KEY, String(finalWidth));
  };

  const handlePathKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 24 : 8;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setAndStorePathWidth(readingPathWidth - step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setAndStorePathWidth(readingPathWidth + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      setAndStorePathWidth(READING_PATH_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      setAndStorePathWidth(READING_PATH_MAX_WIDTH);
    }
  };

  const runGeneration = (type: GenerationType) => {
    if (!selection?.text) {
      showNotice("先在一个正文块内选择要处理的文字。");
      return;
    }
    const result = startGeneration(
      currentArticle.id,
      selection,
      type
    );
    showNotice(result.message);
  };

  const applyInlineFormat = (type: MarkdownFormatType, color?: string) => {
    if (!selection || selection.start === selection.end) {
      showNotice("先在正文中选择要设置格式的文字。");
      return;
    }
    formatCommandSequence.current += 1;
    setFormatCommand({
      id: formatCommandSequence.current,
      selection,
      type,
      color
    });
    setSaveState("保存中…");
  };

  const handleReaderSurfacePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(READER_INTERACTIVE_TARGETS)) {
      return;
    }
    setSelection(null);
    setFormatCommand(null);
    setEditorResetVersion((version) => version + 1);
    window.getSelection()?.removeAllRanges();
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    const result = await importPackage(await file.text(), file.name);
    showNotice(result.message);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div
      className={`reader-app${resizingPath ? " is-resizing-path" : ""}`}
      style={{ "--reading-path-width": `${readingPathWidth}px` } as CSSProperties}
    >
      <header className="reader-topbar">
        <button
          className="reader-home-button"
          type="button"
          onClick={goHome}
          aria-label={`返回${terms.home}`}
        >
          <Brand compact />
          <Home aria-hidden="true" size={16} />
        </button>

        <div className="reader-meta">
          <span className="type-badge">{currentArticle.type}</span>
          <span>第 {path.length} 层</span>
          <span>{childNodes.length} 个{terms.subNotes}</span>
        </div>

        <div className="generation-actions" aria-label={terms.highlightCreate}>
          {generationTypes.map((generationType) => {
            const GenerationIcon = generationActionIcons[generationType.icon];
            return (
              <button
                className="generation-button"
                type="button"
                disabled={!selection}
                onClick={() => runGeneration(generationType.id)}
                title={
                  selection
                    ? `${generationType.name}选中文字`
                    : "先选择正文文字"
                }
                key={generationType.id}
                style={
                  {
                    "--generation-action-color": generationType.color
                  } as CSSProperties
                }
              >
                <GenerationIcon aria-hidden="true" size={16} />
                {generationType.name}
              </button>
            );
          })}
        </div>

        <div className="reader-actions">
          <span className="save-status">
            <Check aria-hidden="true" size={14} />
            {saveState}
          </span>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept=".md,.markdown,.txt,.annota,.json,text/plain,text/markdown,application/json"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <button className="icon-button" type="button" onClick={() => fileRef.current?.click()} title="导入材料">
            <FileInput aria-hidden="true" size={17} />
            <span className="sr-only">导入材料</span>
          </button>
          <button className="icon-button" type="button" onClick={() => void exportCurrentTree()} title="导出当前知识树">
            <Download aria-hidden="true" size={17} />
            <span className="sr-only">导出当前知识树</span>
          </button>
        </div>
      </header>

      <main className="reader-workspace">
        <aside className="reading-path" aria-label="阅读路径">
          <header>
            <span>阅读路径</span>
            <small>{displayedPath.length} 层</small>
          </header>
          <div className="path-stack">
            {displayedPath.map((article, index) => {
              const isCurrent = article.id === currentArticle.id;
              const isRetained = index >= currentPathIds.length;
              const nodeType = resolveNodeType(article, allNodeTypes);
              const NodeIcon = generationActionIcons[nodeType.icon];
              return (
              <div
                className={`path-step is-${nodeType.cardVariant}${
                  isRetained ? " is-retained" : ""
                }`}
                key={article.id}
                data-node-variant={nodeType.cardVariant}
                style={{ "--path-node-color": nodeType.color } as CSSProperties}
              >
                <button
                  className={isCurrent ? "is-current" : ""}
                  type="button"
                  onClick={() => navigateTo(article.id)}
                  aria-current={isCurrent ? "page" : undefined}
                  aria-label={isRetained ? `继续阅读：${article.title}` : undefined}
                >
                  <span className="path-step-marker" aria-hidden="true">
                    <NodeIcon size={17} />
                    <small>{String(index + 1).padStart(2, "0")}</small>
                  </span>
                  <span className="path-step-copy">
                    <strong>{article.title}</strong>
                    <small>
                      <span>{nodeType.name}</span>
                      <span>{article.childIds.length} 个下级</span>
                    </small>
                  </span>
                  {isCurrent && <em className="path-step-status">当前</em>}
                </button>
                {index < displayedPath.length - 1 && <span className="path-line" aria-hidden="true"></span>}
              </div>
              );
            })}
          </div>
          {(() => {
            const nodeType = resolveNodeType(currentArticle, allNodeTypes);
            const NodeIcon = generationActionIcons[nodeType.icon];
            return (
              <div
                className={`path-context is-${nodeType.cardVariant}`}
                style={{ "--path-node-color": nodeType.color } as CSSProperties}
              >
                <span className="path-context-icon" aria-hidden="true">
                  <NodeIcon size={18} />
                </span>
                <span className="path-context-copy">
                  <small>当前节点</small>
                  <strong>{nodeType.name}</strong>
                </span>
                <p>沿阅读路径保留来源与父子关系；节点正文可以独立编辑。</p>
              </div>
            );
          })()}
        </aside>

        <div
          className="reading-path-resizer"
          role="separator"
          aria-label="调整阅读路径宽度"
          aria-orientation="vertical"
          aria-valuemin={READING_PATH_MIN_WIDTH}
          aria-valuemax={READING_PATH_MAX_WIDTH}
          aria-valuenow={readingPathWidth}
          tabIndex={0}
          onDoubleClick={() => setAndStorePathWidth(READING_PATH_DEFAULT_WIDTH)}
          onKeyDown={handlePathKeyDown}
          onPointerDown={handlePathPointerDown}
          onPointerMove={handlePathPointerMove}
          onPointerUp={finishPathResize}
          onPointerCancel={finishPathResize}
        >
          <span aria-hidden="true"></span>
        </div>

        <section
          ref={readerSurfaceRef}
          className="reader-surface"
          aria-label="文章阅读区域"
          onPointerDown={handleReaderSurfacePointerDown}
        >
          <InlineFormattingToolbar
            selection={selection}
            fullWidthArticle={fullWidthArticle}
            onFormat={applyInlineFormat}
            onToggleArticleWidth={() => setFullWidthArticle((value) => !value)}
          />

          <div className="article-scroll-region">
            <article
              className={`article-column${fullWidthArticle ? " is-full-width" : ""}`}
              data-content-zoom={contentZoom}
              data-motion={articleMotion}
              key={currentArticle.id}
              style={articleContentZoomStyle(contentZoom)}
            >
              <header className="article-header">
                <h1>{currentArticle.title}</h1>
              </header>

              <MarkdownEditor
                articleId={currentArticle.id}
                formatCommand={formatCommand}
                resetVersion={editorResetVersion}
                saveShortcut={shortcuts["save-article"]}
                contentZoom={contentZoom}
                onPersist={() => touchArticle(currentArticle.id)}
                onSelection={setSelection}
                onSaveState={setSaveState}
              />

              <footer className="article-footer-nav">
                <button
                  type="button"
                  disabled={!currentArticle.parentId}
                  onClick={() => currentArticle.parentId && navigateTo(currentArticle.parentId)}
                >
                  <ArrowLeft aria-hidden="true" size={16} />
                  阅读上一级
                </button>
                <button
                  type="button"
                  disabled={currentArticle.id === currentArticle.rootId}
                  onClick={() => navigateTo(currentArticle.rootId)}
                >
                  <Home aria-hidden="true" size={16} />
                  回到当前根节点
                </button>
              </footer>
            </article>
          </div>

          <aside
            className="children-column"
            aria-label={`下一级${terms.subNotes}`}
          >
            <header>
              <strong>{currentArticle.title} 的{terms.subNotes}</strong>
              <small>{childNodes.length + activeJobs.length} 个</small>
            </header>

            <div className="children-list">
              {activeJobs.map((job) => (
                <div className="generation-card" key={job.id} role="status">
                  <span
                    className={`child-card-icon${
                      job.status === "failed" ? " is-error" : " is-loading"
                    }`}
                  >
                    {job.status === "failed" ? (
                      <CircleStop aria-hidden="true" size={17} />
                    ) : (
                      <LoaderCircle aria-hidden="true" size={17} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {job.status === "failed"
                        ? `${job.typeName}失败`
                        : `正在${job.typeName}选区`}
                    </strong>
                    <p>“{job.quote.slice(0, 58)}{job.quote.length > 58 ? "…" : ""}”</p>
                    <span>
                      {job.status === "failed"
                        ? job.error ?? "模型服务请求失败"
                        : job.status === "queued"
                          ? "排队中"
                          : `${job.model ?? "模型服务"} · 正在生成`}
                    </span>
                  </div>
                  <button type="button" onClick={() => cancelGeneration(job.id)}>
                    <CircleStop aria-hidden="true" size={15} />
                    {job.status === "failed" ? "关闭" : "取消"}
                  </button>
                </div>
              ))}

              {childNodes.map((child) => (
                <button
                  className="child-card"
                  type="button"
                  key={child.id}
                  aria-label={`打开${terms.subNotes}：${child.title}`}
                  onClick={() => navigateTo(child.id)}
                >
                  <span className="child-card-icon">
                    {child.type === "翻译" ? (
                      <Languages aria-hidden="true" size={17} />
                    ) : (
                      <Sparkles aria-hidden="true" size={17} />
                    )}
                  </span>
                  <span>
                    <strong>{child.title}</strong>
                    <p>{child.summary}</p>
                    <span className="child-card-meta">
                      <span>{child.type}</span>
                      <small>{descendants(child.id, data.articles)} 篇后续</small>
                    </span>
                  </span>
                </button>
              ))}

              {!childNodes.length && !activeJobs.length && (
                <div className="children-empty">
                  <MessageSquareText aria-hidden="true" size={20} />
                  <strong>还没有下一级{terms.subNotes}</strong>
                  <p>在左侧正文中选择一段文字，然后点击顶部任一可生成节点。</p>
                </div>
              )}
            </div>
          </aside>

        </section>
      </main>

      <TopologyPanel
        articles={data.articles}
        rootId={currentNotebook.rootId}
        rootIds={currentNotebook.rootIds ?? [currentNotebook.rootId]}
        currentId={currentArticle.id}
        onNavigate={navigateTo}
        fullScreen={fullTopology}
        sharedTransition={sharedTopologyTransition}
        onFullScreen={setTopologyFullscreen}
        focusShortcut={shortcuts["focus-topology"]}
        pinShortcut={shortcuts["pin-topology"]}
        topologyGraph={topologyGraph}
        topologyError={topologyError}
        onCreateRoot={createRootArticle}
        onCreateManualNode={createManualTopologyNode}
        onUpdateManualNode={updateManualTopologyNode}
        onRemoveManualNode={removeManualTopologyNode}
        onCreateRelation={createTopologyRelation}
        onRemoveRelation={removeTopologyRelation}
        onUpdateInteraction={updateTopologyInteraction}
      />

      {notice && (
        <div className="app-notice" role="status">
          <Save aria-hidden="true" size={15} />
          {notice}
        </div>
      )}

      <div className="reader-shortcut-hint" aria-hidden="true">
        <Network size={14} />
        {formatShortcut(shortcuts["toggle-topology"])} 打开拓扑
      </div>
    </div>
  );
}
