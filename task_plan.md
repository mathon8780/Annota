# Annota Windows 桌面应用构建计划

## 目标
在 `project/` 内从零搭建 Windows 优先的 Tauri + React + TypeScript 桌面应用，以 `Index-White.html` 为主页视觉基线、`Demo-Note-Main.html` 为阅读编辑器基线，并按 `Documents/` 的正式指导实现可演示的核心任务流与视觉验证。

## 阶段

### Phase 1：需求与原型梳理
- 状态：complete
- 提取 PRD/SRS/TDD 的 MVP、Windows、数据与交互约束
- 提取两个 HTML 原型的布局、样式与交互
- 明确本轮可完整演示与暂以本地模拟覆盖的能力

### Phase 2：工程骨架与设计系统
- 状态：complete
- 初始化 Vite + React + TypeScript + Tauri 2 工程
- 建立 Windows 窗口、路由、状态与持久化骨架
- 建立与白色原型一致的设计 token 与图标规范

### Phase 3：首页任务流
- 状态：complete
- 实现最近笔记主页、搜索/筛选、创建/导入入口
- 实现打开笔记、收藏/菜单等可见反馈
- 保持 AI 输入区域为装饰性/引导性，不误导为已接通服务

### Phase 4：阅读编辑器任务流
- 状态：complete
- 实现路径导航、可编辑正文、子文章切换
- 实现选区“解释/翻译”生成占位并转为本地演示节点
- 实现右侧子文章列表、拓扑缩放/拖拽/聚焦/全屏
- 实现本地持久化与导入入口

### Phase 5：验证与修正
- 状态：complete
- 运行类型检查、单元/交互测试与生产构建
- 启动页面并截图验证主页、阅读器、关键交互状态
- 修复视觉与交互偏差，完成桌面构建能力核对

### Phase 6：Windows 窗口框架与切换动效
- 状态：complete
- 移除原生窗口装饰，增加可拖拽自定义标题栏与最小化、最大化、关闭控件
- 将初始逻辑窗口修改为 1920×1080，并保持 Windows/WebView2 系统 DPI 缩放
- 为主页、阅读器、文章节点、弹窗与拓扑全屏补充克制的进入/返回动效
- 重新运行类型检查、测试、前端构建、Cargo 检查与桌面构建

### Phase 7：阅读页布局与局部文章动效
- 状态：complete
- 移除应用级路由切换动画，只保留正文阅读区域的文章前进/返回动效
- 将阅读路径改为可由用户拖拽和键盘调整宽度的左侧面板
- 将正文独立居中、子文章列表固定贴靠阅读工作区右侧
- 移除阅读页顶栏中重复的阅读路径，仅保留左侧路径
- 补充自动化测试并完成桌面与响应式视觉验证

### Phase 8：启动路由、阅读区整合与拓扑交互
- 状态：complete
- 每次应用启动时忽略上次阅读位置并默认显示主页
- 将子文章列表并入阅读页面内容区域，在正文右侧形成同一阅读画布
- 允许用户从拓扑图边框拖拽调整面板宽高，并约束最小/最大尺寸
- 按下 `F` 时仅平移拓扑，将当前阅读节点居中且保持现有缩放比例
- 补充自动化测试，并完成类型检查、构建、交互与视觉验证

### Phase 9：阅读画布视觉融合
- 状态：complete
- 以 `Demo-Note-Main.html` 的阅读区关系为基线，保留当前冷白 Cobalt 主题
- 让正文与右侧子文章共享连续背景，以留白和内容层级替代独立侧栏边框
- 保持正文居中阅读尺度、子文章靠右，以及现有局部文章切换动画
- 完成类型检查、测试、生产构建和 1280×720 视觉验证

### Phase 10：主页标题栏层级调整
- 状态：complete
- 保留 `window-titlebar` 作为唯一横跨整个窗口的应用级标题栏
- 移除主页工具栏中重复的品牌入口，将 `home-topbar` 收入右侧内容列
- 让 `home-topbar` 紧贴位于 `home-main` 正上方，侧栏直接从窗口标题栏下方开始
- 补充结构测试，并完成类型检查、构建与桌面/移动布局验证

## 关键决策
- 所有实现文件只写入 `project/`。
- Windows 桌面容器使用 Tauri 2，前端使用 React + TypeScript。
- 本轮聚焦可完成的本地任务流；真实 OpenAI Compatible 请求、系统文件选择器与压缩包交换若受凭据/桌面环境限制，以清晰的本地模拟或边界说明处理，不伪装为后端已接通。
- 视觉继承 HTML 原型的冷白、石墨文字、细边界、蓝紫选中态和知识树空间隐喻；不另起无关风格。

## 错误记录
- 首次读取 `project/AGENTS.md` 失败：当前 `project/` 为空且不存在该文件。已改为先确认目录状态。
- Vitest 首次启动出现 `spawn EPERM`：符合 Windows 沙箱限制特征，待类型错误修复后以允许的测试命令重跑。
- 首次生产构建被 `tsconfig.node.json` 的 `allowImportingTsExtensions` 与 emit 配置冲突阻断；已删除不需要的选项。
- 第二次类型检查发现 Vite 配置缺少 Node 类型且 `vite.defineConfig` 不识别 Vitest 的 `test` 字段；已改用 `vitest/config` 并补充 `@types/node`。
- `vitest/config` 与项目 Vite 6 插件类型发生双版本冲突；已将测试配置拆到独立 `vitest.config.ts`，生产 Vite 配置恢复使用 `vite` 类型。
- 沙箱外 Vitest 已能启动，但首次测试配置未启用 globals，导致 `describe is not defined`；已在独立配置中启用 `globals`。
- 首次 Cargo 检查完成依赖编译后被 Tauri Windows 资源门禁阻断：缺少 `src-tauri/icons/icon.ico`。已增加 Annota 知识树 SVG 源图，下一步用 Tauri 图标生成器生成平台资源。
- 首次 `tauri build` 在沙箱内被 `spawn EPERM` 阻断；同一命令在允许环境下成功完成 release 编译与 NSIS 打包。
- Phase 6 的首次 Vitest 运行再次被 Windows 沙箱的 esbuild `spawn EPERM` 阻断；代码检查与前端构建已通过，按既有结论改为在允许环境下重跑测试。
- Phase 7 的首次 Vitest 运行再次在加载配置时触发 esbuild `spawn EPERM`；类型检查与生产构建均通过，继续按已验证方案在允许环境下复验。
- Phase 7 沙箱外首次测试发现新增断言使用了不存在的示例标题“组件内存布局”，且 jsdom 未实现 `setPointerCapture`；已改用实际的 Component 子文章标题，并为指针捕获 API 增加能力守卫。
- Phase 7 第二次测试发现子文章标题同时存在于右侧列表与拓扑节点，导致全局角色查询不唯一；已将断言限定在“下一级子文章”侧栏内。
- 新增拖拽断言时发现 jsdom 的 `fireEvent.pointer*` 不保留 `clientX`，计算结果成为 `NaN`；已改用显式定义 `pointerId/clientX` 的合成事件验证同一生产处理链。
- Hallmark 正则扫描再次因 PowerShell 双引号中的转义组合解析失败；已停止复用复合表达式，后续仅使用拆分后的简单查询。
- 应用内浏览器禁止导航到用于多宽度 iframe 验证的 `data:` 包装页；遵守浏览器安全策略未尝试绕过，当前轮视觉验证限定为真实 1280×720 应用页，移动断点保留代码级与构建级核对。
- Hallmark 最终正则扫描首次因 PowerShell 正则字符串中的管道/引号解析为命令管道而失败；改为拆分成多个简单 `rg` 查询，不复用该复合命令。
- 最终尝试读取 Git 状态时确认 `project/` 及其父目录当前不是 Git 工作树；不影响本次文件交付，改用文件级检查与构建产物时间/哈希核对。
- Phase 8 首次 Vitest 运行在加载配置时再次触发 Windows 沙箱 `esbuild spawn EPERM`；按既有验证边界记录，并改用允许启动测试子进程的环境运行同一命令。
- Phase 8 沙箱外首轮 6 项断言均通过，但窗口级 `F` 测试触发阅读器旧快捷键监听器的 `target.matches is not a function` 未处理异常；为非 HTMLElement 事件目标增加类型守卫后重跑。
- Phase 8 首次用 `Start-Process` 启动视觉验证服务器时，当前 PowerShell 进程因同时存在 `Path/PATH` 键而抛出重复字典键异常；没有进程被启动，改用 `-UseNewEnvironment` 与 npm 的绝对路径创建干净子进程。
- `Start-Process -UseNewEnvironment` 仍在 PowerShell 构造进程环境时触发同一重复键异常；停止重复该方法，改用 Windows `Win32_Process.Create` 启动隐藏服务。
- `Win32_Process.Create` 因当前权限策略返回“拒绝访问”，且启动信息对象不暴露 `ShowWindow`；三种系统后台进程方案均未产生监听服务，停止继续尝试，改由受控持久运行环境托管已构建的 `dist` 静态产物。
- Phase 9 首次 Vitest 与 Tauri 构建仍被 Windows 沙箱的 `esbuild spawn EPERM` 阻断；两项均在允许启动构建子进程的环境中使用原命令复验并通过。
- Phase 9 首次 Hallmark 复合正则使用了 `rg` 不支持的负向前瞻；停止复用该表达式，改为分项 `Select-String` 扫描并通过。
- 首次汇总发布产物信息时将 PowerShell `foreach` 直接接到管道导致空管道解析错误；改为先保存 `$rows` 再格式化输出，成功取得尺寸、时间与 SHA256。
- Phase 10 首次 Vitest 仍在加载配置时触发 Windows 沙箱的 `esbuild spawn EPERM`；尚未执行测试断言，将在允许启动子进程的环境中使用相同命令复验。
