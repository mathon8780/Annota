import { invoke, isTauri } from "@tauri-apps/api/core";

export interface TopologyCollectionRecord {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface TopologyNodeRecord {
  id: string;
  collectionId: string;
  nodeType: string;
  title: string;
  summary: string;
  contentMode: "markdown" | "database";
  content: string | null;
  documentId: string | null;
  isRoot: boolean;
  isManual: boolean;
  enabled: boolean;
  interactive: boolean;
  interactionStateJson: string;
  appearanceJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface TopologyRelationRecord {
  id: string;
  collectionId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: string;
  label: string;
  directed: boolean;
  metadataJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface TopologyInteractionRecord {
  id: string;
  nodeId: string;
  interactionType: string;
  title: string;
  configJson: string;
  stateJson: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TopologyGraphRecord {
  collection: TopologyCollectionRecord;
  nodes: TopologyNodeRecord[];
  relations: TopologyRelationRecord[];
  interactions: TopologyInteractionRecord[];
}

export type UpsertTopologyNode = Omit<TopologyNodeRecord, "createdAt" | "updatedAt">;
export type UpsertTopologyRelation = Omit<
  TopologyRelationRecord,
  "createdAt" | "updatedAt"
>;
export type UpsertTopologyInteraction = Omit<
  TopologyInteractionRecord,
  "createdAt" | "updatedAt"
>;

export interface SyncMarkdownTopologyRequest {
  collection: {
    id: string;
    title: string;
    description: string;
  };
  nodes: UpsertTopologyNode[];
  relations: UpsertTopologyRelation[];
}

interface BrowserState {
  collections: Record<string, TopologyCollectionRecord>;
  nodes: Record<string, TopologyNodeRecord>;
  relations: Record<string, TopologyRelationRecord>;
  interactions: Record<string, TopologyInteractionRecord>;
}

const BROWSER_KEY = "annota.topology.sqlite-mock.v1";

function emptyState(): BrowserState {
  return { collections: {}, nodes: {}, relations: {}, interactions: {} };
}

function readState(): BrowserState {
  if (typeof window === "undefined") return emptyState();
  try {
    const value = JSON.parse(window.localStorage.getItem(BROWSER_KEY) ?? "null") as Partial<BrowserState> | null;
    return value && typeof value === "object"
      ? {
          collections: value.collections ?? {},
          nodes: value.nodes ?? {},
          relations: value.relations ?? {},
          interactions: value.interactions ?? {}
        }
      : emptyState();
  } catch {
    return emptyState();
  }
}

function writeState(state: BrowserState) {
  window.localStorage.setItem(BROWSER_KEY, JSON.stringify(state));
}

function now() {
  return new Date().toISOString();
}

function browserGraph(
  state: BrowserState,
  collectionId: string
): TopologyGraphRecord {
  const collection = state.collections[collectionId];
  if (!collection) throw new Error("内容集合不存在");
  const nodes = Object.values(state.nodes).filter(
    (node) => node.collectionId === collectionId
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    collection,
    nodes,
    relations: Object.values(state.relations).filter(
      (relation) => relation.collectionId === collectionId
    ),
    interactions: Object.values(state.interactions).filter((item) =>
      nodeIds.has(item.nodeId)
    )
  };
}

export async function upsertTopologyCollection(request: {
  id: string;
  title: string;
  description: string;
}): Promise<TopologyCollectionRecord> {
  if (isTauri()) return invoke("upsert_topology_collection", { request });
  const state = readState();
  const previous = state.collections[request.id];
  const value = { ...request, createdAt: previous?.createdAt ?? now(), updatedAt: now() };
  state.collections[value.id] = value;
  writeState(state);
  return value;
}

export async function syncMarkdownTopology(
  request: SyncMarkdownTopologyRequest
): Promise<TopologyGraphRecord> {
  if (isTauri()) return invoke("sync_markdown_topology", { request });

  const state = readState();
  const timestamp = now();
  const previousCollection = state.collections[request.collection.id];
  state.collections[request.collection.id] = {
    ...request.collection,
    createdAt: previousCollection?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
  request.nodes.forEach((node) => {
    if (node.collectionId !== request.collection.id) {
      throw new Error("拓扑节点必须属于当前内容集合");
    }
    if (node.contentMode !== "markdown" || node.isManual) {
      throw new Error("批量同步只接受 Markdown 节点");
    }
    const previous = state.nodes[node.id];
    state.nodes[node.id] = {
      ...node,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
  });
  request.relations.forEach((relation) => {
    if (relation.collectionId !== request.collection.id) {
      throw new Error("拓扑关系必须属于当前内容集合");
    }
    if (relation.sourceNodeId === relation.targetNodeId) {
      throw new Error("拓扑关系不能连接节点自身");
    }
    const previous = state.relations[relation.id];
    state.relations[relation.id] = {
      ...relation,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
  });
  writeState(state);
  return browserGraph(state, request.collection.id);
}

export async function loadTopologyGraph(collectionId: string): Promise<TopologyGraphRecord> {
  if (isTauri()) return invoke("load_topology_graph", { collectionId });
  const state = readState();
  const collection = state.collections[collectionId];
  if (!collection) throw new Error("内容集合不存在");
  const nodes = Object.values(state.nodes).filter((node) => node.collectionId === collectionId);
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    collection,
    nodes,
    relations: Object.values(state.relations).filter(
      (relation) => relation.collectionId === collectionId
    ),
    interactions: Object.values(state.interactions).filter((item) => nodeIds.has(item.nodeId))
  };
}

export async function upsertTopologyNode(
  request: UpsertTopologyNode
): Promise<TopologyNodeRecord> {
  if (request.isManual && request.contentMode !== "database") {
    throw new Error("手动节点不能关联 Markdown");
  }
  if (isTauri()) return invoke("upsert_topology_node", { request });
  const state = readState();
  const previous = state.nodes[request.id];
  const value = { ...request, createdAt: previous?.createdAt ?? now(), updatedAt: now() };
  state.nodes[value.id] = value;
  writeState(state);
  return value;
}

export async function deleteTopologyNode(nodeId: string): Promise<boolean> {
  if (isTauri()) return invoke("delete_topology_node", { nodeId });
  const state = readState();
  const existed = Boolean(state.nodes[nodeId]);
  delete state.nodes[nodeId];
  Object.values(state.relations).forEach((relation) => {
    if (relation.sourceNodeId === nodeId || relation.targetNodeId === nodeId) {
      delete state.relations[relation.id];
    }
  });
  writeState(state);
  return existed;
}

export async function upsertTopologyRelation(
  request: UpsertTopologyRelation
): Promise<TopologyRelationRecord> {
  if (request.sourceNodeId === request.targetNodeId) throw new Error("拓扑关系不能连接节点自身");
  if (isTauri()) return invoke("upsert_topology_relation", { request });
  const state = readState();
  const previous = state.relations[request.id];
  const value = { ...request, createdAt: previous?.createdAt ?? now(), updatedAt: now() };
  state.relations[value.id] = value;
  writeState(state);
  return value;
}

export async function deleteTopologyRelation(relationId: string): Promise<boolean> {
  if (isTauri()) return invoke("delete_topology_relation", { relationId });
  const state = readState();
  const existed = Boolean(state.relations[relationId]);
  delete state.relations[relationId];
  writeState(state);
  return existed;
}

export async function upsertTopologyInteraction(
  request: UpsertTopologyInteraction
): Promise<TopologyInteractionRecord> {
  if (isTauri()) return invoke("upsert_topology_interaction", { request });
  const state = readState();
  const previous = state.interactions[request.id];
  const value = { ...request, createdAt: previous?.createdAt ?? now(), updatedAt: now() };
  state.interactions[value.id] = value;
  writeState(state);
  return value;
}
