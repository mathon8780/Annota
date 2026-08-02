import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent
} from "react";
import {
  Focus,
  Maximize2,
  Minimize2,
  Network,
  Pin,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type { ArticleNode } from "../types";
import {
  formatShortcut,
  matchesShortcut
} from "../utils/shortcuts";
import type { ShortcutBinding } from "../utils/shortcuts";

interface TopologyPanelProps {
  articles: Record<string, ArticleNode>;
  rootId: string;
  currentId: string;
  onNavigate: (id: string) => void;
  fullScreen: boolean;
  sharedTransition: boolean;
  onFullScreen: (value: boolean) => void;
  focusShortcut: ShortcutBinding;
  pinShortcut: ShortcutBinding;
}

interface Position {
  id: string;
  x: number;
  y: number;
  depth: number;
}

interface TopologySize {
  width: number;
  height: number;
}

interface TopologySizePreference {
  version: 2;
  widthRatio: number;
  heightRatio: number;
}

type ResizeEdge = "left" | "top" | "top-left";
type TopologyFocusMode = "overall" | "current" | null;

const TOPOLOGY_DEFAULT_SIZE = { width: 420, height: 322 };
const TOPOLOGY_MIN_SIZE = { width: 280, height: 220 };
const TOPOLOGY_MAX_SIZE = { width: 720, height: 560 };
const TOPOLOGY_MAX_VIEWPORT_RATIO = { width: 0.62, height: 0.68 };
const TOPOLOGY_LEGACY_REFERENCE_VIEWPORT = { width: 1888, height: 952 };
const TOPOLOGY_SIZE_STORAGE_KEY = "annota:topology-size";
const TOPOLOGY_NODE_WIDTH = 164;
const TOPOLOGY_NODE_HEIGHT = 50;
const TOPOLOGY_CURRENT_FOCUS_SCALE = 0.9;
const TOPOLOGY_MIN_SCALE = 0.18;
const TOPOLOGY_MAX_SCALE = 1.7;
const TOPOLOGY_FIT_PADDING = 36;

function topologyAvailableSize() {
  if (typeof window === "undefined") {
    return TOPOLOGY_LEGACY_REFERENCE_VIEWPORT;
  }
  return {
    width: Math.max(TOPOLOGY_MIN_SIZE.width, window.innerWidth - 32),
    height: Math.max(TOPOLOGY_MIN_SIZE.height, window.innerHeight - 128)
  };
}

function clampTopologySize(size: TopologySize): TopologySize {
  const available = topologyAvailableSize();
  const maxWidth = Math.max(
    TOPOLOGY_MIN_SIZE.width,
    Math.min(
      TOPOLOGY_MAX_SIZE.width,
      available.width,
      Math.round(available.width * TOPOLOGY_MAX_VIEWPORT_RATIO.width)
    )
  );
  const maxHeight = Math.max(
    TOPOLOGY_MIN_SIZE.height,
    Math.min(
      TOPOLOGY_MAX_SIZE.height,
      available.height,
      Math.round(available.height * TOPOLOGY_MAX_VIEWPORT_RATIO.height)
    )
  );
  return {
    width: Math.min(maxWidth, Math.max(TOPOLOGY_MIN_SIZE.width, Math.round(size.width))),
    height: Math.min(maxHeight, Math.max(TOPOLOGY_MIN_SIZE.height, Math.round(size.height)))
  };
}

function topologyPreferenceFromSize(size: TopologySize): TopologySizePreference {
  const available = topologyAvailableSize();
  const clamped = clampTopologySize(size);
  return {
    version: 2,
    widthRatio: clamped.width / available.width,
    heightRatio: clamped.height / available.height
  };
}

function topologySizeFromPreference(preference: TopologySizePreference): TopologySize {
  const available = topologyAvailableSize();
  return clampTopologySize({
    width: available.width * preference.widthRatio,
    height: available.height * preference.heightRatio
  });
}

function readStoredTopologyPreference(): TopologySizePreference {
  if (typeof window === "undefined") {
    return topologyPreferenceFromSize(TOPOLOGY_DEFAULT_SIZE);
  }
  try {
    const stored = JSON.parse(window.localStorage.getItem(TOPOLOGY_SIZE_STORAGE_KEY) ?? "null");
    if (
      stored?.version === 2 &&
      Number.isFinite(stored.widthRatio) &&
      stored.widthRatio > 0 &&
      Number.isFinite(stored.heightRatio) &&
      stored.heightRatio > 0
    ) {
      return {
        version: 2,
        widthRatio: stored.widthRatio,
        heightRatio: stored.heightRatio
      };
    }
    if (Number.isFinite(stored?.width) && Number.isFinite(stored?.height)) {
      const migrated = {
        version: 2,
        widthRatio: stored.width / TOPOLOGY_LEGACY_REFERENCE_VIEWPORT.width,
        heightRatio: stored.height / TOPOLOGY_LEGACY_REFERENCE_VIEWPORT.height
      } satisfies TopologySizePreference;
      window.localStorage.setItem(
        TOPOLOGY_SIZE_STORAGE_KEY,
        JSON.stringify(migrated)
      );
      return migrated;
    }
  } catch {
    // Invalid local preferences fall back to the stable default.
  }
  return topologyPreferenceFromSize(TOPOLOGY_DEFAULT_SIZE);
}

function buildLayout(articles: Record<string, ArticleNode>, rootId: string) {
  const positions: Position[] = [];
  const xGap = 210;
  const yGap = 86;
  let leaf = 0;

  const place = (id: string, depth: number): number => {
    const article = articles[id];
    if (!article || !article.childIds.length) {
      const y = 44 + leaf * yGap;
      leaf += 1;
      positions.push({ id, x: 36 + depth * xGap, y, depth });
      return y;
    }
    const childYs = article.childIds.map((childId) => place(childId, depth + 1));
    const y = childYs.reduce((sum, value) => sum + value, 0) / childYs.length;
    positions.push({ id, x: 36 + depth * xGap, y, depth });
    return y;
  };

  place(rootId, 0);
  const width = Math.max(520, ...positions.map((position) => position.x + 174));
  const height = Math.max(260, ...positions.map((position) => position.y + 82));
  return { positions, width, height };
}

export function TopologyPanel({
  articles,
  rootId,
  currentId,
  onNavigate,
  fullScreen,
  sharedTransition,
  onFullScreen,
  focusShortcut,
  pinShortcut
}: TopologyPanelProps) {
  const layout = useMemo(() => buildLayout(articles, rootId), [articles, rootId]);
  const [scale, setScale] = useState(0.78);
  const [pan, setPan] = useState({ x: 8, y: 12 });
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const sizePreferenceRef = useRef<TopologySizePreference | null>(null);
  if (!sizePreferenceRef.current) {
    sizePreferenceRef.current = readStoredTopologyPreference();
  }
  const [size, setSize] = useState(() =>
    topologySizeFromPreference(sizePreferenceRef.current!)
  );
  const [resizing, setResizing] = useState(false);
  const [focusMode, setFocusMode] = useState<TopologyFocusMode>(null);
  const drag = useRef<{ id: number; startX: number; startY: number; x: number; y: number } | null>(
    null
  );
  const resize = useRef<{
    id: number;
    edge: ResizeEdge;
    startX: number;
    startY: number;
    width: number;
    height: number;
  } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointerInsideRef = useRef(false);
  const sizeRef = useRef(size);
  const fullScreenRef = useRef(fullScreen);
  const lastViewportSizeRef = useRef(size);
  sizeRef.current = size;
  fullScreenRef.current = fullScreen;

  const byId = useMemo(
    () => Object.fromEntries(layout.positions.map((position) => [position.id, position])),
    [layout.positions]
  );

  const zoom = (next: number) => {
    setFocusMode(null);
    setScale(Math.max(TOPOLOGY_MIN_SCALE, Math.min(TOPOLOGY_MAX_SCALE, next)));
  };

  const focusViewportSize = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    if (fullScreenRef.current) {
      return {
        width: viewport.clientWidth,
        height: viewport.clientHeight
      };
    }
    return {
      width: sizeRef.current.width,
      height: sizeRef.current.height
    };
  }, []);

  const focusCurrent = useCallback(() => {
    const position = byId[currentId];
    const viewport = focusViewportSize();
    if (!position || !viewport) return;
    const nextScale = TOPOLOGY_CURRENT_FOCUS_SCALE;
    setScale(nextScale);
    setPan({
      x: viewport.width / 2 - (position.x + TOPOLOGY_NODE_WIDTH / 2) * nextScale,
      y: viewport.height / 2 - (position.y + TOPOLOGY_NODE_HEIGHT / 2) * nextScale
    });
    setFocusMode("current");
  }, [byId, currentId, focusViewportSize]);

  const focusOverall = useCallback(() => {
    const viewport = focusViewportSize();
    if (!viewport) return;
    const availableWidth = Math.max(1, viewport.width - TOPOLOGY_FIT_PADDING * 2);
    const availableHeight = Math.max(1, viewport.height - TOPOLOGY_FIT_PADDING * 2);
    const nextScale = Math.max(
      TOPOLOGY_MIN_SCALE,
      Math.min(
        TOPOLOGY_MAX_SCALE,
        availableWidth / layout.width,
        availableHeight / layout.height
      )
    );
    setScale(nextScale);
    setPan({
      x: (viewport.width - layout.width * nextScale) / 2,
      y: (viewport.height - layout.height * nextScale) / 2
    });
    setFocusMode("overall");
  }, [focusViewportSize, layout.height, layout.width]);

  const toggleFocus = useCallback(() => {
    if (focusMode === "overall") {
      focusCurrent();
      return;
    }
    focusOverall();
  }, [focusCurrent, focusMode, focusOverall]);

  const togglePinned = useCallback(() => {
    setPinned((value) => {
      if (value && pointerInsideRef.current) {
        setOpen(true);
      }
      return !value;
    });
  }, []);

  const smallExpanded = open || pinned || resizing;

  useLayoutEffect(() => {
    if (fullScreen) {
      focusOverall();
    } else if (smallExpanded) {
      focusCurrent();
    }
  }, [focusCurrent, focusOverall, fullScreen, smallExpanded]);

  useEffect(() => {
    const handleWindowResize = () => {
      if (!sizePreferenceRef.current) return;
      setSize(topologySizeFromPreference(sizePreferenceRef.current));
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  useLayoutEffect(() => {
    const previousSize = lastViewportSizeRef.current;
    if (previousSize.width === size.width && previousSize.height === size.height) return;
    lastViewportSizeRef.current = size;
    if (fullScreen) {
      focusOverall();
      return;
    }
    if (!smallExpanded) return;
    if (focusMode === "current") {
      focusCurrent();
    } else if (focusMode === "overall") {
      focusOverall();
    }
  }, [
    focusCurrent,
    focusMode,
    focusOverall,
    fullScreen,
    smallExpanded,
    size.height,
    size.width
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        (target.matches("textarea, input, select") || target.isContentEditable);
      const panel = panelRef.current;
      const topologyVisible =
        fullScreen ||
        pinned ||
        open ||
        Boolean(panel?.contains(document.activeElement));
      if (!topologyVisible) return;

      if (
        matchesShortcut(event, pinShortcut) &&
        !editing &&
        !fullScreen
      ) {
        event.preventDefault();
        togglePinned();
        return;
      }

      if (
        matchesShortcut(event, focusShortcut) &&
        (!editing || fullScreen)
      ) {
        event.preventDefault();
        toggleFocus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    focusShortcut,
    fullScreen,
    open,
    pinShortcut,
    pinned,
    toggleFocus,
    togglePinned
  ]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    setFocusMode(null);
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: pan.x,
      y: pan.y
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.classList.add("is-dragging");
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    setPan({
      x: drag.current.x + event.clientX - drag.current.startX,
      y: drag.current.y + event.clientY - drag.current.startY
    });
  };

  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null;
    event.currentTarget.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoom(scale * Math.exp(-event.deltaY * 0.0012));
  };

  const setAndStoreSize = (nextSize: TopologySize) => {
    const clamped = clampTopologySize(nextSize);
    const preference = topologyPreferenceFromSize(clamped);
    sizePreferenceRef.current = preference;
    setSize(clamped);
    window.localStorage.setItem(TOPOLOGY_SIZE_STORAGE_KEY, JSON.stringify(preference));
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>, edge: ResizeEdge) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    resize.current = {
      id: event.pointerId,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      width: size.width,
      height: size.height
    };
    setFocusMode(null);
    setResizing(true);
  };

  const handleNodeDoubleClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
    articleId: string
  ) => {
    if (!fullScreen) return;
    event.preventDefault();
    event.stopPropagation();
    onNavigate(articleId);
    if (!event.ctrlKey) {
      onFullScreen(false);
    }
  };

  const sizeFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = resize.current;
    if (!active || active.id !== event.pointerId) return null;
    const changesWidth = active.edge === "left" || active.edge === "top-left";
    const changesHeight = active.edge === "top" || active.edge === "top-left";
    return clampTopologySize({
      width: changesWidth ? active.width + active.startX - event.clientX : active.width,
      height: changesHeight ? active.height + active.startY - event.clientY : active.height
    });
  };

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const nextSize = sizeFromPointer(event);
    if (nextSize) setSize(nextSize);
  };

  const stopResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const nextSize = event.type === "pointercancel" ? size : sizeFromPointer(event);
    if (!nextSize) return;
    resize.current = null;
    setResizing(false);
    setAndStoreSize(nextSize);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const handleResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    dimension: "width" | "height"
  ) => {
    const step = event.shiftKey ? 24 : 8;
    let nextSize: TopologySize | null = null;
    if (dimension === "width") {
      if (event.key === "ArrowLeft") nextSize = { ...size, width: size.width + step };
      if (event.key === "ArrowRight") nextSize = { ...size, width: size.width - step };
      if (event.key === "Home") nextSize = { ...size, width: TOPOLOGY_MIN_SIZE.width };
      if (event.key === "End") nextSize = { ...size, width: TOPOLOGY_MAX_SIZE.width };
    } else {
      if (event.key === "ArrowUp") nextSize = { ...size, height: size.height + step };
      if (event.key === "ArrowDown") nextSize = { ...size, height: size.height - step };
      if (event.key === "Home") nextSize = { ...size, height: TOPOLOGY_MIN_SIZE.height };
      if (event.key === "End") nextSize = { ...size, height: TOPOLOGY_MAX_SIZE.height };
    }
    if (!nextSize) return;
    event.preventDefault();
    setAndStoreSize(nextSize);
  };

  const panel = (
    <aside
      id="article-topology-panel"
      ref={panelRef}
      className={`topology-panel${pinned ? " is-pinned" : ""}${fullScreen ? " is-fullscreen" : ""}${sharedTransition ? " is-shared-transition" : ""}${resizing ? " is-resizing" : ""}`}
      data-focus-mode={focusMode ?? "manual"}
      aria-label="当前知识树拓扑"
    >
      <div className="topology-content">
      {!fullScreen && (
        <>
          <div
            className="topology-resize-handle is-left"
            role="separator"
            aria-label="调整拓扑图宽度"
            aria-orientation="vertical"
            aria-valuemin={TOPOLOGY_MIN_SIZE.width}
            aria-valuemax={TOPOLOGY_MAX_SIZE.width}
            aria-valuenow={size.width}
            tabIndex={0}
            onDoubleClick={() => setAndStoreSize({ ...size, width: TOPOLOGY_DEFAULT_SIZE.width })}
            onKeyDown={(event) => handleResizeKeyDown(event, "width")}
            onPointerDown={(event) => startResize(event, "left")}
            onPointerMove={moveResize}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
          />
          <div
            className="topology-resize-handle is-top"
            role="separator"
            aria-label="调整拓扑图高度"
            aria-orientation="horizontal"
            aria-valuemin={TOPOLOGY_MIN_SIZE.height}
            aria-valuemax={TOPOLOGY_MAX_SIZE.height}
            aria-valuenow={size.height}
            tabIndex={0}
            onDoubleClick={() => setAndStoreSize({ ...size, height: TOPOLOGY_DEFAULT_SIZE.height })}
            onKeyDown={(event) => handleResizeKeyDown(event, "height")}
            onPointerDown={(event) => startResize(event, "top")}
            onPointerMove={moveResize}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
          />
          <div
            className="topology-resize-handle is-top-left"
            aria-hidden="true"
            onPointerDown={(event) => startResize(event, "top-left")}
            onPointerMove={moveResize}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
          />
        </>
      )}
      <div
        ref={viewportRef}
        className="topology-viewport"
        onWheel={handleWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div
          className="topology-scene"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`
          }}
        >
          <svg
            className="topology-links"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
          >
            {layout.positions.flatMap((parent) => {
              const article = articles[parent.id];
              return (article?.childIds ?? []).map((childId) => {
                const child = byId[childId];
                if (!child) return null;
                const startX = parent.x + 164;
                const startY = parent.y + 25;
                const endX = child.x;
                const endY = child.y + 25;
                const mid = startX + (endX - startX) * 0.52;
                return (
                  <path
                    key={`${parent.id}-${childId}`}
                    d={`M ${startX} ${startY} C ${mid} ${startY}, ${mid} ${endY}, ${endX} ${endY}`}
                  />
                );
              });
            })}
          </svg>
          {layout.positions.map((position) => {
            const article = articles[position.id];
            if (!article) return null;
            const current = article.id === currentId;
            return (
              <button
                key={article.id}
                className={`topology-node${current ? " is-current" : ""}`}
                type="button"
                style={{ left: position.x, top: position.y }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  if (!fullScreen) onNavigate(article.id);
                }}
                onDoubleClick={(event) => handleNodeDoubleClick(event, article.id)}
                aria-current={current ? "page" : undefined}
              >
                <span className="topology-node-dot" aria-hidden="true"></span>
                <span>
                  <strong>{article.title}</strong>
                  <small>{fullScreen ? article.summary : `第 ${position.depth + 1} 层`}</small>
                </span>
                {current && <em>当前</em>}
              </button>
            );
          })}
        </div>
        <div
          className="topology-overlay"
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="topology-actions" aria-label="拓扑操作">
            <button type="button" onClick={() => zoom(scale - 0.12)} aria-label="缩小拓扑">
              <ZoomOut aria-hidden="true" size={16} />
            </button>
            <button type="button" onClick={() => zoom(scale + 0.12)} aria-label="放大拓扑">
              <ZoomIn aria-hidden="true" size={16} />
            </button>
            <button
              type="button"
              onClick={toggleFocus}
              aria-label={focusMode === "overall" ? "聚焦当前节点" : "聚焦整棵知识树"}
            >
              <Focus aria-hidden="true" size={16} />
            </button>
            {!fullScreen && (
              <button
                type="button"
                className={pinned ? "is-active" : ""}
                aria-pressed={pinned}
                onClick={togglePinned}
                aria-label={pinned ? "取消固定拓扑" : "固定拓扑"}
              >
                <Pin aria-hidden="true" size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onFullScreen(!fullScreen)}
              aria-label={fullScreen ? "退出全屏拓扑" : "全屏查看拓扑"}
            >
              {fullScreen ? (
                <Minimize2 aria-hidden="true" size={16} />
              ) : (
                <Maximize2 aria-hidden="true" size={16} />
              )}
            </button>
          </div>
          <div className="topology-overlay-copy" aria-live="polite">
            <span>{Math.round(scale * 100)}% · {layout.positions.length} 节点</span>
            <span>{fullScreen ? "双击进入 · Ctrl 保留拓扑" : "拖动 · 滚轮缩放"}</span>
            <kbd>{formatShortcut(focusShortcut)}</kbd>
          </div>
        </div>
      </div>
      </div>
    </aside>
  );

  const expanded = open || pinned || resizing || fullScreen;

  return (
    <div
      className={`topology-shell${expanded ? " is-open" : ""}${fullScreen ? " is-fullscreen" : ""}`}
      data-small-expanded={smallExpanded}
      onPointerEnter={() => {
        pointerInsideRef.current = true;
      }}
      onPointerLeave={() => {
        pointerInsideRef.current = false;
        if (!fullScreen) {
          setOpen(false);
        }
      }}
      onBlur={(event) => {
        if (
          !fullScreen &&
          !pointerInsideRef.current &&
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        ) {
          setOpen(false);
        }
      }}
      style={
        {
          "--topology-width": `${size.width}px`,
          "--topology-height": `${size.height}px`
        } as CSSProperties
      }
    >
      {!fullScreen && (
        <button
          className="topology-trigger"
          type="button"
          aria-label="展开文章拓扑"
          aria-controls="article-topology-panel"
          aria-expanded={expanded}
          onPointerEnter={() => setOpen(true)}
          onClick={() => setOpen(true)}
        >
          <Network aria-hidden="true" size={20} />
        </button>
      )}
      {panel}
    </div>
  );
}
