export const CONTENT_STYLE_STORAGE_KEY = "annota:content-style";
export const CUSTOM_CONTENT_STYLE_STORAGE_KEY =
  "annota:custom-content-style";

export type PresetContentStyleId =
  | "traditional"
  | "digital-garden"
  | "cognitive-neural"
  | "cosmic-atlas"
  | "academic-curation";
export type ContentStyleId = PresetContentStyleId | "custom";

export interface ContentTerms {
  home: string;
  graph: string;
  recent: string;
  newNote: string;
  subNotes: string;
  highlightCreate: string;
}

export interface ContentStyleDefinition {
  id: ContentStyleId;
  name: string;
  englishName: string;
  description: string;
  terms: ContentTerms;
}

export interface CustomContentStyle {
  name: string;
  terms: ContentTerms;
}

export const contentStyles: readonly ContentStyleDefinition[] = [
  {
    id: "traditional",
    name: "传统模式",
    englishName: "Traditional",
    description: "采用直接、通用的界面术语，适合熟悉常规笔记应用的使用方式。",
    terms: {
      home: "主页",
      graph: "知识图谱",
      recent: "最近浏览",
      newNote: "新建集合",
      subNotes: "子文章",
      highlightCreate: "划词生成"
    }
  },
  {
    id: "digital-garden",
    name: "数字花园",
    englishName: "Digital Garden",
    description: "用根系、生长与生态的比喻，强调知识持续培育的过程。",
    terms: {
      home: "温室",
      graph: "生态圈",
      recent: "生长年轮",
      newNote: "播种",
      subNotes: "枝叶",
      highlightCreate: "萌芽"
    }
  },
  {
    id: "cognitive-neural",
    name: "认知神经",
    englishName: "Cognitive & Neural",
    description: "以记忆、神经元和突触描述知识之间的连接与联想。",
    terms: {
      home: "意识中枢",
      graph: "思维拓扑",
      recent: "短期记忆",
      newNote: "建立神经元",
      subNotes: "联想节点",
      highlightCreate: "触发突触"
    }
  },
  {
    id: "cosmic-atlas",
    name: "星际图谱",
    englishName: "Cosmic Atlas",
    description: "以星系、轨迹和坐标表达知识空间中的探索与定位。",
    terms: {
      home: "观测台",
      graph: "宇宙全景",
      recent: "航行轨迹",
      newNote: "跃迁点",
      subNotes: "卫星节点",
      highlightCreate: "建立引力场"
    }
  },
  {
    id: "academic-curation",
    name: "学术策展",
    englishName: "Academic & Curation",
    description: "使用研究、策展与文献语言，突出材料组织和论证关系。",
    terms: {
      home: "策展大厅",
      graph: "关系矩阵",
      recent: "审计追踪",
      newNote: "确立课题",
      subNotes: "派生解读",
      highlightCreate: "提取锚点"
    }
  }
];

export const contentTermLabels: ReadonlyArray<{
  key: keyof ContentTerms;
  label: string;
}> = [
  { key: "home", label: "主页" },
  { key: "graph", label: "知识图谱" },
  { key: "recent", label: "最近浏览" },
  { key: "newNote", label: "新建集合" },
  { key: "subNotes", label: "子文章" },
  { key: "highlightCreate", label: "划词生成" }
];

export const defaultContentStyle: ContentStyleId = "traditional";

export const defaultCustomContentStyle: CustomContentStyle = {
  name: "我的风格",
  terms: { ...contentStyles[0].terms }
};

function resolvedCustomTerms(terms: ContentTerms): ContentTerms {
  const defaults = contentStyles[0].terms;
  return {
    home: terms.home.trim() || defaults.home,
    graph: terms.graph.trim() || defaults.graph,
    recent: terms.recent.trim() || defaults.recent,
    newNote: terms.newNote.trim() || defaults.newNote,
    subNotes: terms.subNotes.trim() || defaults.subNotes,
    highlightCreate:
      terms.highlightCreate.trim() || defaults.highlightCreate
  };
}

export function contentStyleDefinition(
  styleId: ContentStyleId,
  customStyle: CustomContentStyle = defaultCustomContentStyle
): ContentStyleDefinition {
  if (styleId === "custom") {
    return {
      id: "custom",
      name: customStyle.name.trim() || "自定义风格",
      englishName: "Custom",
      description: "使用你定义的界面术语；留空的项目会回退为传统模式。",
      terms: resolvedCustomTerms(customStyle.terms)
    };
  }
  return (
    contentStyles.find((style) => style.id === styleId) ??
    contentStyles[0]
  );
}

function isContentStyleId(value: unknown): value is ContentStyleId {
  return (
    value === "custom" ||
    contentStyles.some((style) => style.id === value)
  );
}

export function loadContentStyle(): ContentStyleId {
  try {
    const stored = window.localStorage.getItem(CONTENT_STYLE_STORAGE_KEY);
    return isContentStyleId(stored) ? stored : defaultContentStyle;
  } catch {
    return defaultContentStyle;
  }
}

export function applyContentStyle(styleId: ContentStyleId) {
  document.documentElement.dataset.contentStyle = styleId;
}

export function saveContentStyle(styleId: ContentStyleId) {
  window.localStorage.setItem(CONTENT_STYLE_STORAGE_KEY, styleId);
  applyContentStyle(styleId);
}

function storedTerm(
  value: unknown,
  fallback: string
) {
  return typeof value === "string" ? value : fallback;
}

export function loadCustomContentStyle(): CustomContentStyle {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CUSTOM_CONTENT_STYLE_STORAGE_KEY) ?? "{}"
    ) as {
      name?: unknown;
      terms?: Partial<Record<keyof ContentTerms, unknown>>;
    };
    const defaults = defaultCustomContentStyle;
    const loaded: CustomContentStyle = {
      name: storedTerm(parsed.name, defaults.name),
      terms: {
        home: storedTerm(parsed.terms?.home, defaults.terms.home),
        graph: storedTerm(parsed.terms?.graph, defaults.terms.graph),
        recent: storedTerm(parsed.terms?.recent, defaults.terms.recent),
        newNote: storedTerm(parsed.terms?.newNote, defaults.terms.newNote),
        subNotes: storedTerm(parsed.terms?.subNotes, defaults.terms.subNotes),
        highlightCreate: storedTerm(
          parsed.terms?.highlightCreate,
          defaults.terms.highlightCreate
        )
      }
    };
    window.localStorage.setItem(
      CUSTOM_CONTENT_STYLE_STORAGE_KEY,
      JSON.stringify(loaded)
    );
    return loaded;
  } catch {
    return {
      name: defaultCustomContentStyle.name,
      terms: { ...defaultCustomContentStyle.terms }
    };
  }
}

export function saveCustomContentStyle(style: CustomContentStyle) {
  window.localStorage.setItem(
    CUSTOM_CONTENT_STYLE_STORAGE_KEY,
    JSON.stringify(style)
  );
}

export function applyStoredContentStyle() {
  applyContentStyle(loadContentStyle());
}
