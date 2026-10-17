import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ArticleNode, Notebook } from "../types";
import { jsonObject, type JsonObject } from "./json";
import * as browser from "./browserTopologyAdapter";

export interface TopologyCollectionRecord {
  id: string; title: string; description: string; createdAt: string; updatedAt: string;
}
export interface TopologyNodeRecord {
  id: string; collectionId: string; nodeType: string; title: string; summary: string;
  contentMode: "markdown" | "database"; content: string | null; documentId: string | null;
  isRoot: boolean; isManual: boolean; enabled: boolean; interactive: boolean;
  interactionStateJson: JsonObject; appearanceJson: JsonObject;
  family?: string; creationMethod?: string;
  contentJson?: JsonObject | null; anchorJson?: JsonObject | null;
  generationJson?: JsonObject | null; configJson?: JsonObject | null;
  createdAt: string; updatedAt: string;
}
export interface TopologyRelationRecord {
  id: string; collectionId: string; sourceNodeId: string; targetNodeId: string;
  relationType: string; label: string; directed: boolean; metadataJson: JsonObject;
  createdAt: string; updatedAt: string;
}
export interface TopologyInteractionRecord {
  id: string; nodeId: string; interactionType: string; title: string;
  configJson: JsonObject; stateJson: JsonObject; enabled: boolean;
  createdAt: string; updatedAt: string;
}
export interface TopologyGraphRecord {
  collection: TopologyCollectionRecord; nodes: TopologyNodeRecord[];
  relations: TopologyRelationRecord[]; interactions: TopologyInteractionRecord[];
}
type JsonInput = JsonObject | null;
export type UpsertTopologyNode = Omit<TopologyNodeRecord,
  "createdAt" | "updatedAt" | "interactionStateJson" | "appearanceJson" |
  "contentJson" | "anchorJson" | "generationJson" | "configJson"
> & {
  interactionStateJson: JsonInput; appearanceJson: JsonInput;
  contentJson?: JsonInput; anchorJson?: JsonInput; generationJson?: JsonInput; configJson?: JsonInput;
};
export type UpsertTopologyRelation = Omit<TopologyRelationRecord,
  "createdAt" | "updatedAt" | "metadataJson"
> & { metadataJson: JsonInput };
export type UpsertTopologyInteraction = Omit<TopologyInteractionRecord,
  "createdAt" | "updatedAt" | "configJson" | "stateJson"
> & { configJson: JsonInput; stateJson: JsonInput };
export type WireNode = Omit<UpsertTopologyNode,
  "interactionStateJson" | "appearanceJson" | "contentJson" | "anchorJson" | "generationJson" | "configJson"
> & {
  interactionStateJson: string | JsonInput; appearanceJson: string | JsonInput;
  contentJson?: string | JsonInput; anchorJson?: string | JsonInput;
  generationJson?: string | JsonInput; configJson?: string | JsonInput;
  createdAt: string; updatedAt: string;
};
export type WireRelation = Omit<UpsertTopologyRelation, "metadataJson"> & {
  metadataJson: string | JsonInput; createdAt: string; updatedAt: string;
};
export type WireInteraction = Omit<UpsertTopologyInteraction, "configJson" | "stateJson"> & {
  configJson: string | JsonInput; stateJson: string | JsonInput;
  createdAt: string; updatedAt: string;
};
type WireGraph = {
  collection: TopologyCollectionRecord; nodes: WireNode[];
  relations: WireRelation[]; interactions: WireInteraction[];
};

function decodeJson(value: unknown, field: string): JsonObject {
  if (value === null || value === undefined || value === "") return {};
  let decoded = value;
  if (typeof value === "string") {
    try { decoded = JSON.parse(value); }
    catch { throw new Error(`${field} 包含无效 JSON`); }
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error(`${field} 必须是 JSON 对象`);
  }
  return jsonObject(decoded);
}
function decodeOptional(value: unknown, field: string): JsonObject | null | undefined {
  return value === null || value === undefined ? value : decodeJson(value, field);
}
function decodeNode(node: WireNode): TopologyNodeRecord {
  return {
    ...node,
    interactionStateJson: decodeJson(node.interactionStateJson, "interactionStateJson"),
    appearanceJson: decodeJson(node.appearanceJson, "appearanceJson"),
    contentJson: decodeOptional(node.contentJson, "contentJson"),
    anchorJson: decodeOptional(node.anchorJson, "anchorJson"),
    generationJson: decodeOptional(node.generationJson, "generationJson"),
    configJson: decodeOptional(node.configJson, "configJson")
  };
}
function decodeRelation(relation: WireRelation): TopologyRelationRecord {
  return { ...relation, metadataJson: decodeJson(relation.metadataJson, "metadataJson") };
}
function decodeInteraction(interaction: WireInteraction): TopologyInteractionRecord {
  return {
    ...interaction,
    configJson: decodeJson(interaction.configJson, "configJson"),
    stateJson: decodeJson(interaction.stateJson, "stateJson")
  };
}
function decodeGraph(graph: WireGraph): TopologyGraphRecord {
  return {
    collection: graph.collection, nodes: graph.nodes.map(decodeNode),
    relations: graph.relations.map(decodeRelation), interactions: graph.interactions.map(decodeInteraction)
  };
}
export function decodeTopologyGraph(value: unknown): TopologyGraphRecord {
  if (!value || typeof value !== "object") throw new Error("拓扑图数据无效");
  const graph = value as WireGraph;
  if (!graph.collection || !Array.isArray(graph.nodes) ||
      !Array.isArray(graph.relations) || !Array.isArray(graph.interactions)) {
    throw new Error("拓扑图数据结构无效");
  }
  return decodeGraph(graph);
}
function encodeNode(node: UpsertTopologyNode) {
  return {
    ...node,
    interactionStateJson: JSON.stringify(node.interactionStateJson ?? {}),
    appearanceJson: JSON.stringify(node.appearanceJson ?? {}),
    contentJson: node.contentJson == null ? node.contentJson : JSON.stringify(node.contentJson),
    anchorJson: node.anchorJson == null ? node.anchorJson : JSON.stringify(node.anchorJson),
    generationJson: node.generationJson == null ? node.generationJson : JSON.stringify(node.generationJson),
    configJson: node.configJson == null ? node.configJson : JSON.stringify(node.configJson)
  };
}
function encodeRelation(relation: UpsertTopologyRelation) {
  return { ...relation, metadataJson: JSON.stringify(relation.metadataJson ?? {}) };
}
function encodeInteraction(interaction: UpsertTopologyInteraction) {
  return {
    ...interaction,
    configJson: JSON.stringify(interaction.configJson ?? {}),
    stateJson: JSON.stringify(interaction.stateJson ?? {})
  };
}
export function setBrowserLibraryMetadata(metadata: { notebooks: Notebook[]; articles: Record<string, ArticleNode> }) {
  browser.setLibraryMetadata(metadata);
}
export async function loadTopologyGraph(collectionId: string): Promise<TopologyGraphRecord> {
  const graph = isTauri()
    ? await invoke<WireGraph>("load_topology_graph", { collectionId })
    : browser.loadTopologyGraph(collectionId);
  return decodeGraph(graph);
}
export async function upsertTopologyNode(request: UpsertTopologyNode): Promise<TopologyNodeRecord> {
  if (request.isManual && request.contentMode !== "database") throw new Error("手动节点不能关联 Markdown");
  const encoded = encodeNode(request);
  const record = isTauri()
    ? await invoke<WireNode>("upsert_topology_node", { request: encoded })
    : browser.upsertTopologyNode(encoded);
  return decodeNode(record);
}
export async function deleteTopologyNode(nodeId: string): Promise<boolean> {
  return isTauri() ? invoke("delete_topology_node", { nodeId }) : browser.deleteTopologyNode(nodeId);
}
export async function upsertTopologyRelation(request: UpsertTopologyRelation): Promise<TopologyRelationRecord> {
  if (request.sourceNodeId === request.targetNodeId) throw new Error("拓扑关系不能连接节点自身");
  const encoded = encodeRelation(request);
  const record = isTauri()
    ? await invoke<WireRelation>("upsert_topology_relation", { request: encoded })
    : browser.upsertTopologyRelation(encoded);
  return decodeRelation(record);
}
export async function deleteTopologyRelation(relationId: string): Promise<boolean> {
  return isTauri() ? invoke("delete_topology_relation", { relationId }) : browser.deleteTopologyRelation(relationId);
}
export async function upsertTopologyInteraction(request: UpsertTopologyInteraction): Promise<TopologyInteractionRecord> {
  const encoded = encodeInteraction(request);
  const record = isTauri()
    ? await invoke<WireInteraction>("upsert_topology_interaction", { request: encoded })
    : browser.upsertTopologyInteraction(encoded);
  return decodeInteraction(record);
}
