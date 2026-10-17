import type { ArticleNode, SelectionState } from "../types";
import { loadMarkdownDocument } from "../editor/markdownRepository";
import { renderPromptTemplate, type ContextScope, type GenerationTypeConfig } from "./generationConfig";
import { assembleGenerationContext, parseGeneratedArticle } from "./generationRuntime";
import { generateModelText, GENERATION_OUTPUT_INSTRUCTION } from "./modelGeneration";
import { resolveConfiguredModel } from "./modelProviders";

export function generationArticleIds(
  articles: Readonly<Record<string, ArticleNode>>,
  article: ArticleNode,
  scope: ContextScope
): string[] {
  if (scope !== "parentArticle" && scope !== "allParentArticles") return [article.id];
  if (scope === "parentArticle") {
    return article.parentId ? [article.parentId, article.id] : [article.id];
  }
  const ids: string[] = [];
  let cursor: ArticleNode | undefined = article;
  while (cursor) {
    ids.unshift(cursor.id);
    cursor = cursor.parentId ? articles[cursor.parentId] : undefined;
  }
  return ids;
}

export async function generateNodeContent(
  articles: Record<string, ArticleNode>,
  article: ArticleNode,
  selection: SelectionState,
  type: GenerationTypeConfig,
  resolvedModel: NonNullable<ReturnType<typeof resolveConfiguredModel>>
) {
  const documents = Object.fromEntries(await Promise.all(
    generationArticleIds(articles, article, type.contextScope).map(async (id) =>
      [id, (await loadMarkdownDocument(id)).content]
    )
  ));
  const context = assembleGenerationContext(articles, documents, article, selection, type.contextScope);
  const response = await generateModelText({
    baseUrl: resolvedModel.provider.baseUrl,
    endpointPath: resolvedModel.provider.endpointPath,
    apiKey: resolvedModel.provider.apiKey,
    protocol: resolvedModel.provider.protocol,
    model: resolvedModel.model,
    systemPrompt: renderPromptTemplate(type.systemPrompt, context.values) + GENERATION_OUTPUT_INSTRUCTION,
    userPrompt: `${renderPromptTemplate(type.userPrompt, context.values)}\n\n<context_scope>${context.suppliedContext}</context_scope>`,
    ...type.modelParameters
  });
  return parseGeneratedArticle(response, `${type.name}：${selection.text.slice(0, 28)}`);
}
