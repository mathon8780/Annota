import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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

interface TopologyPanelProps {
  articles: Record<string, ArticleNode>;
  rootId: string;
  currentId: string;
  onNavigate: (id: string) => void;
  fullScreen: boolean;
  onFullScreen: (value: boolean) => void;
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

type ResizeEdge = "left" | "top" | "top-left";

const TOPOLOGY_DEFAULT_SIZE = { width: 420, height: 322 };
const TOPOLOGY_MIN_SIZE = { width: 280, height: 220 };
const TOPOLOGY_MAX_SIZE = { width: 720, height: 560 };
const TOPOLOGY_SIZE_STORAGE_KEY = "annota:topology-size";
const TOPOLOGY_NODE_WIDTH = 164;
const TOPOLOGY_NODE_HEIGHT = 50;

function clampTopologySize(size: TopologySize): TopologySize {
  const viewportWidth = typeof window === "undefined" ? TOPOLOGY_MAX_SIZE.width : window.innerWidth - 32;
  const viewportHeight = typeof window === "undefined" ? TOPOLOGY_MAX_SIZE.height : window.innerHeight - 128;
  const maxWidth = Math.max(
    TOPOLOGY_MIN_SIZE.width,
    Math.min(TOPOLOGY_MAX_SIZE.width, viewportWidth)
  );
  const maxHeight = Math.max(
    TOPOLOGY_MIN_SIZE.height,
    Math.min(TOPOLOGY_MAX_SIZE.height, viewportHeight)
  );
  return {
    width: Math.min(maxWidth, Math.max(TOPOLOGY_MIN_SIZE.width, Math.round(size.width))),
    height: Math.min(maxHeight, Math.max(TOPOLOGY_MIN_SIZE.height, Math.round(size.height)))
  };
}

function readStoredTopologySize(): TopologySize {
  if (typeof window === "undefined") return TOPOLOGY_DEFAULT_SIZE;
  try {
    const stored = JSON.parse(window.localStorage.getItem(TOPOLOGY_SIZE_STORAGE_KEY) ?? "null");
    if (Number.isFinite(stored?.width) && Number.isFinite(stored?.height)) {
      return clampTopologySize(stored);
    }
  } catch {
    // Invalid local preferences fall back to the stable default.
  }
  return clampTopologySize(TOPOLOGY_DEFAULT_SIZE);
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
  onFullScreen
}: TopologyPanelProps) {
  const layout = useMemo(() => buildLayout(articles, rootId), [articles, rootId]);
  const [scale, setScale] = useState(0.78);
  const [pan, setPan] = useState({ x: 8, y: 12 });
  const [pinned, setPinned] = useState(false);
  const [size, setSize] = useState(readStoredTopologySize);
  const [resizing, setResizing] = useState(false);
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

  const byId = useMemo(
    () => Object.fromEntries(layout.positions.map((position) => [position.id, position])),
    [layout.positions]
  );

  const zoom = (next: number) => setScale(Math.max(0.42, Math.min(1.7, next)));

  const focusCurrent = useCallback(() => {
    const position = byId[currentId];
    const viewport = viewportRef.current;
    if (!position || !viewport) return;
    setPan({
      x: viewport.clientWidth / 2 - (position.x + TOPOLOGY_NODE_WIDTH / 2) * scale,
      y: viewport.clientHeight / 2 - (position.y + TOPOLOGY_NODE_HEIGHT / 2) * scale
    });
    setPinned(true);
  }, [byId, currentId, scale]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        (target.matches("textarea, input, select") || target.isContentEditable);
      if (
        event.key.toLocaleLowerCase() !== "f" ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        editing
      ) {
        return;
      }
      const panel = panelRef.current;
      const topologyVisible =
        fullScreen ||
        pinned ||
        Boolean(panel?.matches(":hover")) ||
        Boolean(panel?.contains(document.activeElement));
      if (!topologyVisible) return;
      event.preventDefault();
      focusCurrent();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusCurrent, fullScreen, pinned]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
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
    setSize(clamped);
    window.localStorage.setItem(TOPOLOGY_SIZE_STORAGE_KEY, JSON.stringify(clamped));
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
    setPinned(true);
    setResizing(true);
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
    setPinned(true);
    setAndStoreSize(nextSize);
  };

  const panel = (
    <aside
      ref={panelRef}
      className={`topology-panel${pinned ? " is-pinned" : ""}${fullScreen ? " is-fullscreen" : ""}${resizing ? " is-resizing" : ""}`}
      aria-label="当前知识树拓扑"
    >
      {!fullScreen && (
        <div className="topology-collapsed" aria-hidden="true">
          <Network size={20} />
        </div>
      )}
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
      <header className="topology-header">
        <div>
          <strong>{fullScreen ? "整棵知识树" : "文章拓扑"}</strong>
          <span>{Math.round(scale * 100)}% · {layout.positions.length} 个节点</span>
        </div>
        <div className="topology-actions">
          <button type="button" onClick={() => zoom(scale - 0.12)} aria-label="缩小拓扑">
            <ZoomOut aria-hidden="true" size={16} />
          </button>
          <button type="button" onClick={() => zoom(scale + 0.12)} aria-label="放大拓扑">
            <ZoomIn aria-hidden="true" size={16} />
          </button>
          <button type="button" onClick={focusCurrent} aria-label="聚焦当前节点">
            <Focus aria-hidden="true" size={16} />
          </button>
          {!fullScreen && (
            <button
              type="button"
              className={pinned ? "is-active" : ""}
              aria-pressed={pinned}
              onClick={() => setPinned((value) => !value)}
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
      </header>
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
                onClick={() => onNavigate(article.id)}
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
      </div>
      <footer className="topology-footer">
        <span>滚轮缩放 · 拖动浏览 · 点击跳转</span>
        <kbd>F</kbd>
        <span>聚焦</span>
      </footer>
      </div>
    </aside>
  );

  return (
    <div
      className={`topology-shell${fullScreen ? " is-fullscreen" : ""}`}
      style={
        {
          "--topology-width": `${size.width}px`,
          "--topology-height": `${size.height}px`
        } as CSSProperties
      }
    >
      {panel}
    </div>
  );
}
