# Annota

Annota 是一款 Windows 优先的本地知识树阅读与编辑应用。发布版首次启动为空库，不包含演示笔记、示例文件夹或伪造的 AI 生成结果。

## 已可用

- 新建笔记，或导入 Markdown、TXT 与 `.annota` 关系包。
- 块级正文编辑、自动保存、全文搜索与最近浏览。
- 文件夹创建、编辑、批量管理与本地归档。
- 父子文章导航、阅读路径与可交互知识拓扑。
- 当前知识树导出为 `.annota` 文件，可在其他 Annota 实例中重新导入。
- 模型服务配置、模型列表发现与连接测试。
- 自定义字体、内容术语、快捷键、提示词模板与上下文范围。

正文“解释/翻译”不会在未配置正式生成后端时创建内容。当前 `0.1.0` 发布版保留按钮用于展示工作流入口，但会明确提示服务未配置，不会写入占位文章。

## 数据边界

- 笔记与应用配置保存在当前 Windows 用户的 WebView2 应用数据中。
- 首次启动和存储恢复失败时使用空库，不会自动注入内置内容。
- 旧开发版本的演示存储会在迁移时过滤已知演示笔记。
- 建议定期从阅读器导出重要知识树的 `.annota` 备份。
- 卸载或清理 WebView2 应用数据前，请先导出需要保留的内容。

## 开发

需要 Node.js 20+。安装依赖并启动前端：

```powershell
npm ci
npm run dev
```

启动 Tauri 桌面开发环境还需要 Rust stable-msvc、Microsoft C++ Build Tools 与 WebView2 Runtime：

```powershell
npm run tauri dev
```

## 验证

```powershell
npm run check
npm run test
npm run build
```

## 构建 Windows 安装包

```powershell
npm ci
npm run check
npm run test
npm run tauri build
```

成功后可分发的 NSIS 安装器位于：

```text
src-tauri\target\release\bundle\nsis\Annota_0.1.0_x64-setup.exe
```

未签名安装器可能触发 Windows SmartScreen 提示。对外公开发布前，应使用受信任的代码签名证书签名，并通过干净的 Windows 用户环境执行安装、启动、升级与卸载验证。

## 当前限制

- 笔记主体尚未迁移到 SQLite/FTS。
- 模型服务设置可以测试连接，但正文生成后端尚未接通。
- API Key 安全存储、自动备份、增量升级与安装包代码签名尚未提供。
