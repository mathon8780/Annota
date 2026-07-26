# Annota Windows 桌面原型

这个目录包含从 `Documents/` 产品基线与 `HTML-Demo/Index-White.html`、`HTML-Demo/Demo-Note-Main.html` 构建的 Windows 优先桌面应用。

## 当前可演示

- 无原生黑色标题栏的 Windows 自定义窗口框架，支持拖拽、双击最大化、最小化、还原/最大化与关闭。
- 初始逻辑窗口为 1280×720，并由 Windows/WebView2 按系统 DPI 缩放；每次启动默认进入主页。
- 最近主笔记首页、筛选、排序、创建与 Markdown/TXT 导入。
- 全局 `Ctrl+K` 搜索，结果可跳到主笔记或子文章。
- 阅读路径、子文章列表与当前节点同步导航；左侧阅读路径支持拖拽、方向键调宽与双击复位。
- 父子文章切换只在居中的正文阅读区播放方向明确的轻量过渡，顶栏、阅读路径和右侧子文章保持稳定；弹窗与拓扑全屏仍保留各自的响应动效，并支持减少动态效果系统设置。
- 正文使用独立中央轨道，子文章列表位于同一个阅读区域内并贴靠右侧；阅读路径只在左侧显示，不在顶栏重复。
- 统一块级阅读编辑、450 ms 自动保存、`Ctrl+S`、拆分与向前合并。
- 单块选区后的“解释/翻译”任务占位、取消与本地演示节点生成。
- 右下角知识树拓扑支持缩放、拖动、固定、跳转与全屏；可从上/左边框调整占用尺寸，显示时按 `F` 会在保持缩放比例的前提下把当前节点移到中心。
- 浏览器本地持久化，以及当前知识树 `.annota` JSON 关系包导出/导入。

真实 OpenAI Compatible 请求、SQLite/FTS、Credential Manager、压缩包校验与后台备份仍属于后续桌面后端阶段；界面没有把这些能力伪装成已接通。

## 开发

```powershell
npm install
npm run dev
```

## 验证

```powershell
npm run check
npm run test
npm run build
```

响应式样式已覆盖 320、375、414、768 与 1920×1080；桌面窗口能力需通过 `npm run tauri dev` 或构建后的 Windows 程序验证。

## Tauri

安装 Rust stable-msvc 与 Microsoft C++ Build Tools 后：

```powershell
npm run tauri dev
npm run tauri build
```
