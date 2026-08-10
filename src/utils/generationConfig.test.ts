import { afterEach, describe, expect, it } from "vitest";
import type { ArticleNode } from "../types";
import {
  createGenerationTypeIndex,
  GENERATION_TYPES_STORAGE_KEY,
  initialGenerationTypes,
  loadGenerationTypes,
  resolveArticleGenerationType,
  saveGenerationTypes,
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
      "flashcard"
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
      "flashcard"
    ]);
    expect(
      initialGenerationTypes
        .filter((type) => type.executionMode !== "ai")
        .map((type) => [type.id, type.executionMode, type.enabled])
    ).toEqual([
      ["root", "system", false],
      ["highlight", "manual", false],
      ["note", "manual", false],
      ["source", "manual", false]
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
