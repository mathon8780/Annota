import { invoke, isTauri } from "@tauri-apps/api/core";

export type FontCatalogSource = "loading" | "system" | "builtin" | "error";

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
    const values = await invoke<unknown>("list_system_fonts");
    if (!Array.isArray(values)) {
      throw new Error("系统字体命令返回了无效数据");
    }

    const families = Array.from(
      new Map(
        values
          .filter((value): value is string => typeof value === "string")
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
