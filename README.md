# Annota

> [!WARNING]
> 当前版本为 **v0.1.0-alpha**。它用于验证产品方向和核心工作流，仍可能出现数据格式调整、编辑器边界问题、功能缺失或不兼容变化。请勿将本版本作为唯一的长期资料存储，使用前后都应保留独立备份。

Annota 是一款 Windows 优先的本地 Markdown 知识树阅读与编辑应用。它以文章和父子关系组织知识，在同一工作区内提供实时预览编辑、阅读路径、知识拓扑和可配置的模型生成能力。

## 当前状况

v0.1.0-alpha 已形成可运行、可测试、可打包的桌面应用骨架，生产入口默认使用空资料库，不再注入演示文章。当前仅配置 Windows NSIS 安装包，适合开发验证、小规模试用和反馈收集，尚不适合承载无法恢复的重要资料。

当前已实现：

- 创建笔记，以及导入 Markdown、TXT 和 `.annota` 关系包。
- 最近浏览、标题与正文检索、父子文章导航和知识拓扑。
- 基于 CodeMirror 6 的单一 Markdown 正文模型，支持实时预览与源码显示切换、自动保存、选区格式化和 `Ctrl + 鼠标滚轮` 缩放。
- 标题、嵌套引用、链接、分隔线、有序/无序/任务列表、GFM 表格、围栏代码块与语言高亮、行内格式、Obsidian 高亮/Wiki 链接/注释/Callout。
- KaTeX 行内与块级公式，以及 Mermaid 图表渲染。
- 表格单元格编辑、矩形多选、增删方向入口和整行/整列拖动排序。
- 阅读路径保留或仅显示当前位置两种模式，以及可缩放、聚焦和全屏的知识拓扑。
- 一个内容集合可包含多个 Markdown 根节点；拓扑中可新建、编辑、删除不关联 Markdown 的手动节点，并建立任意关系。
- 问答、实践清单与复习闪卡等节点可在拓扑中保存回应、勾选和翻面状态。
- 模型服务配置、模型目录发现、拓扑节点类型、Card 样式预览、Prompt 模板、上下文范围和真实的子文章生成请求链路。
- 浅色与 Gruvbox 主题、自定义字体、内容术语和快捷键配置。

## 架构概览

| 目录 | 职责 |
| --- | --- |
| `src/components/` | 首页、阅读器、设置、生成工作台和拓扑等 React 界面 |
| `src/editor/` | Markdown 文档映射、CodeMirror 实时预览、表格/代码/数学/图表渲染与持久化适配 |
| `src/store/` | 应用资料、导航、导入导出和生成任务状态 |
| `src/utils/` | 模型服务、生成上下文、主题、缩放、字体、快捷键和阅读路径偏好 |
| `src/styles/` | 全局设计令牌与主题变量 |
| `src-tauri/src/` | Windows/Tauri 启动、窗口处理、Markdown 文件存储、拓扑 SQLite 和模型网络请求 |
| `src/test/` | 仅供自动化测试使用的环境与数据夹具 |

应用采用 React 18 + TypeScript + Vite 6 构建前端，Tauri 2 + Rust 提供 Windows 桌面容器、文件与 SQLite 持久化和网络请求能力。文章正文继续以 Markdown 文件为唯一内容模型；用户填写的手动节点、关系和互动状态是独立的结构化拓扑数据，不会生成 Markdown 副本。

内容、集合与数据权威的完整说明见 [当前内容与数据模型](../Documents/指导文档/组成.md)。归档文档与原型不作为当前实现要求。

## 数据与安全边界

- 正式启动使用空资料库；测试数据仅存在于 `src/test/fixtures/`，不会进入生产初始化流程。
- Tauri 桌面工作区将 Markdown 正文保存到 `notes/`，将文章、Notebook/集合、拓扑、互动状态和正文文件索引保存到 `.annota/library.sqlite3`。数据库直接以当前 schema 6 初始化，不保留逐版本迁移链。
- 桌面应用不会自动导入旧版 WebView `localStorage` 中的资料库数据，也不会搬运旧应用数据目录中的数据库或 Markdown；schema 1–5 的旧数据库会被拒绝。旧资料应先用对应版本导出，再导入当前版本创建的新工作区。
- 浏览器开发模式仍使用 `localStorage` 作为资料库和 Markdown 持久化后备，仅用于开发调试；主题、字体、模型服务等界面偏好也保存在 WebView2 应用数据中。
- 桌面节点类型配置直接保存到 SQLite，界面读取内存缓存；Markdown 拓扑由文章元数据派生，不再单独同步。元数据按差异写入，常规正文保存不递归扫描整个 `notes/`。
- `.annota` 可用于知识树导入导出；重要资料仍建议额外保留原始 Markdown 或其他独立备份。
- 模型服务 API Key 当前保存在本机 WebView 的 `localStorage` 中，**尚未接入 Windows Credential Manager 等安全凭据存储**。不要在不受信任或多人共用的系统中保存敏感密钥。
- 调用外部模型会把所选上下文发送给相应服务商，并可能产生费用；请自行确认服务商的隐私条款、区域可用性和计费规则。

## 已知限制与风险

- Alpha 阶段不保证数据结构、设置项或导入导出格式向后兼容。
- 当前仅配置并验证 Windows NSIS 打包；macOS、Linux、移动平台和其他安装包格式不在当前发布范围内。
- 文章与集合元数据已存入 SQLite，但尚未建立 FTS 索引，大规模资料库的检索性能仍需验证。
- Markdown 实时预览器已覆盖主要语法，但复杂嵌套、异常源码和第三方扩展语法仍可能存在渲染或光标映射问题。
- 表格、Mermaid、KaTeX、Callout 和代码块属于仍在快速迭代的交互区域。
- 模型服务兼容层尚不能保证覆盖所有 OpenAI-compatible 或 Anthropic-compatible 变体。
- 尚未提供安全凭据库、自动备份、历史版本、冲突恢复、云同步或多设备同步。
- 当前 Windows 安装包未签名，可能触发 SmartScreen；不要绕过来源不明安装包的安全警告。
- 前端样式与部分页面组件仍偏大，后续需要按编辑器、阅读器、设置和拓扑领域继续拆分。

## 未来发展方向

近期优先事项：

1. 完善工作区完整性检查、损坏恢复、备份和导入校验。
2. 继续完善 Markdown 光标映射、复杂嵌套语法、表格交互和跨模式一致性。
3. 将 API Key 迁移到系统安全凭据存储，并补齐模型请求权限、日志和错误边界。
4. 拆分大型样式与页面组件，建立更明确的编辑器、知识库和模型服务模块边界。
5. 建立签名的 Windows Alpha 构建、干净环境安装/升级/卸载验证与发布说明。

中期方向包括 SQLite/FTS 索引、大型资料库性能优化、可恢复的历史版本、可靠的文件工作区与备份流程，以及更完整的生成任务审计。跨平台、其他安装包格式、同步和扩展机制将在本地数据可靠性稳定后再评估。

## 开发

需要 Node.js 20+。安装依赖并启动前端：

```powershell
npm ci
npm run dev
```

启动 Tauri 桌面开发环境还需要 Rust stable-msvc、Microsoft C++ Build Tools 和 WebView2 Runtime：

```powershell
npm run tauri dev
```

## 验证

```powershell
npm run test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

`build` 已包含 TypeScript 类型检查；仅需快速检查类型时运行 `npm run check`。前端测试默认使用 Node，编辑器与界面测试使用 jsdom；App 层只保留核心用户流程，排序、上下文和持久化在对应模块验证。

## 构建 Windows NSIS 安装包

```powershell
npm ci
npm run test
npm run tauri build
```

NSIS 产物生成在 `src-tauri/target/release/bundle/nsis/`。对外分发前应使用受信任的代码签名证书签名，并在干净的 Windows 用户环境中验证安装、启动、升级、备份恢复和卸载流程。
