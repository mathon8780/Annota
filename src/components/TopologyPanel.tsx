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
  AlignLeft,
  BookOpenText,
  CircleHelp,
  Code2,
  Focus,
  GalleryHorizontalEnd,
  GitCompareArrows,
  Highlighter,
  Languages,
  ListChecks,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Network,
  NotebookPen,
  Pin,
  Plus,
  Quote,
  Tag,
  Trash2,
  Unlink,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type { ArticleNode } from "../types";
import type {
  TopologyGraphRecord,
  TopologyNodeRecord
} from "../utils/topologyRepository";
import {
  loadGenerationTypes,
  type GenerationTypeConfig,
  type GenerationTypeIconId
} from "../utils/generationConfig";
import {
  formatShortcut,
  matchesShortcut
} from "../utils/shortcuts";
import type { ShortcutBinding } from "../utils/shortcuts";

interface TopologyPanelProps {
  articles: Record<string, ArticleNode>;
  rootId: string;
  rootIds?: string[];
  currentId: string;
  onNavigate: (id: string) => void;
  fullScreen: boolean;
  sharedTransition: boolean;
  onFullScreen: (value: boolean) => void;
  focusShortcut: ShortcutBinding;
  pinShortcut: ShortcutBinding;
  topologyGraph: TopologyGraphRecord | null;
  topologyError: string;
  onCreateRoot: (title: string, markdown?: string) => Promise<string | null>;
  onCreateManualNode: (draft: {
    nodeType: string;
    title: string;
    content: string;
    parentId: string | null;
    isRoot: boolean;
    interactive: boolean;
    icon: GenerationTypeIconId;
    cardVariant: GenerationTypeConfig["cardVariant"];
    color: string;
  }) => Promise<TopologyNodeRecord | null>;
  onUpdateManualNode: (node: TopologyNodeRecord) => Promise<void>;
  onRemoveManualNode: (nodeId: string) => Promise<void>;
  onCreateRelation: (
    sourceNodeId: string,
    targetNodeId: string,
    label: string,
    directed?: boolean
  ) => Promise<void>;
  onRemoveRelation: (relationId: string) => Promise<void>;
  onUpdateInteraction: (
    nodeId: string,
    interactionType: string,
    state: Record<string, unknown>
  ) => Promise<void>;
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

interface TopologyDisplayNode {
  id: string;
  title: string;
  summary: string;
  nodeType: GenerationTypeConfig;
  article?: ArticleNode;
  manual?: TopologyNodeRecord;
}

interface TopologyDisplayEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  directed: boolean;
  persisted: boolean;
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
const TOPOLOGY_NODE_WIDTH = 214;
const TOPOLOGY_NODE_HEIGHT = 118;
const TOPOLOGY_NODE_X_GAP = 276;
const TOPOLOGY_NODE_Y_GAP = 154;
const TOPOLOGY_CURRENT_FOCUS_SCALE = 0.9;
const TOPOLOGY_MIN_SCALE = 0.18;
const TOPOLOGY_MAX_SCALE = 1.7;
const TOPOLOGY_FIT_PADDING = 36;

const topologyNodeIcons: Record<GenerationTypeIconId, typeof Network> = {
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
    (type) => type.relationLabel === article.type
  );
  const nameType = nodeTypes.find((type) => type.name === article.type);
  const configuredType =
    article.parentId === null
      ? rootType
      : sourceType ?? relationType ?? nameType;
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

function resolveStoredNodeType(
  node: TopologyNodeRecord,
  nodeTypes: readonly GenerationTypeConfig[]
): GenerationTypeConfig {
  const configured = nodeTypes.find((type) => type.id === node.nodeType);
  if (configured) return configured;
  const fallback = nodeTypes.find((type) => type.id === "note") ?? nodeTypes[0];
  if (!fallback) throw new Error("没有可用的拓扑节点类型");
  try {
    const appearance = JSON.parse(node.appearanceJson) as Partial<GenerationTypeConfig>;
    return {
      ...fallback,
      id: node.nodeType,
      name: node.nodeType,
      icon: appearance.icon ?? fallback.icon,
      cardVariant: appearance.cardVariant ?? fallback.cardVariant,
      color: appearance.color ?? fallback.color,
      interactive: node.interactive
    };
  } catch {
    return { ...fallback, id: node.nodeType, name: node.nodeType };
  }
}

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

function buildLayout(
  nodes: Record<string, TopologyDisplayNode>,
  rootIds: readonly string[],
  edges: readonly TopologyDisplayEdge[]
) {
  const children = new Map<string, string[]>();
  edges.forEach((edge) => {
    const values = children.get(edge.sourceId) ?? [];
    if (!values.includes(edge.targetId)) values.push(edge.targetId);
    children.set(edge.sourceId, values);
  });
  const depths = new Map<string, number>();
  const queue = rootIds.filter((id) => nodes[id]).map((id) => ({ id, depth: 0 }));
  Object.keys(nodes).forEach((id) => {
    if (!queue.some((item) => item.id === id) && !edges.some((edge) => edge.targetId === id)) {
      queue.push({ id, depth: 0 });
    }
  });
  while (queue.length) {
    const next = queue.shift()!;
    const previous = depths.get(next.id);
    if (previous !== undefined && previous <= next.depth) continue;
    depths.set(next.id, next.depth);
    (children.get(next.id) ?? []).forEach((id) => {
      if (nodes[id] && next.depth < Object.keys(nodes).length) {
        queue.push({ id, depth: next.depth + 1 });
      }
    });
  }
  Object.keys(nodes).forEach((id) => {
    if (!depths.has(id)) depths.set(id, 0);
  });
  const perDepth = new Map<number, number>();
  const positions: Position[] = Object.keys(nodes)
    .sort((left, right) => {
      const depthDifference = (depths.get(left) ?? 0) - (depths.get(right) ?? 0);
      if (depthDifference) return depthDifference;
      const rootDifference = rootIds.indexOf(left) - rootIds.indexOf(right);
      return rootDifference || left.localeCompare(right);
    })
    .map((id) => {
      const depth = depths.get(id) ?? 0;
      const index = perDepth.get(depth) ?? 0;
      perDepth.set(depth, index + 1);
      return {
        id,
        x: 36 + depth * TOPOLOGY_NODE_X_GAP,
        y: 44 + index * TOPOLOGY_NODE_Y_GAP,
        depth
      };
    });
  const width = Math.max(
    520,
    ...positions.map((position) => position.x + TOPOLOGY_NODE_WIDTH + 36)
  );
  const height = Math.max(
    260,
    ...positions.map((position) => position.y + TOPOLOGY_NODE_HEIGHT + 44)
  );
  return { positions, width, height };
}

export function TopologyPanel({
  articles,
  rootId,
  rootIds = [rootId],
  currentId,
  onNavigate,
  fullScreen,
  sharedTransition,
  onFullScreen,
  focusShortcut,
  pinShortcut,
  topologyGraph,
  topologyError,
  onCreateRoot,
  onCreateManualNode,
  onUpdateManualNode,
  onRemoveManualNode,
  onCreateRelation,
  onRemoveRelation,
  onUpdateInteraction
}: TopologyPanelProps) {
  const allNodeTypes = useMemo(() => loadGenerationTypes(), []);
  const manualNodeTypes = useMemo(
    () =>
      allNodeTypes.filter(
        (type) => type.executionMode === "manual" && type.enabled
      ),
    [allNodeTypes]
  );
  const displayNodes = useMemo(() => {
    const values: Record<string, TopologyDisplayNode> = {};
    Object.values(articles).forEach((article) => {
      if (!rootIds.includes(article.rootId) && !rootIds.includes(article.id)) return;
      values[article.id] = {
        id: article.id,
        title: article.title,
        summary: article.summary,
        nodeType: resolveNodeType(article, allNodeTypes),
        article
      };
    });
    topologyGraph?.nodes.forEach((node) => {
      if (node.contentMode !== "database" || !node.enabled) return;
      values[node.id] = {
        id: node.id,
        title: node.title,
        summary: node.summary || node.content?.replace(/\s+/g, " ").slice(0, 90) || "",
        nodeType: resolveStoredNodeType(node, allNodeTypes),
        manual: node
      };
    });
    return values;
  }, [allNodeTypes, articles, rootIds, topologyGraph?.nodes]);
  const displayEdges = useMemo(() => {
    const values = new Map<string, TopologyDisplayEdge>();
    Object.values(articles).forEach((article) => {
      article.childIds.forEach((childId) => {
        if (!displayNodes[article.id] || !displayNodes[childId]) return;
        const key = `${article.id}:${childId}`;
        values.set(key, {
          id: `tree:${key}`,
          sourceId: article.id,
          targetId: childId,
          label: articles[childId]?.type ?? "下一级",
          directed: true,
          persisted: false
        });
      });
    });
    topologyGraph?.relations.forEach((relation) => {
      if (!displayNodes[relation.sourceNodeId] || !displayNodes[relation.targetNodeId]) return;
      const key = `${relation.sourceNodeId}:${relation.targetNodeId}`;
      const existing = values.get(key);
      values.set(key, {
        id: relation.id,
        sourceId: relation.sourceNodeId,
        targetId: relation.targetNodeId,
        label: relation.label,
        directed: relation.directed,
        persisted: existing ? existing.persisted : true
      });
    });
    return Array.from(values.values());
  }, [articles, displayNodes, topologyGraph?.relations]);
  const resolvedRootIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...rootIds,
          ...(topologyGraph?.nodes
            .filter((node) => node.contentMode === "database" && node.isRoot && node.enabled)
            .map((node) => node.id) ?? [])
        ])
      ),
    [rootIds, topologyGraph?.nodes]
  );
  const layout = useMemo(
    () => buildLayout(displayNodes, resolvedRootIds, displayEdges),
    [displayEdges, displayNodes, resolvedRootIds]
  );
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
  const [composer, setComposer] = useState<"root" | "manual" | null>(null);
  const [selectedManualId, setSelectedManualId] = useState<string | null>(null);
  const [selectedInteractiveId, setSelectedInteractiveId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftTypeId, setDraftTypeId] = useState(manualNodeTypes[0]?.id ?? "note");
  const [draftAsRoot, setDraftAsRoot] = useState(false);
  const [relationTargetId, setRelationTargetId] = useState("");
  const [relationLabel, setRelationLabel] = useState("关联");
  const [editorBusy, setEditorBusy] = useState(false);
  const selectedManualNode = selectedManualId
    ? topologyGraph?.nodes.find((node) => node.id === selectedManualId) ?? null
    : null;
  const selectedInteractiveNode = selectedInteractiveId
    ? displayNodes[selectedInteractiveId] ?? null
    : null;
  const selectedInteraction = selectedInteractiveId
    ? topologyGraph?.interactions.find((item) => item.nodeId === selectedInteractiveId) ?? null
    : null;
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

  const openManualEditor = (node: TopologyNodeRecord) => {
    setSelectedManualId(node.id);
    setDraftTitle(node.title);
    setDraftContent(node.content ?? "");
    setRelationTargetId("");
  };

  const submitComposer = async () => {
    if (!draftTitle.trim() || editorBusy) return;
    setEditorBusy(true);
    try {
      if (composer === "root") {
        await onCreateRoot(draftTitle, draftContent);
      } else {
        const nodeType =
          manualNodeTypes.find((type) => type.id === draftTypeId) ?? manualNodeTypes[0];
        if (!nodeType) return;
        const node = await onCreateManualNode({
          nodeType: nodeType.id,
          title: draftTitle,
          content: draftContent,
          parentId: draftAsRoot ? null : currentId,
          isRoot: draftAsRoot,
          interactive: nodeType.interactive,
          icon: nodeType.icon,
          cardVariant: nodeType.cardVariant,
          color: nodeType.color
        });
        if (node) openManualEditor(node);
      }
      setComposer(null);
      setDraftTitle("");
      setDraftContent("");
      setDraftAsRoot(false);
    } finally {
      setEditorBusy(false);
    }
  };

  const updateSelectedManual = async (
    changes: Partial<TopologyNodeRecord> = {}
  ) => {
    if (!selectedManualNode || editorBusy) return;
    setEditorBusy(true);
    try {
      await onUpdateManualNode({
        ...selectedManualNode,
        title: draftTitle.trim() || selectedManualNode.title,
        content: draftContent,
        summary: draftContent.trim().replace(/\s+/g, " ").slice(0, 90),
        ...changes
      });
    } finally {
      setEditorBusy(false);
    }
  };

  const updateInteractionState = async (state: Record<string, unknown>) => {
    if (!selectedManualNode) return;
    await updateSelectedManual({ interactionStateJson: JSON.stringify(state) });
  };

  const selectedInteractionState = (() => {
    try {
      return JSON.parse(selectedManualNode?.interactionStateJson ?? "{}") as Record<
        string,
        unknown
      >;
    } catch {
      return {};
    }
  })();
  const selectedGraphInteractionState = (() => {
    try {
      return JSON.parse(selectedInteraction?.stateJson ?? "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

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
            {displayEdges.map((edge) => {
                const parent = byId[edge.sourceId];
                const child = byId[edge.targetId];
                const parentType = displayNodes[edge.sourceId]?.nodeType;
                if (!parent || !child) return null;
                if (!child) return null;
                const startX = parent.x + TOPOLOGY_NODE_WIDTH;
                const startY = parent.y + TOPOLOGY_NODE_HEIGHT / 2;
                const endX = child.x;
                const endY = child.y + TOPOLOGY_NODE_HEIGHT / 2;
                const mid = startX + (endX - startX) * 0.52;
                return (
                  <path
                    key={edge.id}
                    className={edge.directed ? "is-directed" : "is-undirected"}
                    d={`M ${startX} ${startY} C ${mid} ${startY}, ${mid} ${endY}, ${endX} ${endY}`}
                    style={
                      {
                        "--topology-link-color": parentType?.color
                      } as CSSProperties
                    }
                  />
                );
            })}
          </svg>
          {layout.positions.map((position) => {
            const node = displayNodes[position.id];
            if (!node) return null;
            const current = node.id === currentId;
            const nodeType = node.nodeType;
            const NodeIcon = topologyNodeIcons[nodeType.icon] ?? BookOpenText;
            return (
              <button
                key={node.id}
                className={`topology-node-card is-${nodeType.cardVariant}${
                  current ? " is-current" : ""
                }${node.manual ? " is-manual" : ""}${nodeType.interactive ? " is-interactive" : ""}`}
                type="button"
                style={
                  {
                    left: position.x,
                    top: position.y,
                    "--topology-card-color": nodeType.color
                  } as CSSProperties
                }
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  if (node.manual) {
                    openManualEditor(node.manual);
                    setSelectedInteractiveId(null);
                  } else if (fullScreen && nodeType.interactive) {
                    setSelectedInteractiveId(node.id);
                    setSelectedManualId(null);
                  } else if (!fullScreen && node.article) {
                    onNavigate(node.article.id);
                  }
                }}
                onDoubleClick={(event) => {
                  if (node.article) handleNodeDoubleClick(event, node.article.id);
                }}
                aria-current={current ? "page" : undefined}
              >
                <span className="topology-node-card-head">
                  <span className="topology-node-card-icon" aria-hidden="true">
                    <NodeIcon size={16} />
                  </span>
                  <strong>{nodeType.name}</strong>
                </span>
                <h3 className="topology-node-card-title">{node.title}</h3>
                {fullScreen && (
                  <p className="topology-node-card-summary">{node.summary}</p>
                )}
                <footer className="topology-node-card-footer">
                  <span>第 {position.depth + 1} 层</span>
                  <span>
                    {displayEdges.filter((edge) => edge.sourceId === node.id).length} 条关系
                  </span>
                  {node.manual && <span>SQLite</span>}
                  {current && (
                    <em className="topology-node-card-current">当前</em>
                  )}
                </footer>
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
            {fullScreen && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setComposer("root");
                    setDraftTitle("");
                    setDraftContent("");
                  }}
                  aria-label="新建根节点"
                >
                  <BookOpenText aria-hidden="true" size={16} />
                </button>
                <button
                  type="button"
                  disabled={!manualNodeTypes.length}
                  onClick={() => {
                    setComposer("manual");
                    setDraftTitle("");
                    setDraftContent("");
                    setDraftAsRoot(false);
                  }}
                  aria-label="新建手动节点"
                >
                  <Plus aria-hidden="true" size={16} />
                </button>
              </>
            )}
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
            <span>{fullScreen ? "双击进入文章 · 单击编辑手动节点" : "拖动 · 滚轮缩放"}</span>
            <kbd>{formatShortcut(focusShortcut)}</kbd>
          </div>
        </div>
      </div>
      {fullScreen && topologyError && (
        <div className="topology-storage-error" role="status">
          SQLite 暂不可用：{topologyError}
        </div>
      )}
      {fullScreen && composer && (
        <section className="topology-node-editor is-composer" aria-label="创建拓扑节点">
          <header>
            <div>
              <span>{composer === "root" ? "MARKDOWN ROOT" : "SQLITE NODE"}</span>
              <strong>{composer === "root" ? "新建根节点" : "新建手动节点"}</strong>
            </div>
            <button type="button" onClick={() => setComposer(null)} aria-label="关闭创建面板">
              <X aria-hidden="true" size={16} />
            </button>
          </header>
          {composer === "manual" && (
            <label>
              <span>节点类型</span>
              <select value={draftTypeId} onChange={(event) => setDraftTypeId(event.target.value)}>
                {manualNodeTypes.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>标题</span>
            <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} autoFocus />
          </label>
          <label>
            <span>{composer === "root" ? "Markdown 正文" : "节点内容"}</span>
            <textarea value={draftContent} onChange={(event) => setDraftContent(event.target.value)} rows={7} />
          </label>
          {composer === "manual" && (
            <label className="topology-node-editor-check">
              <input
                type="checkbox"
                checked={draftAsRoot}
                onChange={(event) => setDraftAsRoot(event.target.checked)}
              />
              <span>作为独立根节点；否则连接到当前阅读节点</span>
            </label>
          )}
          <footer>
            <small>
              {composer === "root"
                ? "正文保存为 Markdown；同一内容集合可有多个根节点。"
                : "手动内容只写入 SQLite，不创建或修改 Markdown 文件。"}
            </small>
            <button type="button" disabled={!draftTitle.trim() || editorBusy} onClick={() => void submitComposer()}>
              <Plus aria-hidden="true" size={15} />
              创建
            </button>
          </footer>
        </section>
      )}
      {fullScreen && selectedManualNode && !composer && (
        <section className="topology-node-editor" aria-label="编辑手动节点">
          <header>
            <div>
              <span>SQLITE NODE</span>
              <strong>{selectedManualNode.title}</strong>
            </div>
            <button type="button" onClick={() => setSelectedManualId(null)} aria-label="关闭节点编辑器">
              <X aria-hidden="true" size={16} />
            </button>
          </header>
          <label>
            <span>标题</span>
            <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
          </label>
          <label>
            <span>内容</span>
            <textarea value={draftContent} onChange={(event) => setDraftContent(event.target.value)} rows={7} />
          </label>
          {selectedManualNode.interactive && (
            <div className="topology-node-interaction">
              <strong>节点互动</strong>
              {selectedManualNode.nodeType === "checklist" ? (
                draftContent.split(/\r?\n/).filter(Boolean).map((item, index) => {
                  const checked = Array.isArray(selectedInteractionState.checked)
                    ? (selectedInteractionState.checked as number[]).includes(index)
                    : false;
                  return (
                    <label key={`${index}-${item}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const values = new Set(
                            Array.isArray(selectedInteractionState.checked)
                              ? (selectedInteractionState.checked as number[])
                              : []
                          );
                          if (checked) values.delete(index); else values.add(index);
                          void updateInteractionState({ ...selectedInteractionState, checked: [...values] });
                        }}
                      />
                      <span>{item.replace(/^[-*]\s*/, "")}</span>
                    </label>
                  );
                })
              ) : selectedManualNode.nodeType === "flashcard" ? (
                <button
                  type="button"
                  onClick={() => void updateInteractionState({
                    ...selectedInteractionState,
                    revealed: !selectedInteractionState.revealed
                  })}
                >
                  {selectedInteractionState.revealed ? draftContent || "暂无答案" : "点击显示答案"}
                </button>
              ) : (
                <textarea
                  rows={3}
                  placeholder="填写你的回应"
                  defaultValue={typeof selectedInteractionState.response === "string" ? selectedInteractionState.response : ""}
                  onBlur={(event) => void updateInteractionState({
                    ...selectedInteractionState,
                    response: event.target.value
                  })}
                />
              )}
            </div>
          )}
          <div className="topology-relation-editor">
            <strong>连接到其他节点</strong>
            <select value={relationTargetId} onChange={(event) => setRelationTargetId(event.target.value)}>
              <option value="">选择目标节点</option>
              {Object.values(displayNodes).filter((node) => node.id !== selectedManualNode.id).map((node) => (
                <option key={node.id} value={node.id}>{node.title}</option>
              ))}
            </select>
            <input value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} placeholder="关系名称" />
            <button
              type="button"
              disabled={!relationTargetId}
              onClick={() => {
                void onCreateRelation(selectedManualNode.id, relationTargetId, relationLabel);
                setRelationTargetId("");
              }}
            >
              <Plus aria-hidden="true" size={14} /> 建立关系
            </button>
            <div className="topology-relation-list">
              {displayEdges.filter((edge) => edge.persisted && (edge.sourceId === selectedManualNode.id || edge.targetId === selectedManualNode.id)).map((edge) => (
                <span key={edge.id}>
                  {edge.label || "关联"}
                  <button type="button" onClick={() => void onRemoveRelation(edge.id)} aria-label="删除关系">
                    <Unlink aria-hidden="true" size={13} />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <footer>
            <button
              className="is-danger"
              type="button"
              onClick={() => {
                void onRemoveManualNode(selectedManualNode.id);
                setSelectedManualId(null);
              }}
            >
              <Trash2 aria-hidden="true" size={15} /> 删除节点
            </button>
            <button type="button" disabled={editorBusy} onClick={() => void updateSelectedManual()}>
              保存修改
            </button>
          </footer>
        </section>
      )}
      {fullScreen && selectedInteractiveNode && !composer && !selectedManualNode && (
        <section className="topology-node-editor topology-interactive-editor" aria-label="节点互动">
          <header>
            <div>
              <span>INTERACTIVE CARD</span>
              <strong>{selectedInteractiveNode.title}</strong>
            </div>
            <button type="button" onClick={() => setSelectedInteractiveId(null)} aria-label="关闭互动面板">
              <X aria-hidden="true" size={16} />
            </button>
          </header>
          <p>{selectedInteractiveNode.summary || "该节点已开启拓扑互动。"}</p>
          {selectedInteractiveNode.nodeType.cardVariant === "checklist" ? (
            <div className="topology-node-interaction">
              {selectedInteractiveNode.summary.split(/[；;。\n]/).filter(Boolean).map((item, index) => {
                const checked = Array.isArray(selectedGraphInteractionState.checked)
                  ? (selectedGraphInteractionState.checked as number[]).includes(index)
                  : false;
                return (
                  <label key={`${index}-${item}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const values = new Set(
                          Array.isArray(selectedGraphInteractionState.checked)
                            ? (selectedGraphInteractionState.checked as number[])
                            : []
                        );
                        if (checked) values.delete(index); else values.add(index);
                        void onUpdateInteraction(
                          selectedInteractiveNode.id,
                          "checklist",
                          { ...selectedGraphInteractionState, checked: [...values] }
                        );
                      }}
                    />
                    <span>{item.trim()}</span>
                  </label>
                );
              })}
            </div>
          ) : selectedInteractiveNode.nodeType.cardVariant === "flashcard" ? (
            <button
              className="topology-flashcard-reveal"
              type="button"
              onClick={() => void onUpdateInteraction(
                selectedInteractiveNode.id,
                "flashcard",
                { ...selectedGraphInteractionState, revealed: !selectedGraphInteractionState.revealed }
              )}
            >
              {selectedGraphInteractionState.revealed
                ? selectedInteractiveNode.summary || "暂无答案"
                : "点击翻开卡片"}
            </button>
          ) : (
            <label>
              <span>你的回应</span>
              <textarea
                rows={5}
                defaultValue={typeof selectedGraphInteractionState.response === "string" ? selectedGraphInteractionState.response : ""}
                onBlur={(event) => void onUpdateInteraction(
                  selectedInteractiveNode.id,
                  "response",
                  { ...selectedGraphInteractionState, response: event.target.value }
                )}
              />
            </label>
          )}
          <footer>
            <small>互动状态存入 SQLite，不改写节点对应的 Markdown 正文。</small>
          </footer>
        </section>
      )}
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
