import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppData } from "../types";

export interface LibraryMetadata {
  notebooks: AppData["notebooks"];
  articles: AppData["articles"];
}

export interface LibraryLoadResult {
  metadata: LibraryMetadata;
  importedLegacy: boolean;
}

let desktopWriteQueue: Promise<void> = Promise.resolve();

export function isDesktopLibrary(): boolean {
  return isTauri();
}

export async function loadDesktopLibrary(
  legacyMetadata: LibraryMetadata | null
): Promise<LibraryLoadResult> {
  return invoke<LibraryLoadResult>("load_library_metadata", {
    legacyMetadata
  });
}

export function replaceDesktopLibrary(metadata: LibraryMetadata): Promise<void> {
  const operation = desktopWriteQueue.then(() =>
    invoke<void>("replace_library_metadata", { metadata })
  );
  desktopWriteQueue = operation.catch(() => undefined);
  return operation;
}

export function awaitDesktopLibraryWrites(): Promise<void> {
  return desktopWriteQueue;
}
