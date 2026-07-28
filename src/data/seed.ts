import type {
  AppData,
  ArticleNode,
  ContentBlock,
  FolderProfile,
  Notebook
} from "../types";

const now = new Date("2026-07-26T09:30:00+08:00").toISOString();

const blocks = (prefix: string, items: Array<[ContentBlock["kind"], string]>): ContentBlock[] =>
  items.map(([kind, text], index) => ({ id: `${prefix}-b${index + 1}`, kind, text }));

const articles: Record<string, ArticleNode> = {
  "ecs-root": {
    id: "ecs-root",
    rootId: "ecs-root",
    parentId: null,
    title: "ECS 架构：从数据布局到系统调度",
    summary: "沿着 Entity、Component 与 System 的职责边界，理解数据导向设计如何影响运行时性能。",
    type: "主文章",
    tags: ["ECS", "架构", "游戏开发"],
    childIds: ["ecs-system", "ecs-component", "ecs-entity"],
    createdAt: now,
    updatedAt: now,
    blocks: blocks("ecs-root", [
      ["h2", "为什么要把数据与行为拆开"],
      ["paragraph", "ECS 将对象拆成实体标识、纯数据组件与批量处理数据的系统。它不是简单地把类拆成三个目录，而是重新安排数据在内存中的组织方式与处理顺序。"],
      ["paragraph", "传统面向对象结构常把状态与方法封装在分散对象中。ECS 更关注一批同类数据怎样连续存储、怎样被同一个 System 访问，以及访问过程中能否保持缓存命中。"],
      ["quote", "System 的更新存在明确的顺序与可行性要求。依赖同一份数据的系统不能被任意并行，也不适合把高延迟的物理查询混入连续的数据遍历。"],
      ["h2", "依赖关系决定更新顺序"],
      ["paragraph", "调度器会根据读写依赖把有前置条件的 System 放到后面，把互不冲突的工作并行化。真正的价值不只是少写代码，而是让数据依赖变得可以检查、排序与优化。"],
      ["paragraph", "学习 ECS 时，先追踪数据从创建到读取的路径，再分析每个 System 的读写集合，会比背诵 API 更接近架构本质。"]
    ])
  },
  "ecs-system": {
    id: "ecs-system",
    rootId: "ecs-root",
    parentId: "ecs-root",
    title: "System 的更新顺序与依赖调度",
    summary: "解释读写依赖、系统分组和并行调度的基本边界。",
    type: "解释",
    tags: ["System", "调度", "依赖"],
    childIds: ["ecs-physics"],
    createdAt: now,
    updatedAt: now,
    source: {
      parentId: "ecs-root",
      blockId: "ecs-root-b4",
      quote: "System 的更新存在明确的顺序与可行性要求。",
      generationType: "explain"
    },
    blocks: blocks("ecs-system", [
      ["paragraph", "System 调度的核心输入是每个任务声明的读集合与写集合。两个任务只读同一数据时可以并行；只要其中一个写入同一数据，就必须建立先后约束。"],
      ["h2", "先声明依赖，再决定并行"],
      ["paragraph", "可行的调度不是靠猜测线程安全，而是让依赖显式化。这样运行时才能构建有向无环图，把无冲突分支交给工作线程。"],
      ["paragraph", "如果某个 System 依赖上一阶段产生的位置结果，它就必须排在写入位置的 System 之后。顺序是一种数据契约，而不是人为偏好。"]
    ])
  },
  "ecs-physics": {
    id: "ecs-physics",
    rootId: "ecs-root",
    parentId: "ecs-system",
    title: "为什么物理查询会破坏批处理节奏",
    summary: "从缓存局部性与同步点理解物理范围检测的代价。",
    type: "解释",
    tags: ["物理", "缓存", "同步点"],
    childIds: [],
    createdAt: now,
    updatedAt: now,
    blocks: blocks("ecs-physics", [
      ["paragraph", "范围检测与射线查询往往跨越独立的空间结构，并可能等待物理世界完成同步。把它插入连续组件遍历，会让处理器从线性数据访问跳到不连续结构。"],
      ["paragraph", "更稳定的方式是先批量收集查询请求，在明确的阶段执行，再把结果写回连续缓冲区，供后续 System 消费。"]
    ])
  },
  "ecs-component": {
    id: "ecs-component",
    rootId: "ecs-root",
    parentId: "ecs-root",
    title: "Component 为什么应该保持纯数据",
    summary: "从可组合性、序列化与内存布局理解组件边界。",
    type: "解释",
    tags: ["Component", "数据布局"],
    childIds: [],
    createdAt: now,
    updatedAt: now,
    blocks: blocks("ecs-component", [
      ["paragraph", "Component 负责描述状态而不是执行行为。保持纯数据能让系统按组件组合筛选实体，也让序列化、迁移和批量处理更直接。"]
    ])
  },
  "ecs-entity": {
    id: "ecs-entity",
    rootId: "ecs-root",
    parentId: "ecs-root",
    title: "Entity 只是稳定标识吗",
    summary: "区分实体身份、组件集合与对象实例。",
    type: "解释",
    tags: ["Entity", "标识"],
    childIds: [],
    createdAt: now,
    updatedAt: now,
    blocks: blocks("ecs-entity", [
      ["paragraph", "Entity 通常只是一个带版本的索引。它的意义来自当前关联的组件集合，而不是继承层级或对象方法。"]
    ])
  },
  "cpp-polymorphism-root": {
    id: "cpp-polymorphism-root",
    rootId: "cpp-polymorphism-root",
    parentId: null,
    title: "虚函数与动态多态",
    summary: "虚函数让程序通过基类指针或引用，根据对象的实际动态类型选择最终重写版本。",
    type: "主文章",
    tags: ["C++", "多态", "继承"],
    childIds: [],
    createdAt: "2026-07-28T09:05:00+08:00",
    updatedAt: "2026-07-28T15:42:00+08:00",
    blocks: blocks("cpp-polymorphism-root", [
      ["quote", "虚函数解决的是“统一接口，不同行为”：调用方依赖基类接口，运行时再由对象的动态类型决定具体实现。"],
      ["h2", "静态类型与动态类型"],
      ["paragraph", "基类指针的静态类型在编译期已知，它所指对象的动态类型则参与运行时虚分派。非虚成员和重载选择通常仍由静态类型决定。"],
      ["h2", "正确重写的边界"],
      ["paragraph", "派生函数需要匹配函数名、参数、const 限定与引用限定符。使用 override 能让编译器检查重写关系，避免同名函数意外隐藏基类接口。"]
    ])
  },
  "cpp-vtable-root": {
    id: "cpp-vtable-root",
    rootId: "cpp-vtable-root",
    parentId: null,
    title: "虚函数表",
    summary: "理解主流编译器如何用 vtable 与 vptr 实现运行时多态，以及这种模型的标准边界。",
    type: "主文章",
    tags: ["C++", "对象模型", "vtable"],
    childIds: [],
    createdAt: "2026-07-28T08:20:00+08:00",
    updatedAt: "2026-07-28T11:18:00+08:00",
    blocks: blocks("cpp-vtable-root", [
      ["paragraph", "主流实现会为多态类生成一张或多张虚函数表，并在相应对象子对象中保存虚表指针。调用虚函数时，程序通过表项定位最终函数。"],
      ["quote", "C++ 标准规定的是可观察行为，并不承诺对象必须含有 vptr，也不规定虚函数表的具体布局。"],
      ["h2", "重写如何影响表项"],
      ["paragraph", "派生类重写虚函数后，对应槽位通常指向派生实现；未重写的槽位仍可沿用基类实现。多重继承与虚继承可能引入多张表及 this 指针调整。"]
    ])
  },
  "cpp-virtual-destructor-root": {
    id: "cpp-virtual-destructor-root",
    rootId: "cpp-virtual-destructor-root",
    parentId: null,
    title: "虚析构函数",
    summary: "只要对象可能通过基类指针被删除，基类析构函数就必须是虚函数。",
    type: "主文章",
    tags: ["C++", "生命周期", "多态"],
    childIds: [],
    createdAt: "2026-07-27T10:10:00+08:00",
    updatedAt: "2026-07-27T20:36:00+08:00",
    blocks: blocks("cpp-virtual-destructor-root", [
      ["paragraph", "通过基类指针删除派生对象时，非虚基类析构会导致未定义行为。虚析构保证销毁从最派生类开始，并依次完成成员与基类清理。"],
      ["h2", "多态基类的常见选择"],
      ["paragraph", "基类析构通常设计为公有且虚，允许通过基类接口销毁；或设计为受保护且非虚，明确禁止外部通过基类指针删除。"],
      ["quote", "析构函数即使声明为纯虚也必须提供定义，因为派生对象销毁时仍会调用基类析构。"]
    ])
  },
  "cpp-template-root": {
    id: "cpp-template-root",
    rootId: "cpp-template-root",
    parentId: null,
    title: "模板基础与函数模板",
    summary: "把模板理解为编译器按模板实参生成声明或定义的编译期配方。",
    type: "主文章",
    tags: ["C++", "模板", "泛型编程"],
    childIds: [],
    createdAt: "2026-07-27T08:35:00+08:00",
    updatedAt: "2026-07-27T14:08:00+08:00",
    blocks: blocks("cpp-template-root", [
      ["paragraph", "函数模板本身不是普通函数；只有在模板实参确定并完成实例化后，具体实体才会参与调用。模板让相同算法复用于满足所需能力的不同类型。"],
      ["h2", "模板形参与模板实参"],
      ["paragraph", "模板形参是声明中的占位符，模板实参是在使用点代入的类型、值或模板。函数调用可以通过实参推导部分或全部类型模板参数。"],
      ["h2", "实例化与特化"],
      ["paragraph", "实例化会从模板生成具体实体；显式特化则为给定实参提供专门实现。阅读代码时需要区分“生成的具体版本”和程序员编写的显式特化。"]
    ])
  },
  "attention-root": {
    id: "attention-root",
    rootId: "attention-root",
    parentId: null,
    title: "从注意力机制到长期记忆",
    summary: "把线性阅读中的高亮、解释与回顾组织成可回溯的知识路径。",
    type: "主文章",
    tags: ["认知", "阅读方法"],
    childIds: [],
    createdAt: now,
    updatedAt: "2026-07-25T21:10:00+08:00",
    blocks: blocks("attention-root", [
      ["paragraph", "真正的理解发生在建立连接的时刻。高亮只是入口，围绕疑问形成的解释路径才会成为可以再次进入的长期记忆。"]
    ])
  },
  "llm-root": {
    id: "llm-root",
    rootId: "llm-root",
    parentId: null,
    title: "大型语言模型的推理边界",
    summary: "分析长上下文、外部知识与幻觉之间的关系。",
    type: "主文章",
    tags: ["AI", "LLM"],
    childIds: [],
    createdAt: now,
    updatedAt: "2026-07-24T17:45:00+08:00",
    blocks: blocks("llm-root", [
      ["paragraph", "语言模型生成的是条件概率下的后续文本。检索与引用能提供约束，但不会自动消除推理错误。"]
    ])
  },
  "graph-root": {
    id: "graph-root",
    rootId: "graph-root",
    parentId: null,
    title: "图数据库 Neo4j 基础概念",
    summary: "记录节点、关系、属性与 Cypher 查询的入门知识。",
    type: "主文章",
    tags: ["Neo4j", "数据库"],
    childIds: [],
    createdAt: now,
    updatedAt: "2026-07-22T11:30:00+08:00",
    blocks: blocks("graph-root", [
      ["paragraph", "属性图由节点、带方向的关系与键值属性组成。查询通常围绕模式匹配展开。"]
    ])
  }
};

const notebooks: Notebook[] = [
  {
    id: "notebook-ecs",
    rootId: "ecs-root",
    title: articles["ecs-root"].title,
    summary: articles["ecs-root"].summary,
    tags: articles["ecs-root"].tags,
    category: "技术学习",
    updatedAt: now,
    lastOpenedNodeId: "ecs-root",
    accent: "cobalt"
  },
  {
    id: "notebook-cpp-polymorphism",
    rootId: "cpp-polymorphism-root",
    title: articles["cpp-polymorphism-root"].title,
    summary: articles["cpp-polymorphism-root"].summary,
    tags: articles["cpp-polymorphism-root"].tags,
    category: "C++ / 核心",
    updatedAt: articles["cpp-polymorphism-root"].updatedAt,
    lastOpenedNodeId: "cpp-polymorphism-root",
    accent: "cobalt"
  },
  {
    id: "notebook-cpp-vtable",
    rootId: "cpp-vtable-root",
    title: articles["cpp-vtable-root"].title,
    summary: articles["cpp-vtable-root"].summary,
    tags: articles["cpp-vtable-root"].tags,
    category: "C++ / 对象模型",
    updatedAt: articles["cpp-vtable-root"].updatedAt,
    lastOpenedNodeId: "cpp-vtable-root",
    accent: "amber"
  },
  {
    id: "notebook-cpp-virtual-destructor",
    rootId: "cpp-virtual-destructor-root",
    title: articles["cpp-virtual-destructor-root"].title,
    summary: articles["cpp-virtual-destructor-root"].summary,
    tags: articles["cpp-virtual-destructor-root"].tags,
    category: "C++ / 生命周期",
    updatedAt: articles["cpp-virtual-destructor-root"].updatedAt,
    lastOpenedNodeId: "cpp-virtual-destructor-root",
    accent: "green"
  },
  {
    id: "notebook-cpp-template",
    rootId: "cpp-template-root",
    title: articles["cpp-template-root"].title,
    summary: articles["cpp-template-root"].summary,
    tags: articles["cpp-template-root"].tags,
    category: "C++ / 模板",
    updatedAt: articles["cpp-template-root"].updatedAt,
    lastOpenedNodeId: "cpp-template-root",
    accent: "cobalt"
  },
  {
    id: "notebook-attention",
    rootId: "attention-root",
    title: articles["attention-root"].title,
    summary: articles["attention-root"].summary,
    tags: articles["attention-root"].tags,
    category: "阅读方法",
    updatedAt: articles["attention-root"].updatedAt,
    lastOpenedNodeId: "attention-root",
    accent: "green"
  },
  {
    id: "notebook-llm",
    rootId: "llm-root",
    title: articles["llm-root"].title,
    summary: articles["llm-root"].summary,
    tags: articles["llm-root"].tags,
    category: "概念解析",
    updatedAt: articles["llm-root"].updatedAt,
    lastOpenedNodeId: "llm-root",
    accent: "amber"
  },
  {
    id: "notebook-graph",
    rootId: "graph-root",
    title: articles["graph-root"].title,
    summary: articles["graph-root"].summary,
    tags: articles["graph-root"].tags,
    category: "数据库",
    updatedAt: articles["graph-root"].updatedAt,
    lastOpenedNodeId: "graph-root",
    accent: "cobalt"
  }
];

const folderProfiles: FolderProfile[] = [
  {
    key: "技术学习",
    name: "技术学习",
    color: "#3158D8",
    icon: "cpu",
    classifications: ["系统基础", "工程"],
    description: "集中整理架构、系统与工程实践中的长期知识。"
  },
  {
    key: "C++ / 核心",
    name: "C++ 核心",
    color: "#4E68C8",
    icon: "code",
    classifications: ["语言底层", "C++"],
    description: "围绕语言机制、运行时行为与核心语义建立索引。"
  },
  {
    key: "C++ / 对象模型",
    name: "C++ 对象模型",
    color: "#8A5AA8",
    icon: "layers",
    classifications: ["对象模型", "ABI"],
    description: "记录类型布局、虚调用与编译器实现之间的联系。"
  },
  {
    key: "C++ / 生命周期",
    name: "C++ 生命周期",
    color: "#2F806E",
    icon: "archive",
    classifications: ["内存管理", "C++"],
    description: "聚合构造、析构、所有权与资源安全相关笔记。"
  },
  {
    key: "C++ / 模板",
    name: "C++ 模板",
    color: "#B36A3E",
    icon: "template",
    classifications: ["泛型编程", "C++"],
    description: "从函数模板到类型推导，整理可复用的泛型知识。"
  },
  {
    key: "阅读方法",
    name: "阅读方法",
    color: "#4E7A8A",
    icon: "book",
    classifications: ["学习方法", "阅读"],
    description: "保存注意力管理、理解与回顾材料的实践方法。"
  },
  {
    key: "概念解析",
    name: "概念解析",
    color: "#A35C74",
    icon: "sparkles",
    classifications: ["AI 概念", "研究"],
    description: "把复杂概念拆成定义、边界和可验证的关联。"
  },
  {
    key: "数据库",
    name: "数据库",
    color: "#5B6E9D",
    icon: "database",
    classifications: ["数据系统", "图谱"],
    description: "归档数据模型、查询结构和图数据库相关内容。"
  }
];

export const seedData: AppData = {
  notebooks,
  folderProfiles,
  deletedFolderKeys: [],
  articles,
  jobs: [],
  currentNotebookId: null,
  currentArticleId: null
};
