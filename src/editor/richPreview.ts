import katex from "katex";

export interface InlineMathMatch {
  expression: string;
  from: number;
  to: number;
}

export interface MermaidRenderResult {
  bindFunctions?: (element: Element) => void;
  svg: string;
}

const multilineRowEnvironment = /(\\begin\{(matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|cases|aligned|alignedat|gathered|split)\})([\s\S]*?)(\\end\{\2\})/g;

function isEscaped(source: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function inlineCodeRanges(source: string) {
  const ranges: Array<[number, number]> = [];
  for (const match of source.matchAll(/(`+)([^`]|`(?!\1))*?\1/g)) {
    const from = match.index ?? 0;
    ranges.push([from, from + match[0].length]);
  }
  return ranges;
}

export function findInlineMath(source: string): InlineMathMatch[] {
  const matches: InlineMathMatch[] = [];
  const codeRanges = inlineCodeRanges(source);
  let cursor = 0;

  while (cursor < source.length) {
    const from = source.indexOf("$", cursor);
    if (from < 0) break;
    const inCode = codeRanges.some(([left, right]) => from >= left && from < right);
    const next = source[from + 1];
    if (
      inCode ||
      isEscaped(source, from) ||
      source[from - 1] === "$" ||
      next === "$" ||
      !next ||
      /\s/.test(next)
    ) {
      cursor = from + 1;
      continue;
    }

    let to = from + 1;
    while (to < source.length) {
      to = source.indexOf("$", to);
      if (to < 0) break;
      if (
        !isEscaped(source, to) &&
        source[to - 1] !== "$" &&
        source[to + 1] !== "$" &&
        !/\s/.test(source[to - 1] ?? " ")
      ) {
        break;
      }
      to += 1;
    }

    if (to < 0) break;
    matches.push({
      expression: source.slice(from + 1, to),
      from,
      to: to + 1
    });
    cursor = to + 1;
  }

  return matches;
}

function unescapedCommentFrom(source: string) {
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "%") continue;
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
      slashCount += 1;
    }
    if (slashCount % 2 === 0) return index;
  }
  return -1;
}

function appendMathRowBreak(source: string) {
  const commentFrom = unescapedCommentFrom(source);
  const mathSource = (commentFrom < 0 ? source : source.slice(0, commentFrom)).trimEnd();
  const comment = commentFrom < 0 ? "" : source.slice(commentFrom).trimStart();
  if (/\\\\(?:\[[^\]]*\])?$/.test(mathSource) || /\\cr\s*$/.test(mathSource)) {
    return source;
  }
  const row = mathSource.endsWith("\\") ? `${mathSource}\\` : `${mathSource} \\\\`;
  return comment ? `${row} ${comment}` : row;
}

export function normalizeMultilineMath(expression: string) {
  return expression.replace(
    multilineRowEnvironment,
    (environment, opening: string, _name: string, body: string, closing: string) => {
      if (!body.includes("\n")) return environment;
      const lines = body.split("\n");
      const contentLines = lines
        .map((line, index) => line.trim() && !line.trimStart().startsWith("%") ? index : -1)
        .filter((index) => index >= 0);
      contentLines.slice(0, -1).forEach((index) => {
        lines[index] = appendMathRowBreak(lines[index]);
      });
      return `${opening}${lines.join("\n")}${closing}`;
    }
  );
}

export function renderMathHtml(expression: string, displayMode: boolean) {
  return katex.renderToString(normalizeMultilineMath(expression), {
    displayMode,
    errorColor: "#cc241d",
    maxExpand: 1000,
    maxSize: 20,
    output: "htmlAndMathml",
    strict: "ignore",
    throwOnError: false,
    trust: false
  });
}

let mermaidModulePromise: Promise<typeof import("mermaid")> | null = null;
let mermaidSequence = 0;
let mermaidQueue: Promise<void> = Promise.resolve();

function mermaidTheme() {
  if (document.documentElement.dataset.theme === "gruvbox") {
    return {
      darkMode: true,
      background: "#282828",
      primaryColor: "#3c3836",
      primaryTextColor: "#fbf1c7",
      primaryBorderColor: "#fe8019",
      lineColor: "#a89984",
      secondaryColor: "#504945",
      tertiaryColor: "#32302f",
      clusterBkg: "#32302f",
      clusterBorder: "#665c54",
      edgeLabelBackground: "#282828",
      fontFamily: "Noto Sans SC, system-ui, sans-serif"
    };
  }
  return {
    darkMode: false,
    background: "#ffffff",
    primaryColor: "#eef4ff",
    primaryTextColor: "#202637",
    primaryBorderColor: "#3f67c6",
    lineColor: "#667085",
    secondaryColor: "#f5f7fb",
    tertiaryColor: "#e9eef8",
    clusterBkg: "#f5f7fb",
    clusterBorder: "#aebbd4",
    edgeLabelBackground: "#ffffff",
    fontFamily: "Noto Sans SC, system-ui, sans-serif"
  };
}

async function loadMermaid() {
  mermaidModulePromise ??= import("mermaid");
  return (await mermaidModulePromise).default;
}

export function renderMermaidDiagram(source: string): Promise<MermaidRenderResult> {
  const renderId = `annota-mermaid-${++mermaidSequence}`;
  let resolveResult!: (value: MermaidRenderResult) => void;
  let rejectResult!: (reason?: unknown) => void;
  const result = new Promise<MermaidRenderResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  mermaidQueue = mermaidQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: "base",
          themeVariables: mermaidTheme()
        });
        resolveResult(await mermaid.render(renderId, source));
      } catch (error) {
        rejectResult(error);
      }
    });

  return result;
}
