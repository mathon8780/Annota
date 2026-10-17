export const GENERATION_OUTPUT_SCHEMA = `{
  "title": "文章标题",
  "summary": "一句摘要",
  "blocks": [
    { "type": "heading | paragraph | quote", "text": "正文" }
  ]
}`;

export const GENERATION_OUTPUT_INSTRUCTION = `

请只返回一个 JSON 对象，不要使用 Markdown 代码围栏。结构必须为：
${GENERATION_OUTPUT_SCHEMA}
blocks 至少包含一项；heading 仅用于小节标题。`;
