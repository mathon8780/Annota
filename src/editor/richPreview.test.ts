import { describe, expect, it } from "vitest";
import {
  findInlineMath,
  normalizeMultilineMath,
  renderMathHtml
} from "./richPreview";

describe("richPreview", () => {
  it("finds inline math without treating escaped dollars or code spans as formulas", () => {
    const source = String.raw`价格 \$20，公式 $E = mc^2$，代码 \`$not_math$\` 与 $\alpha + \beta$。`;

    expect(findInlineMath(source)).toEqual([
      expect.objectContaining({ expression: "E = mc^2" }),
      expect.objectContaining({ expression: String.raw`\alpha + \beta` })
    ]);
  });

  it("ignores display delimiters, empty formulas, and unclosed formulas", () => {
    expect(findInlineMath("$$x^2$$ $ closed $ and $open")).toEqual([]);
  });

  it("renders accessible KaTeX markup without trusting raw HTML", () => {
    const html = renderMathHtml(String.raw`\frac{a}{b}`, false);
    const unsafe = renderMathHtml(String.raw`\htmlClass{danger}{x}`, true);

    expect(html).toContain("class=\"katex\"");
    expect(html).toContain("<math");
    expect(unsafe).not.toContain("class=\"danger\"");
  });

  it.each([
    ["matrix", String.raw`\begin{bmatrix}a & b \\ c & d\end{bmatrix}`],
    ["determinant", String.raw`\begin{vmatrix}a & b \\ c & d\end{vmatrix}`],
    ["piecewise function", String.raw`f(x)=\begin{cases}x^2, & x \ge 0 \\ -x, & x < 0\end{cases}`]
  ])("renders a complex %s expression without falling back to an error", (_, expression) => {
    const html = renderMathHtml(expression, true);

    expect(html).toContain("class=\"katex-display\"");
    expect(html).not.toContain("katex-error");
    expect(html).toContain("class=\"vlist-t");
  });

  it.each([
    [
      "matrix",
      String.raw`A=\begin{bmatrix}
1 & 2 & 3
4 & 5 & 6
7 & 8 & 9
\end{bmatrix}`,
      3
    ],
    [
      "determinant",
      String.raw`\begin{vmatrix}
a & b
c & d
\end{vmatrix}=ad-bc`,
      2
    ],
    [
      "aligned equations",
      String.raw`\begin{aligned}
(a+b)^2 &= a^2+2ab+b^2
(a-b)^2 &= a^2-2ab+b^2
\end{aligned}`,
      2
    ],
    [
      "piecewise function",
      String.raw`f(x)=\begin{cases}
x^2, & x \ge 0
-x, & x < 0
\end{cases}`,
      2
    ]
  ])("treats structural newlines as rows in a multiline %s", (_, expression, expectedRows) => {
    const html = renderMathHtml(expression, true);

    expect(html.match(/<mtr>/g)).toHaveLength(expectedRows);
    expect(html).not.toContain("katex-error");
  });

  it("repairs a single trailing slash without doubling existing row separators", () => {
    const singleSlash = [
      String.raw`\begin{bmatrix}`,
      "1 & 2 \\",
      "3 & 4",
      String.raw`\end{bmatrix}`
    ].join("\n");
    const explicitRows = String.raw`\begin{bmatrix}
1 & 2 \\
3 & 4
\end{bmatrix}`;

    expect(normalizeMultilineMath(singleSlash)).toContain("1 & 2 \\\\");
    expect(normalizeMultilineMath(explicitRows)).toBe(explicitRows);
  });
});
