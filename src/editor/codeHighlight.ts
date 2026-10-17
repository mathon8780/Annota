import { RangeSetBuilder, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { fencedCodeState } from "./fencedCode";

const languages = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  go,
  java,
  javascript,
  json,
  markdown,
  powershell,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml
} as const;

Object.entries(languages).forEach(([name, language]) => {
  if (!hljs.getLanguage(name)) hljs.registerLanguage(name, language);
});

const aliases: Readonly<Record<string, keyof typeof languages>> = {
  bash: "bash",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  csharp: "csharp",
  css: "css",
  diff: "diff",
  go: "go",
  golang: "go",
  htm: "xml",
  html: "xml",
  java: "java",
  js: "javascript",
  javascript: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  markdown: "markdown",
  ps1: "powershell",
  powershell: "powershell",
  py: "python",
  python: "python",
  rs: "rust",
  rust: "rust",
  sh: "bash",
  shell: "bash",
  sql: "sql",
  ts: "typescript",
  tsx: "typescript",
  typescript: "typescript",
  xml: "xml",
  yml: "yaml",
  yaml: "yaml"
};

export function normalizeCodeLanguage(language: string) {
  return aliases[language.trim().toLowerCase()] ?? null;
}

export function highlightedCodeHtml(source: string, language: string) {
  const normalized = normalizeCodeLanguage(language);
  if (!normalized) return null;
  return {
    html: hljs.highlight(source, {
      language: normalized,
      ignoreIllegals: true
    }).value,
    language: normalized
  };
}

export function highlightedCodeLineHtml(source: string, language: string) {
  return highlightedCodeHtml(source, language)?.html ?? null;
}

export interface CodeHighlightSpan {
  className: string;
  from: number;
  to: number;
}

export function highlightedCodeSpans(source: string, language: string): CodeHighlightSpan[] {
  const html = highlightedCodeLineHtml(source, language);
  if (html === null || typeof document === "undefined") return [];
  const template = document.createElement("template");
  template.innerHTML = html;
  const spans: CodeHighlightSpan[] = [];
  let offset = 0;

  const visit = (node: Node, inheritedClass = "") => {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (length && inheritedClass) {
        spans.push({ className: inheritedClass, from: offset, to: offset + length });
      }
      offset += length;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tokenClass = Array.from(node.classList).find((className) => className.startsWith("hljs-"));
    node.childNodes.forEach((child) => visit(child, tokenClass ?? inheritedClass));
  };

  template.content.childNodes.forEach((child) => visit(child));
  return spans;
}

function fencedCodeDecorations(state: EditorState): DecorationSet {
  const decorations = new RangeSetBuilder<Decoration>();
  const fencedCode = state.field(fencedCodeState);
  for (const block of fencedCode.blocks) {
    for (let lineNumber = block.startLine + 1; lineNumber <= block.endLine; lineNumber += 1) {
      if (fencedCode.fences.has(lineNumber)) continue;
      const line = state.doc.line(lineNumber);
      highlightedCodeSpans(line.text, block.language).forEach((span) => {
        decorations.add(
          line.from + span.from,
          line.from + span.to,
          Decoration.mark({ class: span.className })
        );
      });
    }
  }

  return decorations.finish();
}

const fencedCodeHighlightField = StateField.define<DecorationSet>({
  create: fencedCodeDecorations,
  update(decorations, transaction) {
    return transaction.docChanged
      ? fencedCodeDecorations(transaction.state)
      : decorations;
  },
  provide: (field) => EditorView.decorations.from(field)
});

export const fencedCodeHighlightExtension: Extension = [fencedCodeState, fencedCodeHighlightField];
