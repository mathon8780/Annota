# Design — Annota

Annota 的应用级设计系统。所有页面与组件改动先遵循此文件，再按各自功能选择布局变体。系统服务于 Windows 本地深度阅读与知识整理，不采用营销落地页的结构或文案。

## Genre

modern-minimal。界面应像安静、精确的学习工作台：信息密度可控，结构由留白、细分隔线和排版承担，钴蓝仅作为状态与动作信号。

## Macrostructure family

- 首页与集合：Ecosystem Index。用多个真实发现面组织知识点、最近访问和集合，不使用同尺寸卡片墙。
- 阅读与生成：Workbench。正文、选区工具和生成状态是主要内容，不增加装饰性插图。
- 全屏拓扑：Map / Diagram。关系从左到右，兄弟节点按原文锚点从上到下排列。
- 拓扑节点配置：Component Playground。配置表单与真实卡片预览并排，预览随配置变化。

## Theme

- `--color-paper`: `oklch(98.7% 0.006 255)`
- `--color-paper-2`: `oklch(96.8% 0.008 255)`
- `--color-ink`: `oklch(22% 0.025 260)`
- `--color-ink-2`: `oklch(34% 0.024 260)`
- `--color-rule`: `oklch(89.5% 0.015 255)`
- `--color-accent`: `oklch(54% 0.2 263)`
- `--color-focus`: `oklch(52% 0.22 263)`

强调色在任一视口中的面积不超过 5%。颜色只能通过 `src/styles/tokens.css` 中的命名令牌使用；组件不内联颜色值。

## Typography

- Display：`Noto Sans SC Variable`，700，normal。
- Body：`Noto Sans SC Variable`，400–600。
- Mono / code：`Cascadia Code`，400–600。
- Display tracking：`-0.025em`，仅用于短标题。
- Type scale anchor：`--text-display: clamp(2rem, 4vw, 3.25rem)`。

中文知识内容的可读性优先于为了主题引入远程拉丁字体。标题始终直立，不使用斜体强调。

## Spacing

使用 `src/styles/tokens.css` 已有的 4pt 命名刻度：`--space-1` 至 `--space-20`。页面和组件使用命名令牌，不临时引入任意间距。

## Motion

- Easings：`--ease-out`、`--ease-in`、`--ease-in-out`。
- 只动画 `transform` 与 `opacity`；焦点环即时出现。
- 允许的空间动效：拓扑展开/聚焦、面板进入、卡片状态切换，最多三种原语。
- `prefers-reduced-motion: reduce` 下取消空间位移，必要反馈降为不超过 150ms 的透明度变化。

## Microinteractions stance

- 保存优先使用静默成功或邻近状态文字，不发送庆祝性 toast。
- 破坏性动作只有在无法撤销时确认；可恢复操作优先“执行 + 撤销”。
- Tooltip：鼠标悬停延迟 800ms，键盘聚焦立即显示。
- 每个表单和按钮具备默认、hover、focus-visible、active、disabled、loading、error、success 状态。

## CTA voice

- 主操作：钴蓝实心、6–10px 紧凑圆角，文案直接命名结果，例如“创建知识点”“保存节点配置”。
- 次操作：纸面背景 + 规则线边框，文案与主操作使用同一动词体系。
- 图标按钮必须有可访问名称；不以“提交”“确定”代替具体动作。

## Per-page allowances

- 应用页面不使用装饰性 enrichment；功能界面就是主体。
- 阅读页面只使用排版、引用、标记和内容语法所需的视觉元素。
- 拓扑页面允许边、锚点、层级轨道和缩放反馈，不使用背景网格纹理或发光装饰。
- 集合页面允许颜色和图标作为分类信号，但同一集合颜色只在标题、标记和焦点处出现。

## What pages MUST share

- Annota 品牌标记、冷白纸面和钴蓝信号色。
- Noto Sans SC + Cascadia Code 字体角色。
- 4pt 间距、细规则线、紧凑圆角与一致的焦点环。
- “知识点”“节点”“拓扑节点”“集合”四个用户术语。
- 空态说明下一步操作；错误信息说明发生了什么以及如何恢复。

## What pages MAY differ on

- 首页可以更偏发现与归类；阅读器可以更安静；拓扑可以更具空间密度。
- 卡片内部由节点展示器决定，外壳仍共享边框、排版和状态语言。
- 全屏拓扑可提高信息密度，但不得改变节点关系或原文锚点排序。

## Exports

运行时权威令牌位于 `src/styles/tokens.css`；项目根目录 `tokens.css` 是可移植导出。

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(98.7% 0.006 255);
  --color-paper-soft: oklch(96.8% 0.008 255);
  --color-ink: oklch(22% 0.025 260);
  --color-ink-soft: oklch(34% 0.024 260);
  --color-rule: oklch(89.5% 0.015 255);
  --color-accent: oklch(54% 0.2 263);
  --color-focus: oklch(52% 0.22 263);
  --font-display: "Noto Sans SC Variable", "Microsoft YaHei UI", sans-serif;
  --font-body: "Noto Sans SC Variable", "Microsoft YaHei UI", sans-serif;
  --font-mono: "Cascadia Code", "Cascadia Mono", Consolas, monospace;
  --spacing-1: 0.25rem;
  --spacing-2: 0.5rem;
  --spacing-4: 1rem;
  --spacing-6: 1.5rem;
  --spacing-8: 2rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`

```json
{
  "color": {
    "paper": { "$value": "oklch(98.7% 0.006 255)", "$type": "color" },
    "ink": { "$value": "oklch(22% 0.025 260)", "$type": "color" },
    "accent": { "$value": "oklch(54% 0.2 263)", "$type": "color" },
    "focus": { "$value": "oklch(52% 0.22 263)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Noto Sans SC Variable", "$type": "fontFamily" },
    "body": { "$value": "Noto Sans SC Variable", "$type": "fontFamily" },
    "mono": { "$value": "Cascadia Code", "$type": "fontFamily" }
  },
  "space": {
    "1": { "$value": "0.25rem", "$type": "dimension" },
    "4": { "$value": "1rem", "$type": "dimension" },
    "6": { "$value": "1.5rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 98.7% 0.006 255;
  --foreground: 22% 0.025 260;
  --primary: 54% 0.2 263;
  --primary-foreground: 99% 0.005 255;
  --muted: 96.8% 0.008 255;
  --muted-foreground: 51% 0.025 260;
  --border: 89.5% 0.015 255;
  --input: 89.5% 0.015 255;
  --ring: 52% 0.22 263;
  --radius: 0.625rem;
}
```
