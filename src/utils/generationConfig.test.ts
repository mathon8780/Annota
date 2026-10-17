import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArticleNode } from "../types";
import {
  createGenerationTypeIndex,
  GENERATION_TYPES_STORAGE_KEY,
  hydrateGenerationTypesFromDatabase,
  initialGenerationTypes,
  loadGenerationTypes,
  mergeNodeLevelConfig,
  normalizeNodeLevelConfig,
  resolveArticleGenerationType,
  saveGenerationTypes,
  TYPE_FAMILIES,
  type GenerationTypeConfig
} from "./generationConfig";

const tauriMock = vi.hoisted(() => ({ desktop: false, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => tauriMock.desktop,
  invoke: tauriMock.invoke
}));

afterEach(() => {
  tauriMock.desktop = false;
  tauriMock.invoke.mockReset();
  window.localStorage.removeItem(GENERATION_TYPES_STORAGE_KEY);
});

describe("topology node generation configuration", () => {
  it("resolves article node types through reusable lookup indexes", () => {
    const index = createGenerationTypeIndex(initialGenerationTypes);
    const article = {
      id: "child",
      rootId: "root",
      parentId: "root",
      title: "代码节点",
      summary: "",
      type: "任意旧标签",
      childIds: [],
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
      source: {
        parentId: "root",
        blockId: "block-1",
        quote: "code",
        generationType: "code"
      }
    } satisfies ArticleNode;

    expect(index.byId.get("translate")?.relationLabel).toBe("翻译");
    expect(resolveArticleGenerationType(article, index).id).toBe("code");
    expect(
      resolveArticleGenerationType(
        { ...article, source: undefined, type: "未知旧节点" },
        index
      ).id
    ).toBe("explain");
  });

  it("keeps built-in definitions unique and usable", () => {
    const ids = initialGenerationTypes.map((type) => type.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(createGenerationTypeIndex(initialGenerationTypes).root.id).toBe("root");
    expect(initialGenerationTypes.find((type) => type.id === "root")).toMatchObject({
      executionMode: "system", enabled: false
    });
    for (const type of initialGenerationTypes) {
      expect(type.icon).toBeTruthy();
      expect(type.cardVariant).toBeTruthy();
      expect(type.displayFields.length).toBeGreaterThan(0);
      if (type.executionMode !== "ai") {
        expect(type.systemPrompt).toBe("");
        expect(type.userPrompt).toBe("");
      }
    }
  });

  it("maps every built-in generation type to a contract family", () => {
    for (const type of initialGenerationTypes) {
      expect(TYPE_FAMILIES[type.id], `${type.id} 缺少家族映射`).toBeDefined();
      expect(type.family).toBe(TYPE_FAMILIES[type.id]);
    }
  });

  it("loads current saved types and appends missing built-ins", () => {
    window.localStorage.setItem(
      GENERATION_TYPES_STORAGE_KEY,
      JSON.stringify([
        {
          ...initialGenerationTypes.find((type) => type.id === "explain")!,
          id: "explain",
          name: "自定义解释",
          color: "#123456",
          enabled: false,
          modelBindingId: "deepseek:deepseek-chat",
          relationLabel: "说明",
          systemPrompt: "system {{output.language}}",
          userPrompt: "user {{selection.text}}",
          contextScope: "article"
        },
        {
          ...initialGenerationTypes.find((type) => type.id === "socratic")!,
          id: "socratic",
          name: "自定义追问",
          color: "#654321",
          enabled: true,
          modelBindingId: "global-default",
          relationLabel: "追问",
          systemPrompt: "question system",
          userPrompt: "question {{selection.text}}",
          contextScope: "nearbyParagraphs"
        }
      ])
    );

    const loaded = loadGenerationTypes();
    const explain = loaded.find((type) => type.id === "explain");
    const socratic = loaded.find((type) => type.id === "socratic");

    expect(loaded.map((type) => type.id)).toEqual(
      initialGenerationTypes.map((type) => type.id)
    );
    expect(explain).toMatchObject({
      name: "自定义解释",
      cardVariant: "explain",
      executionMode: "ai",
      isBuiltIn: true,
      enabled: false,
      contextScope: "article"
    });
    expect(socratic).toMatchObject({
      name: "自定义追问",
      cardVariant: "question",
      executionMode: "ai",
      isBuiltIn: true,
      enabled: true,
      contextScope: "nearbyParagraphs"
    });
    expect(loaded.find((type) => type.id === "flashcard")).toMatchObject({
      cardVariant: "flashcard",
      executionMode: "ai",
      isBuiltIn: true
    });
  });

  it("keeps manual node switches and interaction settings without prompt fields", () => {
    window.localStorage.setItem(
      GENERATION_TYPES_STORAGE_KEY,
      JSON.stringify([
        {
          ...initialGenerationTypes.find((type) => type.id === "highlight")!,
          id: "highlight",
          interactive: true,
          enabled: true,
        }
      ])
    );

    expect(loadGenerationTypes().find((type) => type.id === "highlight"))
      .toMatchObject({
        executionMode: "manual",
        enabled: true,
        interactive: true,
        modelBindingId: "global-default",
        systemPrompt: "",
        userPrompt: "",
        contextScope: "containingParagraph"
      });
  });

  it("keeps custom nodes after built-ins and persists their card presentation", async () => {
    const custom: GenerationTypeConfig = {
      ...initialGenerationTypes.find((type) => type.id === "explain")!,
      id: "custom-map",
      name: "概念地图",
      icon: "compare",
      cardVariant: "compare",
      isBuiltIn: false,
      enabled: true
    };

    await saveGenerationTypes([custom]);

    const loaded = loadGenerationTypes();
    expect(loaded.at(-1)).toEqual(custom);
    expect(loaded.filter((type) => type.id === "custom-map")).toHaveLength(1);
  });

  it("falls back to fresh topology defaults for malformed storage", () => {
    window.localStorage.setItem(GENERATION_TYPES_STORAGE_KEY, "not-json");

    expect(loadGenerationTypes()).toEqual(initialGenerationTypes);
  });

  it("uses SQLite directly for desktop configuration and propagates save errors", async () => {
    tauriMock.desktop = true;
    const customized = {
      ...initialGenerationTypes.find((type) => type.id === "explain")!,
      name: "数据库解释"
    };
    tauriMock.invoke.mockResolvedValueOnce([customized]);
    const hydrated = await hydrateGenerationTypesFromDatabase();
    expect(hydrated.find((type) => type.id === "explain")?.name).toBe("数据库解释");
    expect(loadGenerationTypes().find((type) => type.id === "explain")?.name).toBe("数据库解释");
    expect(window.localStorage.getItem(GENERATION_TYPES_STORAGE_KEY)).toBeNull();
    tauriMock.invoke.mockRejectedValueOnce(new Error("磁盘写入失败"));
    await expect(saveGenerationTypes(hydrated)).rejects.toThrow("磁盘写入失败");
    expect(window.localStorage.getItem(GENERATION_TYPES_STORAGE_KEY)).toBeNull();
  });
});

describe("node-level config merge", () => {
  const base = initialGenerationTypes.find((type) => type.id === "explain")!;

  it("inherits type-level config when no node config is given", () => {
    expect(mergeNodeLevelConfig(null, base)).toEqual(base);
    expect(mergeNodeLevelConfig(undefined, base)).toEqual(base);
  });

  it("overrides only configured fields", () => {
    const merged = mergeNodeLevelConfig(
      {
        modelBindingId: "provider-a:gpt-4o",
        modelParameters: { temperature: 0.9 },
        displayFields: ["title", "content"]
      },
      base
    );
    expect(merged.modelBindingId).toBe("provider-a:gpt-4o");
    expect(merged.modelParameters.temperature).toBe(0.9);
    expect(merged.modelParameters.topP).toBe(base.modelParameters.topP);
    expect(merged.modelParameters.maxTokens).toBe(base.modelParameters.maxTokens);
    expect(merged.displayFields).toEqual(["title", "content"]);
    expect(merged.systemPrompt).toBe(base.systemPrompt);
    expect(merged.userPrompt).toBe(base.userPrompt);
  });

  it("keeps type-level displayFields when node displayFields is empty", () => {
    const merged = mergeNodeLevelConfig({ displayFields: [] }, base);
    expect(merged.displayFields).toEqual(base.displayFields);
  });

  it("normalizes malformed config payloads", () => {
    expect(normalizeNodeLevelConfig(null)).toBeNull();
    expect(normalizeNodeLevelConfig("string")).toBeNull();
    expect(normalizeNodeLevelConfig(42)).toBeNull();
    expect(normalizeNodeLevelConfig('{"displayFields":["title"]}')).toBeNull();
    const normalized = normalizeNodeLevelConfig({
      modelBindingId: "provider-a:gpt-4o",
      modelParameters: { temperature: 99, topP: -1, maxTokens: "many" },
      displayFields: ["title", "not-a-field", "model"],
      systemPrompt: "只用中文"
    })!;
    expect(normalized.modelBindingId).toBe("provider-a:gpt-4o");
    expect(normalized.modelParameters).toEqual({ temperature: 2, topP: 0 });
    expect(normalized.displayFields).toEqual(["title", "model"]);
    expect(normalized.systemPrompt).toBe("只用中文");
    expect(normalized.userPrompt).toBeUndefined();
  });

  it("drops to null when no valid field survives normalization", () => {
    expect(normalizeNodeLevelConfig({ displayFields: [] })).toBeNull();
    expect(normalizeNodeLevelConfig({ modelParameters: {} })).toBeNull();
  });
});
