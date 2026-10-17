import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppData } from "../types";

export interface LibraryMetadata {
  notebooks: AppData["notebooks"];
  articles: AppData["articles"];
}

let desktopWriteQueue: Promise<void> = Promise.resolve();

export function isDesktopLibrary(): boolean {
  return isTauri();
}

export async function loadDesktopLibrary(): Promise<LibraryMetadata> {
  return invoke<LibraryMetadata>("load_library_metadata");
}

export function replaceDesktopLibrary(metadata: LibraryMetadata): Promise<void> {
  const operation = desktopWriteQueue.catch(() => undefined).then(() =>
    invoke<void>("replace_library_metadata", { metadata })
  );
  desktopWriteQueue = operation;
  return operation;
}

export function awaitDesktopLibraryWrites(): Promise<void> {
  return desktopWriteQueue;
}
