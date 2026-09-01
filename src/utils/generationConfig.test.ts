import { afterEach, describe, expect, it } from "vitest";
import type { ArticleNode } from "../types";
import {
  createGenerationTypeIndex,
  GENERATION_TYPES_STORAGE_KEY,
  initialGenerationTypes,
  loadGenerationTypes,
  mergeNodeLevelConfig,
  normalizeNodeLevelConfig,
  resolveArticleGenerationType,
  saveGenerationTypes,
  TYPE_FAMILIES,
  type GenerationTypeConfig
} from "./generationConfig";

afterEach(() => {
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

    expect(index.byRelationLabel.get("翻译")?.id).toBe("translate");
    expect(resolveArticleGenerationType(article, index).id).toBe("code");
    expect(
      resolveArticleGenerationType(
        { ...article, source: undefined, type: "未知旧节点" },
        index
      ).id
    ).toBe("root");
  });

  it("defines every card node family represented by the topology prototype", () => {
    expect(initialGenerationTypes.map((type) => type.id)).toEqual([
      "root",
      "explain",
      "translate",
      "summary",
      "highlight",
      "socratic",
      "terms",
      "compare",
      "code",
      "checklist",
      "note",
      "source",
      "flashcard",
      "formula",
      "diagram",
      "pitfall",
      "analogy",
      "task"
    ]);
    expect(initialGenerationTypes.map((type) => type.cardVariant)).toEqual([
      "root",
      "explain",
      "translate",
      "summary",
      "highlight",
      "question",
      "terms",
      "compare",
      "code",
      "checklist",
      "note",
      "source",
      "flashcard",
      "formula",
      "diagram",
      "pitfall",
      "analogy",
      "task"
    ]);
    expect(
      initialGenerationTypes
        .filter((type) => type.executionMode !== "ai")
        .map((type) => [type.id, type.executionMode, type.enabled])
    ).toEqual([
      ["root", "system", false],
      ["highlight", "manual", false],
      ["note", "manual", false],
      ["source", "manual", false],
      ["formula", "manual", false],
      ["diagram", "manual", false],
      ["pitfall", "manual", false],
      ["analogy", "manual", false],
      ["task", "manual", false]
    ]);
    expect(
      initialGenerationTypes
        .filter((type) => type.interactive)
        .map((type) => type.id)
    ).toEqual([
      "highlight",
      "socratic",
      "checklist",
      "note",
      "source",
      "flashcard"
    ]);
  });

  it("maps every built-in generation type to a contract family", () => {
    const expected: Array<[string, string]> = [
      ["root", "笔记"],
      ["explain", "笔记"],
      ["translate", "笔记"],
      ["summary", "记录"],
      ["highlight", "记录"],
      ["socratic", "交互"],
      ["terms", "记录"],
      ["compare", "记录"],
      ["code", "笔记"],
      ["checklist", "交互"],
      ["note", "记录"],
      ["source", "记录"],
      ["flashcard", "交互"],
      ["formula", "记录"],
      ["diagram", "记录"],
      ["pitfall", "记录"],
      ["analogy", "记录"],
      ["task", "交互"]
    ];
    for (const [id, family] of expected) {
      expect(TYPE_FAMILIES[id], `${id} 应归属 ${family}`).toBe(family);
    }
    // 全部内置 id 都有家族映射
    for (const type of initialGenerationTypes) {
      expect(TYPE_FAMILIES[type.id], `${type.id} 缺少家族映射`).toBeDefined();
    }
  });

  it("migrates legacy prompt types and appends newly introduced built-ins", () => {
    window.localStorage.setItem(
      GENERATION_TYPES_STORAGE_KEY,
      JSON.stringify([
        {
          id: "explain",
          name: "自定义解释",
          icon: "explain",
          color: "#123456",
          isBuiltIn: false,
          enabled: false,
          modelBindingId: "deepseek:deepseek-chat",
          relationLabel: "说明",
          systemPrompt: "legacy system {{output.language}}",
          userPrompt: "legacy user {{selection.text}}",
          contextScope: "article"
        },
        {
          id: "socratic",
          name: "旧版追问",
          icon: "question",
          color: "#654321",
          isBuiltIn: false,
          enabled: true,
          modelBindingId: "global-default",
          relationLabel: "追问",
          systemPrompt: "legacy question system",
          userPrompt: "legacy question {{selection.text}}",
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
      name: "旧版追问",
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
          id: "highlight",
          name: "重点",
          icon: "highlight",
          cardVariant: "highlight",
          executionMode: "manual",
          interactive: true,
          color: "#c05245",
          enabled: true,
          relationLabel: "重点"
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

  it("keeps custom nodes after built-ins and persists their card presentation", () => {
    const custom: GenerationTypeConfig = {
      ...initialGenerationTypes.find((type) => type.id === "explain")!,
      id: "custom-map",
      name: "概念地图",
      icon: "compare",
      cardVariant: "compare",
      isBuiltIn: false,
      enabled: true
    };

    saveGenerationTypes([custom]);

    const loaded = loadGenerationTypes();
    expect(loaded.at(-1)).toEqual(custom);
    expect(loaded.filter((type) => type.id === "custom-map")).toHaveLength(1);
  });

  it("falls back to fresh topology defaults for malformed storage", () => {
    window.localStorage.setItem(GENERATION_TYPES_STORAGE_KEY, "not-json");

    expect(loadGenerationTypes()).toEqual(initialGenerationTypes);
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
    expect(normalizeNodeLevelConfig('{"displayFields":["title"]}')).toEqual({
      displayFields: ["title"]
    });
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
