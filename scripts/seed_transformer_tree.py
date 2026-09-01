"""写入 Demo 的 Transformer 知识树(18 节点,覆盖全部 19 种类型)到桌面数据。

流程(与上一轮重置模式一致):
1. 应用关闭状态下删除 %APPDATA%/%LOCALAPPDATA% 的 dev.annota.desktop
2. 冷启动应用一次,自动建空库(user_version=4)
3. 关闭应用,运行本脚本
4. 重启应用验证

幂等保护:若 articles 表缺新列则自行 ALTER TABLE ADD COLUMN。
"""
import hashlib
import json
import os
import random
import sqlite3
import string
import sys
from pathlib import Path

APPDATA = Path(os.environ["APPDATA"]) / "dev.annota.desktop"
WORKSPACE = APPDATA / "workspaces" / "default"
DB_PATH = WORKSPACE / ".annota" / "library.sqlite3"
NOTES_DIR = WORKSPACE / "notes"

STAMP = "2026-09-01T12:00:00.000Z"


def random_note_name() -> str:
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choice(chars) for _ in range(12))


def node(
    node_id,
    title,
    article_type,
    family,
    creation_method,
    content=None,
    anchor=None,
    generation=None,
    source=None,
    summary="",
):
    return {
        "id": node_id,
        "title": title,
        "type": article_type,
        "family": family,
        "creation_method": creation_method,
        "content_json": content,
        "anchor_json": anchor,
        "generation_json": generation,
        "source_json": source,
        "summary": summary,
        "markdown": f"# {title}\n\n{summary or ''}\n",
    }


def build_nodes():
    return [
        node(
            "tf-root",
            "Transformer Architecture",
            "根节点",
            "笔记",
            "导入",
            content={"文本": "关于自注意力、多头注意力、位置编码和编码器—解码器结构的原始文章。"},
            summary="关于自注意力、多头注意力、位置编码和编码器—解码器结构的原始文章。",
        ),
        node(
            "tf-explain",
            "Self-Attention 的直觉",
            "解释",
            "记录",
            "AI",
            content={"文本": "将 Query、Key、Value 解释为一种根据上下文重新分配注意力的机制。"},
            anchor={"文档标识": "tf-root", "章节": "第 2 节", "段落范围": "第 2—3 段", "选区字数": 83},
            generation={"模型": "GPT-4o"},
            summary="将 Query、Key、Value 解释为一种根据上下文重新分配注意力的机制。",
        ),
        node(
            "tf-translation",
            "关键段落中文翻译",
            "翻译",
            "记录",
            "AI",
            content={
                "原语言": "en",
                "目标语言": "zh-CN",
                "原文": "Attention is a function of a query and a set of key-value pairs.",
                "译文": "注意力是关于查询和一组键值对的函数。",
            },
            anchor={"文档标识": "tf-root", "章节": "第 4 节"},
            generation={"模型": "GPT-4o"},
        ),
        node(
            "tf-summary",
            "当前章节总结",
            "总结",
            "记录",
            "AI",
            content={"文本": "将当前章节整理为结论、术语和容易混淆的概念。", "结论数量": 5},
            anchor={"文档标识": "tf-root", "范围": "完整章节"},
            generation={"模型": "GPT-4o"},
            summary="将当前章节整理为结论、术语和容易混淆的概念。",
        ),
        node(
            "tf-highlight",
            "Attention 权重重点句",
            "重点",
            "记录",
            "手动",
            content={
                "引文": "The attention weights can change depending on the surrounding context.",
                "备注": "保存原文中的重要句子，并作为后续生成的来源。",
            },
            anchor={"文档标识": "tf-root", "段落": "第 3 段"},
            source={
                "parentId": "tf-root",
                "blockId": "root-b3",
                "quote": "The attention weights can change depending on the surrounding context.",
                "generationType": "highlight",
            },
        ),
        node(
            "tf-diagram",
            "Encoder-Decoder 数据流",
            "架构图",
            "记录",
            "AI",
            content={"节点": ["Input", "Encoder", "Cross-Attn", "Output"], "渲染": "flowchart LR"},
            anchor={"文档标识": "tf-root", "章节": "结构章节"},
            generation={"模型": "GPT-4o"},
        ),
        node(
            "tf-question",
            "为什么要使用多头注意力？",
            "追问",
            "交互",
            "AI",
            content={
                "问题": "为什么要使用多头注意力？",
                "后续追问": "继续询问不同注意力头是否能够分别学习不同类型的关系。",
            },
            generation={"模型": "GPT-4o"},
        ),
        node(
            "tf-term",
            "Query / Key / Value",
            "术语",
            "记录",
            "AI",
            content={"术语": ["Query", "Key", "Value"]},
            generation={"模型": "GPT-4o"},
        ),
        node(
            "tf-formula",
            "Scaled Dot-Product 推导",
            "公式",
            "记录",
            "AI",
            content={
                "公式": "Attn(Q,K,V) = softmax(QKᵀ / √dₖ) V",
                "说明": "√dₖ 防止点积过大导致 Softmax 梯度饱和",
            },
            anchor={"文档标识": "tf-explain", "章节": "第 2 节"},
            generation={"模型": "GPT-4o"},
        ),
        node(
            "tf-compare",
            "RNN 与 Transformer",
            "对比",
            "交互",
            "AI",
            content={
                "对比项": [
                    {"名称": "RNN", "描述": "顺序计算，依赖隐藏状态。"},
                    {"名称": "Transformer", "描述": "并行计算，直接建模关系。"},
                ]
            },
            generation={"模型": "GPT-4o"},
        ),
        node(
            "tf-code",
            "PyTorch 注意力实现片段",
            "代码",
            "记录",
            "AI",
            content={"语言": "python", "代码": "scores = query @ key.transpose(-2, -1)"},
            generation={"模型": "GPT-4o"},
        ),
        node(
            "tf-pitfall",
            "Causal Mask 填充陷阱",
            "避坑",
            "记录",
            "手动",
            content={
                "误区": "Mask 位置填充 0，仍会参与 Softmax 权重分配",
                "正解": "Softmax 前填充 −1e9 或 −∞",
            },
        ),
        node(
            "tf-checklist",
            "实现一个最小注意力模块",
            "实践清单",
            "交互",
            "AI",
            content={
                "清单项": [
                    {"文本": "准备 Query、Key、Value", "已完成": True},
                    {"文本": "计算注意力分数", "已完成": True},
                    {"文本": "完成 Softmax 缩放", "已完成": False},
                ]
            },
            generation={"模型": "GPT-4o"},
        ),
        node(
            "tf-analogy",
            "Q/K/V 与图书馆检索",
            "类比",
            "记录",
            "手动",
            content={
                "引文": "Query 是借书条上的检索词，Key 是卡片目录的索引标签，Value 是书架上真正包含知识的内容本尊。",
                "备注": "认知辅助",
            },
        ),
        node(
            "tf-note",
            "我的理解：多个观察角度",
            "个人笔记",
            "笔记",
            "手动",
            content={"文本": "记录自己对不同注意力头分工的理解和后续疑问。"},
        ),
        node(
            "tf-source",
            "Attention 原文来源",
            "原文来源",
            "记录",
            "手动",
            content={"引文": "Attention is a function of a query and a set of key-value pairs."},
            anchor={"文档标识": "tf-root", "章节": "第 3 节"},
            source={
                "parentId": "tf-root",
                "blockId": "root-b2",
                "quote": "Attention is a function of a query and a set of key-value pairs.",
                "generationType": "source",
            },
        ),
        node(
            "tf-flashcard",
            "多头注意力复习卡",
            "复习闪卡",
            "交互",
            "AI",
            content={"问题": "多头注意力相比单头注意力解决了什么问题？", "答案": None},
            generation={"模型": "GPT-4o"},
        ),
    ]


# 父节点 → 有序子节点列表(Demo 拓扑)
EDGES = [
    ("tf-root", ["tf-explain", "tf-translation", "tf-summary", "tf-highlight", "tf-diagram",
                  "tf-question", "tf-term", "tf-compare", "tf-code", "tf-checklist",
                  "tf-note", "tf-source", "tf-flashcard"]),
    ("tf-explain", ["tf-formula"]),
    ("tf-code", ["tf-pitfall"]),
    ("tf-term", ["tf-analogy"]),
]


def ensure_columns(con):
    cols = {r[1] for r in con.execute("PRAGMA table_info(articles)")}
    for col, ddl in [
        ("family", "TEXT NOT NULL DEFAULT '笔记'"),
        ("creation_method", "TEXT NOT NULL DEFAULT '手动'"),
        ("content_json", "TEXT"),
        ("anchor_json", "TEXT"),
        ("generation_json", "TEXT"),
        ("config_json", "TEXT"),
    ]:
        if col not in cols:
            con.execute(f"ALTER TABLE articles ADD COLUMN {col} {ddl}")
    edge_cols = {r[1] for r in con.execute("PRAGMA table_info(article_edges)")}
    if "relation_type" not in edge_cols:
        con.execute("ALTER TABLE article_edges ADD COLUMN relation_type TEXT NOT NULL DEFAULT '派生'")
    node_cols = {r[1] for r in con.execute("PRAGMA table_info(topology_nodes)")}
    if "config_json" not in node_cols:
        con.execute("ALTER TABLE topology_nodes ADD COLUMN config_json TEXT")
    notebook_cols = {r[1] for r in con.execute("PRAGMA table_info(notebooks)")}
    for col, ddl in [
        ("description", "TEXT NOT NULL DEFAULT ''"),
        ("color", "TEXT NOT NULL DEFAULT '#315fdb'"),
        ("icon", "TEXT NOT NULL DEFAULT 'library'"),
    ]:
        if col not in notebook_cols:
            con.execute(f"ALTER TABLE notebooks ADD COLUMN {col} {ddl}")
    version = con.execute("PRAGMA user_version").fetchone()[0]
    if version < 6:
        print(f"警告:user_version={version},预期 6。请先冷启动一次新版应用再运行 seed。")
        sys.exit(1)


def main():
    if not DB_PATH.exists():
        print(f"数据库不存在:{DB_PATH}")
        print("请先冷启动一次应用(自动建库)再运行 seed。")
        sys.exit(1)

    con = sqlite3.connect(DB_PATH)
    try:
        ensure_columns(con)
        # 清空旧数据(注意外键顺序)
        for table in ["pending_file_ops", "topology_interactions", "topology_relations",
                      "topology_nodes", "notebook_roots", "article_edges",
                      "notebooks", "articles", "documents"]:
            con.execute(f"DELETE FROM {table}")

        nodes = build_nodes()
        # 清理旧 notes 文件
        if NOTES_DIR.exists():
            for entry in NOTES_DIR.iterdir():
                if entry.is_file():
                    entry.unlink()
                elif entry.is_dir():
                    for f in entry.iterdir():
                        f.unlink()
                    entry.rmdir()

        # 1. documents + 随机名 md 文件(主文章文件夹=tf-root,知识点的所有内容都放其中)
        for item in nodes:
            rel = f"notes/tf-root/{random_note_name()}.md"
            path = WORKSPACE / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            content_bytes = item["markdown"].encode("utf-8")
            path.write_bytes(content_bytes)
            item["relative_path"] = rel
            con.execute(
                "INSERT INTO documents (id, relative_path, content_hash, byte_length, revision, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, 1, ?, ?)",
                (item["id"], rel, hashlib.sha256(content_bytes).hexdigest(),
                 len(content_bytes), STAMP, STAMP),
            )

        # 2. articles(根自引用满足 validate:parent_id NULL + root_id = id)
        parent_of = {}
        for parent_id, children in EDGES:
            for child in children:
                parent_of[child] = parent_id
        for item in nodes:
            con.execute(
                "INSERT INTO articles (id, root_id, parent_id, title, summary, article_type, "
                "appearance_json, source_json, family, creation_method, content_json, "
                "anchor_json, generation_json, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    item["id"],
                    "tf-root",
                    parent_of.get(item["id"]),
                    item["title"],
                    item["summary"],
                    item["type"],
                    None,  # appearance:契约不存颜色图标
                    json.dumps(item["source_json"], ensure_ascii=False) if item["source_json"] else None,
                    item["family"],
                    item["creation_method"],
                    json.dumps(item["content_json"], ensure_ascii=False) if item["content_json"] else None,
                    json.dumps(item["anchor_json"], ensure_ascii=False) if item["anchor_json"] else None,
                    json.dumps(item["generation_json"], ensure_ascii=False) if item["generation_json"] else None,
                    STAMP,
                    STAMP,
                ),
            )

        # 3. article_edges(位置有序 + relation_type)
        for parent_id, children in EDGES:
            for position, child_id in enumerate(children):
                con.execute(
                    "INSERT INTO article_edges (parent_id, child_id, position, relation_type) "
                    "VALUES (?, ?, ?, '派生')",
                    (parent_id, child_id, position),
                )

        # 4. notebook(集合:名称/颜色/图标/描述)+ notebook_roots
        con.execute(
            "INSERT INTO notebooks (id, root_id, title, summary, description, color, icon, updated_at, last_opened_node_id, accent) "
            "VALUES ('nb-tf', 'tf-root', 'Transformer Architecture', "
            "'关于自注意力、多头注意力、位置编码和编码器—解码器结构的原始文章。', "
            "'关于自注意力、多头注意力、位置编码和编码器—解码器结构的原始文章。', "
            "'#315fdb', 'library', ?, 'tf-root', 'cobalt')",
            (STAMP,),
        )
        con.execute(
            "INSERT INTO notebook_roots (notebook_id, article_id, position) VALUES ('nb-tf', 'tf-root', 0)"
        )

        con.commit()

        counts = {
            "articles": con.execute("SELECT COUNT(*) FROM articles").fetchone()[0],
            "edges": con.execute("SELECT COUNT(*) FROM article_edges").fetchone()[0],
            "documents": con.execute("SELECT COUNT(*) FROM documents").fetchone()[0],
            "notebooks": con.execute("SELECT COUNT(*) FROM notebooks").fetchone()[0],
        }
        print("seed 完成:", counts)
        print(f"notes 文件数: {sum(1 for _ in (WORKSPACE / 'notes').rglob('*.md'))}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
