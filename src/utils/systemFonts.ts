import { invoke, isTauri } from "@tauri-apps/api/core";

type FontCatalogSource = "loading" | "system" | "builtin" | "error";

export interface SystemFontCatalog {
  families: string[];
  source: FontCatalogSource;
  error?: string;
}

export const initialSystemFontCatalog: SystemFontCatalog = {
  families: [],
  source: "loading"
};

export async function loadSystemFontCatalog(): Promise<SystemFontCatalog> {
  if (!isTauri()) {
    return { families: [], source: "builtin" };
  }

  try {
    const values = await invoke<string[]>("list_system_fonts");

    const families = Array.from(
      new Map(
        values
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => [value.toLocaleLowerCase("zh-CN"), value])
      ).values()
    ).sort((left, right) => left.localeCompare(right, "zh-CN"));

    return families.length
      ? { families, source: "system" }
      : { families: [], source: "builtin" };
  } catch (error) {
    return {
      families: [],
      source: "error",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
