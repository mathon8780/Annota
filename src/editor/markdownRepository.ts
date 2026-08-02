import { invoke, isTauri } from "@tauri-apps/api/core";

const BROWSER_DOCUMENT_PREFIX = "annota:markdown-document.v1:";
const documentSessions = new Map<string, string>();

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

export async function saveMarkdownDocument(
  documentId: string,
  content: string
): Promise<MarkdownDocumentSnapshot> {
  assertDocumentId(documentId);
  documentSessions.set(documentId, content);
  if (isTauri()) {
    return invoke<MarkdownDocumentSnapshot>("save_markdown_document", {
      documentId,
      content
    });
  }
  window.localStorage.setItem(browserStorageKey(documentId), content);
  return { content, relativePath: `browser/${documentId}.md` };
}

export function clearBrowserMarkdownDocuments() {
  if (typeof window === "undefined") return;
  Object.keys(window.localStorage)
    .filter((key) => key.startsWith(BROWSER_DOCUMENT_PREFIX))
    .forEach((key) => window.localStorage.removeItem(key));
  documentSessions.clear();
}
