import { invoke, isTauri } from "@tauri-apps/api/core";
import { markdownToPlainText } from "./markdownDocument";

const BROWSER_DOCUMENT_PREFIX = "annota:markdown-document.v1:";
const documentSessions = new Map<string, string>();
const searchableDocuments = new Map<string, { content: string; text: string }>();
const searchDocumentListeners = new Set<
  (documentId: string, searchableText: string) => void
>();

export interface MarkdownDocumentSnapshot {
  content: string;
  relativePath: string;
}

function assertDocumentId(documentId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(documentId)) {
    throw new Error("文档标识无效");
  }
}

function browserStorageKey(documentId: string) {
  return `${BROWSER_DOCUMENT_PREFIX}${documentId}`;
}

function searchableDocumentText(documentId: string, content: string) {
  const cached = searchableDocuments.get(documentId);
  if (cached?.content === content) return cached.text;
  const text = markdownToPlainText(content).toLocaleLowerCase("zh-CN");
  searchableDocuments.set(documentId, { content, text });
  return text;
}

function publishSavedDocument(documentId: string, content: string) {
  if (!searchableDocuments.has(documentId) && !searchDocumentListeners.size) return;
  const previous = searchableDocuments.get(documentId)?.text;
  const text = searchableDocumentText(documentId, content);
  if (text === previous) return;
  searchDocumentListeners.forEach((listener) => listener(documentId, text));
}

export async function loadMarkdownDocument(
  documentId: string,
  initialContent = ""
): Promise<MarkdownDocumentSnapshot> {
  assertDocumentId(documentId);
  const sessionContent = documentSessions.get(documentId);
  if (sessionContent !== undefined) {
    return { content: sessionContent, relativePath: `session/${documentId}.md` };
  }
  if (isTauri()) {
    const snapshot = await invoke<MarkdownDocumentSnapshot>("load_markdown_document", {
      documentId,
      initialContent
    });
    documentSessions.set(documentId, snapshot.content);
    return snapshot;
  }
  const key = browserStorageKey(documentId);
  const stored = window.localStorage.getItem(key);
  if (stored !== null) {
    documentSessions.set(documentId, stored);
    return { content: stored, relativePath: `browser/${documentId}.md` };
  }
  window.localStorage.setItem(key, initialContent);
  documentSessions.set(documentId, initialContent);
  return { content: initialContent, relativePath: `browser/${documentId}.md` };
}

export function updateMarkdownSession(documentId: string, content: string) {
  assertDocumentId(documentId);
  documentSessions.set(documentId, content);
}

export async function loadMarkdownSearchText(documentId: string) {
  const snapshot = await loadMarkdownDocument(documentId);
  return searchableDocumentText(documentId, snapshot.content);
}

export function subscribeMarkdownSearchDocuments(
  listener: (documentId: string, searchableText: string) => void
) {
  searchDocumentListeners.add(listener);
  return () => searchDocumentListeners.delete(listener);
}

export function pruneMarkdownSearchDocuments(documentIds: readonly string[]) {
  const retained = new Set(documentIds);
  searchableDocuments.forEach((_, documentId) => {
    if (!retained.has(documentId)) searchableDocuments.delete(documentId);
  });
}

export async function saveMarkdownDocument(
  documentId: string,
  content: string
): Promise<MarkdownDocumentSnapshot> {
  assertDocumentId(documentId);
  documentSessions.set(documentId, content);
  if (isTauri()) {
    const snapshot = await invoke<MarkdownDocumentSnapshot>("save_markdown_document", {
      documentId,
      content
    });
    publishSavedDocument(documentId, snapshot.content);
    return snapshot;
  }
  window.localStorage.setItem(browserStorageKey(documentId), content);
  publishSavedDocument(documentId, content);
  return { content, relativePath: `browser/${documentId}.md` };
}

export function clearBrowserMarkdownDocuments() {
  if (typeof window === "undefined") return;
  Object.keys(window.localStorage)
    .filter((key) => key.startsWith(BROWSER_DOCUMENT_PREFIX))
    .forEach((key) => window.localStorage.removeItem(key));
  documentSessions.clear();
  searchableDocuments.clear();
  searchDocumentListeners.clear();
}
