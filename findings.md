# Findings

## 当前仓库状态
- `D:\Program\Annota\project` 当前为空，没有现存源码或 `AGENTS.md`。
- 外层目录包含 `Documents/`、`HTML-Demo/` 和空的 `project/`。

## 产品约束
- 首发仅 Windows；暂不做 Web/移动端。
- Local-first、BYOK；首版仅 OpenAI Compatible，不支持本地模型。
- 一个知识库类似文件夹，可包含多篇笔记；每篇笔记是一棵由根文档展开的知识树。
- 首页卡片代表最近打开或修改的笔记/知识树。
- 树为主、图为辅，但首版不考虑跨知识树关联。
- 生成入口依赖正文选区，首版内置“解释”和“翻译”。
- 生成开始时右侧出现占位节点；完成后保存为正式子文档；失败或取消则丢弃。
- 根文档、AI 子文档、手工文档与批注均可编辑。
- 拓扑默认覆盖当前根文档下全部节点，支持小窗浏览和放大铺满阅读区域。
- 数据需要本地存档，并可导出/导入压缩包。

## 原型方向
- 首页指定 `HTML-Demo/Index-White.html`。
- 阅读编辑器指定 `HTML-Demo/Demo-Note-Main.html`。
- 阅读原型包含：顶部面包屑与操作、左侧阅读路径、中部正文、右侧子文章、右下角可缩放/拖拽/固定拓扑、划词浮动工具条。

## 验证边界
- 先完成任务流与样式验证，再核对 Tauri 桌面构建。
- 当前记忆中的旧 Annota 实现来自过往 checkout；本轮目录为空，不能把旧能力当作当前已实现。

## 实现取舍
- 使用 React + TypeScript + Vite + Tauri 2；Tauri 窗口按 Windows 桌面设置最小尺寸与 NSIS 目标。
- 本地 demo 以版本化 React 状态 + `localStorage` 验证任务流，不宣称 SQLite、FTS、Credential Manager 或真实 LLM 已完成。
- 主页保留 `Index-White` 的纸白卡片、左侧索引和最近笔记结构；阅读器保留三栏、生成占位、路径与拓扑，但统一成冷白 Cobalt 设计语言。
- 阅读编辑器支持单块文本选择、原位 textarea、450 ms 自动保存、Enter 拆分与块首退格合并。
- `.annota` 当前是可演示 JSON 关系包，不是正式 v2 压缩格式。
- 为保证中文界面在不同 Windows 机器上保持一致，最终将 Noto Sans SC Variable 作为随应用打包的统一显示/正文/阅读字体，Cascadia/Consolas 仅用于短数据标签。

## 2026-07-26 窗口与动效修改
- Tauri 当前窗口仍为 `decorations: true`、1440×900；移除顶部原生标题栏需要改为无装饰窗口，并由前端提供拖拽区和三枚 Windows 窗口控件。
- `core:window:default` 只覆盖状态读取，不覆盖最小化、关闭、拖拽等写操作；能力文件需显式允许 `minimize`、`toggle-maximize`、`close`、`start-dragging`。
- Tauri 配置中的窗口宽高使用逻辑尺寸，WebView2 会随 Windows DPI 缩放；设置 1920×1080 即可维持系统缩放关联。
- 项目没有 motion 库；使用 CSS transform/opacity 和 React key 驱动的页面进入动画即可覆盖主页、阅读器及文章节点切换，并避免增加新依赖。
- 浏览器在 1920×1080 下实测：自定义标题栏为 40px，内容区为 1920×1040，文档 `scrollWidth` 与视口宽度均为 1920，无横向溢出；三枚窗口控件位于右上角，主页原有顶栏与内容比例保持正常。
- 首轮全屏拓扑验证发现路由动画终态的零位移 transform 仍会创建固定定位包含块，使面板多下移 40px；仅把终态写成 `transform: none` 仍会因 `animation-fill-mode: both` 保留插值矩阵，最终改为 `backwards`，让动画结束后回到基础样式的无 transform 状态。
- 修复后 1920×1080 全屏拓扑实测坐标为 top=102（40px 自定义标题栏 + 62px 阅读器工具栏）、left=246，路由容器 computed transform 为 `none`。
- 320/375/414/768 四档响应式实测均为 `scrollWidth === clientWidth`；320px 截图中标题栏控件完整显示、主页工具栏正确换行、按钮与正文无横向裁切，控制台无 error/warn。

## 2026-07-26 阅读页局部动效与三栏重排
- 当前文章 ID 被用于 `App.tsx` 的 `.route-stage` React key，导致每次切换文章都会重挂载整个 `ReaderPage`，顶栏、左侧路径、正文和右侧列表一起播放路由动画。
- 阅读路径与正文/子文章的布局目前只有两级：外层固定 `246px + 内容区`，内层再把正文与子文章作为居中的两列；因此子文章没有贴到工作区右缘，正文也不是在独立中央轨道内居中。
- 顶栏的 `.reader-breadcrumbs` 与左侧 `.reading-path` 重复表达同一条阅读路径；顶栏可直接移除该区，保留层级、类型、子文章数量等轻量元信息。
- 左侧宽度调整应使用真正的分隔拖拽控件，而不是只依赖 CSS `resize`：这样可以约束最小/最大值、支持键盘、保存用户宽度，并同步拓扑全屏面板的左侧偏移。
- 最终布局采用四轨工作区：`可调阅读路径 / 8px 分隔线 / 独立居中正文 / 右贴子文章`。1280×720 实测中路径为 246px、正文轨道为 666px、子文章为 360px，子文章右边缘等于 1280px。
- 父子文章切换实测：正文列分别为 `article-forward-in` 与 `article-back-in`；`.route-stage`、`.reader-topbar`、`.reading-path`、`.children-column` 的 animation-name 均为 `none`。
- 宽度调至 254px 后，正文轨道与全屏拓扑左缘均为 262px（254px 路径 + 8px 分隔线），证明拖拽状态与拓扑定位使用同一 CSS 变量。
- 当前轮应用内浏览器固定为 1280×720；安全策略禁止 `data:` 包装页进行 iframe 多宽度复验，因此没有声称重新目视验证 320/375/414/768。移动断点仍按 `≤900` 隐藏路径/分隔线、`≤768` 堆叠正文与子文章，并通过类型检查、生产构建和 Tauri 打包。
