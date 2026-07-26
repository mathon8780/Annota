import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
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
  const drag = useRef<{ id: number; startX: number; startY: number; x: number; y: number } | null>(
    null
  );
  const viewportRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(
    () => Object.fromEntries(layout.positions.map((position) => [position.id, position])),
    [layout.positions]
  );

  const zoom = (next: number) => setScale(Math.max(0.42, Math.min(1.7, next)));

  const focusCurrent = () => {
    const position = byId[currentId];
    const viewport = viewportRef.current;
    if (!position || !viewport) return;
    const nextScale = fullScreen ? 1 : 0.9;
    setScale(nextScale);
    setPan({
      x: viewport.clientWidth / 2 - (position.x + 76) * nextScale,
      y: viewport.clientHeight / 2 - (position.y + 24) * nextScale
    });
    setPinned(true);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: pan.x,
      y: pan.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
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
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoom(scale * Math.exp(-event.deltaY * 0.0012));
  };

  const panel = (
    <aside
      className={`topology-panel${pinned ? " is-pinned" : ""}${fullScreen ? " is-fullscreen" : ""}`}
      aria-label="当前知识树拓扑"
    >
      {!fullScreen && (
        <div className="topology-collapsed" aria-hidden="true">
          <Network size={20} />
        </div>
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
    </aside>
  );

  return panel;
}
