import type { ArticleNode, Notebook } from "../types";
import type {
  TopologyCollectionRecord, WireInteraction, WireNode, WireRelation
} from "./topologyRepository";

type StoredNode = WireNode;
type StoredRelation = WireRelation;
type StoredInteraction = WireInteraction;
interface BrowserState {
  collections: Record<string, TopologyCollectionRecord>;
  nodes: Record<string, StoredNode>;
  relations: Record<string, StoredRelation>;
  interactions: Record<string, StoredInteraction>;
}
const BROWSER_KEY = "annota.topology.sqlite-mock.v1";
let libraryMetadata: { notebooks: Notebook[]; articles: Record<string, ArticleNode> } | null = null;

export function setLibraryMetadata(metadata: { notebooks: Notebook[]; articles: Record<string, ArticleNode> }) {
  libraryMetadata = metadata;
}
function readState(): BrowserState {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BROWSER_KEY) ?? "null") as Partial<BrowserState> | null;
    return {
      collections: parsed?.collections ?? {}, nodes: parsed?.nodes ?? {},
      relations: parsed?.relations ?? {}, interactions: parsed?.interactions ?? {}
    };
  } catch {
    return { collections: {}, nodes: {}, relations: {}, interactions: {} };
  }
}
function writeState(state: BrowserState) {
  window.localStorage.setItem(BROWSER_KEY, JSON.stringify(state));
}
const now = () => new Date().toISOString();

function derivedGraph(state: BrowserState, collectionId: string) {
  const notebook = libraryMetadata?.notebooks.find((item) => item.id === collectionId);
  const storedCollection = state.collections[collectionId];
  if (!notebook && !storedCollection) throw new Error("集合不存在");
  const collection = notebook
    ? {
        id: notebook.id, title: notebook.title, description: notebook.description || notebook.summary,
        createdAt: storedCollection?.createdAt ?? notebook.updatedAt, updatedAt: notebook.updatedAt
      }
    : storedCollection;
  const storedNodes = Object.values(state.nodes).filter((node) => node.collectionId === collectionId);
  const rootIds = new Set(notebook?.rootIds ?? []);
  const articles = notebook
    ? Object.values(libraryMetadata?.articles ?? {}).filter((article) =>
        rootIds.has(article.rootId) || rootIds.has(article.id))
    : [];
  const articleNodes: StoredNode[] = articles.map((article) => ({
    id: article.id, collectionId, nodeType: article.appearance?.typeId ?? (article.parentId ? "explain" : "root"),
    title: article.title, summary: article.summary, contentMode: "markdown",
    content: null, documentId: article.id, isRoot: article.parentId === null,
    isManual: false, enabled: true, interactive: false, interactionStateJson: {},
    appearanceJson: article.appearance ?? {}, family: article.family ?? "笔记",
    creationMethod: article.creationMethod ?? "手动",
    contentJson: article.contentJson,
    anchorJson: article.anchorJson,
    generationJson: article.generationJson,
    configJson: article.configJson,
    createdAt: article.createdAt, updatedAt: article.updatedAt
  }));
  const nodes = notebook
    ? [...articleNodes, ...storedNodes.filter((node) => node.contentMode === "database")]
    : storedNodes;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const articleRelations: StoredRelation[] = articles.flatMap((article) =>
    article.childIds.filter((childId) => nodeIds.has(childId)).map((childId) => ({
      id: `tree:${article.id}:${childId}`, collectionId, sourceNodeId: article.id,
      targetNodeId: childId, relationType: "contains",
      label: libraryMetadata?.articles[childId]?.type ?? "下一级", directed: true,
      metadataJson: '{"source":"markdown-tree"}',
      createdAt: article.createdAt, updatedAt: article.updatedAt
    }))
  );
  const storedRelations = Object.values(state.relations).filter((relation) =>
    relation.collectionId === collectionId && nodeIds.has(relation.sourceNodeId) &&
    nodeIds.has(relation.targetNodeId) && (!notebook || !relation.id.startsWith("tree:")));
  return {
    collection, nodes,
    relations: [...articleRelations, ...storedRelations],
    interactions: Object.values(state.interactions).filter((item) => nodeIds.has(item.nodeId))
  };
}
export function loadTopologyGraph(collectionId: string) {
  return derivedGraph(readState(), collectionId);
}
export function upsertTopologyNode(request: Omit<WireNode, "createdAt" | "updatedAt">): StoredNode {
  const state = readState();
  const value = { ...request, createdAt: state.nodes[request.id]?.createdAt ?? now(), updatedAt: now() };
  state.nodes[request.id] = value;
  writeState(state);
  return value;
}
export function deleteTopologyNode(nodeId: string) {
  const state = readState();
  const existed = Boolean(state.nodes[nodeId]);
  delete state.nodes[nodeId];
  Object.values(state.relations).forEach((relation) => {
    if (relation.sourceNodeId === nodeId || relation.targetNodeId === nodeId) delete state.relations[relation.id];
  });
  Object.values(state.interactions).forEach((interaction) => {
    if (interaction.nodeId === nodeId) delete state.interactions[interaction.id];
  });
  writeState(state);
  return existed;
}
export function upsertTopologyRelation(request: Omit<WireRelation, "createdAt" | "updatedAt">): StoredRelation {
  const state = readState();
  const value = { ...request, createdAt: state.relations[request.id]?.createdAt ?? now(), updatedAt: now() };
  state.relations[request.id] = value;
  writeState(state);
  return value;
}
export function deleteTopologyRelation(relationId: string) {
  const state = readState();
  const existed = Boolean(state.relations[relationId]);
  delete state.relations[relationId];
  writeState(state);
  return existed;
}
export function upsertTopologyInteraction(request: Omit<WireInteraction, "createdAt" | "updatedAt">): StoredInteraction {
  const state = readState();
  const value = { ...request, createdAt: state.interactions[request.id]?.createdAt ?? now(), updatedAt: now() };
  state.interactions[request.id] = value;
  writeState(state);
  return value;
}
