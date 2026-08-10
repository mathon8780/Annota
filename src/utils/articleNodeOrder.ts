import type { ArticleNode } from "../types";

function finitePosition(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function buildArticleDescendantCounts(
  articles: Readonly<Record<string, ArticleNode>>
) {
  const counts = new Map<string, number>();
  const visiting = new Set<string>();

  const visit = (articleId: string): number => {
    const cached = counts.get(articleId);
    if (cached !== undefined) return cached;
    const article = articles[articleId];
    if (!article || visiting.has(articleId)) return 0;

    visiting.add(articleId);
    let count = 0;
    const children = new Set(article.childIds);
    children.forEach((childId) => {
      if (!articles[childId] || visiting.has(childId)) return;
      count += 1 + visit(childId);
    });
    visiting.delete(articleId);
    counts.set(articleId, count);
    return count;
  };

  Object.keys(articles).forEach(visit);
  return counts;
}

export function compareArticleChildren(
  left: ArticleNode,
  right: ArticleNode,
  parent: ArticleNode,
  blockOrder: ReadonlyMap<string, number>,
  childOrder?: ReadonlyMap<string, number>
) {
  const fallbackBlock = Number.MAX_SAFE_INTEGER;
  const leftBlock = left.source?.parentId === parent.id
    ? blockOrder.get(left.source.blockId) ?? fallbackBlock
    : fallbackBlock;
  const rightBlock = right.source?.parentId === parent.id
    ? blockOrder.get(right.source.blockId) ?? fallbackBlock
    : fallbackBlock;
  if (leftBlock !== rightBlock) return leftBlock - rightBlock;

  const fallbackOffset = Number.MAX_SAFE_INTEGER;
  const hasResolvedBlock = leftBlock !== fallbackBlock && rightBlock !== fallbackBlock;
  const leftOffset = finitePosition(
    hasResolvedBlock
      ? left.source?.start ?? left.source?.documentStart
      : left.source?.documentStart,
    fallbackOffset
  );
  const rightOffset = finitePosition(
    hasResolvedBlock
      ? right.source?.start ?? right.source?.documentStart
      : right.source?.documentStart,
    fallbackOffset
  );
  if (leftOffset !== rightOffset) return leftOffset - rightOffset;

  const leftFallback = childOrder?.get(left.id) ?? parent.childIds.indexOf(left.id);
  const rightFallback = childOrder?.get(right.id) ?? parent.childIds.indexOf(right.id);
  if (leftFallback !== rightFallback) return leftFallback - rightFallback;
  return left.id.localeCompare(right.id);
}

function inferredBlockOrdinal(blockId: string, parentId: string) {
  const localId = blockId.startsWith(`${parentId}-`)
    ? blockId.slice(parentId.length + 1)
    : blockId;
  const match = /^(?:b)?(\d+)(?:-|_|$)/i.exec(localId);
  return match ? Number(match[1]) : null;
}

export function sourceBlockIdsInDocumentOrder(
  parent: ArticleNode,
  articles: Readonly<Record<string, ArticleNode>>
) {
  const firstChildIndex = new Map<string, number>();
  const firstDocumentPosition = new Map<string, number>();
  parent.childIds.forEach((childId, index) => {
    const source = articles[childId]?.source;
    const blockId = source?.blockId;
    if (blockId && !firstChildIndex.has(blockId)) firstChildIndex.set(blockId, index);
    if (
      blockId &&
      typeof source?.documentStart === "number" &&
      Number.isFinite(source.documentStart)
    ) {
      firstDocumentPosition.set(
        blockId,
        Math.min(
          firstDocumentPosition.get(blockId) ?? Number.MAX_SAFE_INTEGER,
          source.documentStart
        )
      );
    }
  });
  return Array.from(firstChildIndex.keys()).sort((left, right) => {
    const leftOrdinal = inferredBlockOrdinal(left, parent.id);
    const rightOrdinal = inferredBlockOrdinal(right, parent.id);
    if (leftOrdinal !== null && rightOrdinal !== null && leftOrdinal !== rightOrdinal) {
      return leftOrdinal - rightOrdinal;
    }
    const leftDocumentPosition = firstDocumentPosition.get(left);
    const rightDocumentPosition = firstDocumentPosition.get(right);
    if (leftDocumentPosition !== undefined && rightDocumentPosition !== undefined) {
      return leftDocumentPosition - rightDocumentPosition;
    }
    return (firstChildIndex.get(left) ?? 0) - (firstChildIndex.get(right) ?? 0);
  });
}

export function sortArticleChildren(
  parent: ArticleNode,
  articles: Readonly<Record<string, ArticleNode>>,
  blockIds: readonly string[]
) {
  const blockOrder = new Map(blockIds.map((blockId, index) => [blockId, index]));
  const childOrder = new Map(parent.childIds.map((childId, index) => [childId, index]));
  return parent.childIds
    .map((id) => articles[id])
    .filter((article): article is ArticleNode => Boolean(article))
    .sort((left, right) =>
      compareArticleChildren(left, right, parent, blockOrder, childOrder)
    );
}
