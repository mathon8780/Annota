use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    path::PathBuf,
    sync::Mutex,
};

const DATABASE_VERSION: i64 = 6;
const MAX_ID_LENGTH: usize = 128;
const MAX_TEXT_LENGTH: usize = 16 * 1024 * 1024;
const MAX_JSON_LENGTH: usize = 1024 * 1024;

pub struct TopologyStore {
    connection: Mutex<Connection>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryMetadata {
    #[serde(default)]
    pub notebooks: Vec<LibraryNotebook>,
    #[serde(default)]
    pub articles: BTreeMap<String, LibraryArticle>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryNotebook {
    pub id: String,
    pub root_id: String,
    #[serde(default)]
    pub root_ids: Vec<String>,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_collection_color")]
    pub color: String,
    #[serde(default = "default_collection_icon")]
    pub icon: String,
    pub updated_at: String,
    pub last_opened_node_id: String,
    pub accent: String,
}

fn default_collection_color() -> String {
    "#315fdb".to_string()
}

fn default_collection_icon() -> String {
    "library".to_string()
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryArticle {
    pub id: String,
    pub root_id: String,
    pub parent_id: Option<String>,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(rename = "type")]
    pub article_type: String,
    #[serde(default)]
    pub child_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub appearance: Option<serde_json::Value>,
    pub source: Option<serde_json::Value>,
    #[serde(default)]
    pub family: String,
    #[serde(default)]
    pub creation_method: String,
    pub content_json: Option<serde_json::Value>,
    pub anchor_json: Option<serde_json::Value>,
    pub generation_json: Option<serde_json::Value>,
    pub config_json: Option<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyCollection {
    pub id: String,
    pub title: String,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyNode {
    pub id: String,
    pub collection_id: String,
    pub node_type: String,
    pub title: String,
    pub summary: String,
    pub content_mode: String,
    pub content: Option<String>,
    pub document_id: Option<String>,
    pub is_root: bool,
    pub is_manual: bool,
    pub enabled: bool,
    pub interactive: bool,
    pub interaction_state_json: String,
    pub appearance_json: String,
    pub family: String,
    pub creation_method: String,
    pub content_json: Option<String>,
    pub anchor_json: Option<String>,
    pub generation_json: Option<String>,
    pub config_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyRelation {
    pub id: String,
    pub collection_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub relation_type: String,
    pub label: String,
    pub directed: bool,
    pub metadata_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyInteraction {
    pub id: String,
    pub node_id: String,
    pub interaction_type: String,
    pub title: String,
    pub config_json: String,
    pub state_json: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyGraph {
    pub collection: TopologyCollection,
    pub nodes: Vec<TopologyNode>,
    pub relations: Vec<TopologyRelation>,
    pub interactions: Vec<TopologyInteraction>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertTopologyNodeRequest {
    pub id: String,
    pub collection_id: String,
    pub node_type: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    pub content_mode: String,
    pub content: Option<String>,
    pub document_id: Option<String>,
    #[serde(default)]
    pub is_root: bool,
    #[serde(default)]
    pub is_manual: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub interactive: bool,
    #[serde(default = "default_json_object")]
    pub interaction_state_json: String,
    #[serde(default = "default_json_object")]
    pub appearance_json: String,
    #[serde(default)]
    pub family: String,
    #[serde(default)]
    pub creation_method: String,
    pub content_json: Option<String>,
    pub anchor_json: Option<String>,
    pub generation_json: Option<String>,
    #[serde(default)]
    pub config_json: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertTopologyRelationRequest {
    pub id: String,
    pub collection_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub relation_type: String,
    #[serde(default)]
    pub label: String,
    #[serde(default = "default_true")]
    pub directed: bool,
    #[serde(default = "default_json_object")]
    pub metadata_json: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertTopologyInteractionRequest {
    pub id: String,
    pub node_id: String,
    pub interaction_type: String,
    #[serde(default)]
    pub title: String,
    #[serde(default = "default_json_object")]
    pub config_json: String,
    #[serde(default = "default_json_object")]
    pub state_json: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

fn default_json_object() -> String {
    "{}".to_string()
}

fn bool_from_i64(value: i64) -> bool {
    value != 0
}

fn validate_id(label: &str, value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_ID_LENGTH {
        return Err(format!("{label}不能为空且长度不能超过 {MAX_ID_LENGTH}"));
    }
    Ok(())
}

fn validate_text(label: &str, value: &str) -> Result<(), String> {
    if value.len() > MAX_TEXT_LENGTH {
        return Err(format!("{label}超过 16 MiB 限制"));
    }
    Ok(())
}

fn validate_json(label: &str, value: &str) -> Result<(), String> {
    if value.len() > MAX_JSON_LENGTH {
        return Err(format!("{label}超过 1 MiB 限制"));
    }
    serde_json::from_str::<serde_json::Value>(value)
        .map(|_| ())
        .map_err(|error| format!("{label}不是有效 JSON：{error}"))
}

fn map_collection(row: &Row<'_>) -> rusqlite::Result<TopologyCollection> {
    Ok(TopologyCollection {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn map_node(row: &Row<'_>) -> rusqlite::Result<TopologyNode> {
    Ok(TopologyNode {
        id: row.get(0)?,
        collection_id: row.get(1)?,
        node_type: row.get(2)?,
        title: row.get(3)?,
        summary: row.get(4)?,
        content_mode: row.get(5)?,
        content: row.get(6)?,
        document_id: row.get(7)?,
        is_root: bool_from_i64(row.get(8)?),
        is_manual: bool_from_i64(row.get(9)?),
        enabled: bool_from_i64(row.get(10)?),
        interactive: bool_from_i64(row.get(11)?),
        interaction_state_json: row.get(12)?,
        appearance_json: row.get(13)?,
        family: row.get(14)?,
        creation_method: row.get(15)?,
        content_json: row.get(16)?,
        anchor_json: row.get(17)?,
        generation_json: row.get(18)?,
        config_json: row.get(19)?,
        created_at: row.get(20)?,
        updated_at: row.get(21)?,
    })
}

fn map_relation(row: &Row<'_>) -> rusqlite::Result<TopologyRelation> {
    Ok(TopologyRelation {
        id: row.get(0)?,
        collection_id: row.get(1)?,
        source_node_id: row.get(2)?,
        target_node_id: row.get(3)?,
        relation_type: row.get(4)?,
        label: row.get(5)?,
        directed: bool_from_i64(row.get(6)?),
        metadata_json: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn map_interaction(row: &Row<'_>) -> rusqlite::Result<TopologyInteraction> {
    Ok(TopologyInteraction {
        id: row.get(0)?,
        node_id: row.get(1)?,
        interaction_type: row.get(2)?,
        title: row.get(3)?,
        config_json: row.get(4)?,
        state_json: row.get(5)?,
        enabled: bool_from_i64(row.get(6)?),
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn initialize_database(connection: &mut Connection) -> Result<(), String> {
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| error.to_string())?;
    let version = connection
        .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
        .map_err(|error| error.to_string())?;
    if version == DATABASE_VERSION {
        return Ok(());
    }
    if version > DATABASE_VERSION {
        return Err(format!(
            "拓扑数据库版本 {version} 高于当前支持版本 {DATABASE_VERSION}"
        ));
    }
    if version != 0 {
        return Err(format!(
            "不再支持数据库版本 {version}；请使用当前版本创建新工作区"
        ));
    }

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute_batch(
            r#"
            CREATE TABLE topology_collections (
                id TEXT PRIMARY KEY NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            CREATE TABLE topology_nodes (
                id TEXT PRIMARY KEY NOT NULL,
                collection_id TEXT NOT NULL REFERENCES topology_collections(id) ON DELETE CASCADE,
                node_type TEXT NOT NULL,
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                content_mode TEXT NOT NULL CHECK (content_mode IN ('markdown', 'database')),
                content TEXT,
                document_id TEXT,
                is_root INTEGER NOT NULL DEFAULT 0 CHECK (is_root IN (0, 1)),
                is_manual INTEGER NOT NULL DEFAULT 0 CHECK (is_manual IN (0, 1)),
                enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
                interactive INTEGER NOT NULL DEFAULT 0 CHECK (interactive IN (0, 1)),
                interaction_state_json TEXT NOT NULL DEFAULT '{}',
                appearance_json TEXT NOT NULL DEFAULT '{}',
                family TEXT NOT NULL DEFAULT '笔记',
                creation_method TEXT NOT NULL DEFAULT '手动',
                content_json TEXT,
                anchor_json TEXT,
                generation_json TEXT,
                config_json TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                CHECK (
                    (content_mode = 'markdown' AND document_id IS NOT NULL AND content IS NULL AND is_manual = 0)
                    OR
                    (content_mode = 'database' AND document_id IS NULL)
                )
            );

            CREATE INDEX topology_nodes_collection_idx
                ON topology_nodes(collection_id, is_root DESC, updated_at DESC);

            CREATE TABLE topology_relations (
                id TEXT PRIMARY KEY NOT NULL,
                collection_id TEXT NOT NULL REFERENCES topology_collections(id) ON DELETE CASCADE,
                source_node_id TEXT NOT NULL,
                target_node_id TEXT NOT NULL,
                relation_type TEXT NOT NULL,
                label TEXT NOT NULL DEFAULT '',
                directed INTEGER NOT NULL DEFAULT 1 CHECK (directed IN (0, 1)),
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                CHECK (source_node_id <> target_node_id)
            );

            CREATE INDEX topology_relations_collection_idx
                ON topology_relations(collection_id, source_node_id, target_node_id);

            CREATE TABLE topology_interactions (
                id TEXT PRIMARY KEY NOT NULL,
                node_id TEXT NOT NULL REFERENCES topology_nodes(id) ON DELETE CASCADE,
                interaction_type TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                config_json TEXT NOT NULL DEFAULT '{}',
                state_json TEXT NOT NULL DEFAULT '{}',
                enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            CREATE INDEX topology_interactions_node_idx
                ON topology_interactions(node_id, enabled DESC, updated_at DESC);

            CREATE TABLE documents (
                id TEXT PRIMARY KEY NOT NULL,
                relative_path TEXT NOT NULL UNIQUE,
                content_hash TEXT NOT NULL,
                byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
                revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            CREATE TABLE articles (
                id TEXT PRIMARY KEY NOT NULL,
                root_id TEXT NOT NULL REFERENCES articles(id) DEFERRABLE INITIALLY DEFERRED,
                parent_id TEXT REFERENCES articles(id) DEFERRABLE INITIALLY DEFERRED,
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                article_type TEXT NOT NULL,
                appearance_json TEXT,
                source_json TEXT,
                family TEXT NOT NULL DEFAULT '笔记',
                creation_method TEXT NOT NULL DEFAULT '手动',
                content_json TEXT,
                anchor_json TEXT,
                generation_json TEXT,
                config_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX articles_root_idx ON articles(root_id, updated_at DESC, id);
            CREATE INDEX articles_parent_idx ON articles(parent_id, updated_at DESC, id);

            CREATE TABLE article_edges (
                parent_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                child_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                position INTEGER NOT NULL CHECK (position >= 0),
                relation_type TEXT NOT NULL DEFAULT '派生',
                PRIMARY KEY (parent_id, child_id),
                UNIQUE (parent_id, position),
                CHECK (parent_id <> child_id)
            );

            CREATE TABLE notebooks (
                id TEXT PRIMARY KEY NOT NULL,
                root_id TEXT NOT NULL REFERENCES articles(id) DEFERRABLE INITIALLY DEFERRED,
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                color TEXT NOT NULL DEFAULT '#315fdb',
                icon TEXT NOT NULL DEFAULT 'library',
                updated_at TEXT NOT NULL,
                last_opened_node_id TEXT NOT NULL REFERENCES articles(id) DEFERRABLE INITIALLY DEFERRED,
                accent TEXT NOT NULL CHECK (accent IN ('cobalt', 'amber', 'green'))
            );

            CREATE TABLE notebook_roots (
                notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
                article_id TEXT NOT NULL REFERENCES articles(id),
                position INTEGER NOT NULL CHECK (position >= 0),
                PRIMARY KEY (notebook_id, article_id),
                UNIQUE (notebook_id, position)
            );

            CREATE INDEX notebook_roots_article_idx ON notebook_roots(article_id);

            CREATE TABLE pending_file_ops (
                operation_id TEXT PRIMARY KEY NOT NULL,
                operation_kind TEXT NOT NULL CHECK (operation_kind IN ('markdown-write')),
                document_id TEXT NOT NULL UNIQUE,
                relative_path TEXT NOT NULL,
                staging_relative_path TEXT NOT NULL UNIQUE,
                backup_relative_path TEXT NOT NULL UNIQUE,
                content_hash TEXT NOT NULL,
                original_hash TEXT,
                byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
                target_revision INTEGER NOT NULL CHECK (target_revision >= 1),
                state TEXT NOT NULL CHECK (state IN ('prepared', 'published')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX pending_file_ops_state_idx
                ON pending_file_ops(state, created_at, operation_id);

            CREATE TABLE node_type_definitions (
                id TEXT PRIMARY KEY NOT NULL,
                config_json TEXT NOT NULL,
                position INTEGER NOT NULL CHECK (position >= 0),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            "#,
        )
        .map_err(|error| error.to_string())?;
    transaction
        .pragma_update(None, "user_version", DATABASE_VERSION)
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

fn validate_library_metadata(metadata: &LibraryMetadata) -> Result<(), String> {
    let article_ids = metadata.articles.keys().cloned().collect::<HashSet<_>>();
    let notebook_ids = metadata
        .notebooks
        .iter()
        .map(|notebook| notebook.id.clone())
        .collect::<HashSet<_>>();
    if notebook_ids.len() != metadata.notebooks.len() {
        return Err("资料库包含重复的 Notebook 标识".to_string());
    }

    for (key, article) in &metadata.articles {
        validate_id("文章标识", key)?;
        validate_id("文章标识", &article.id)?;
        if key != &article.id {
            return Err(format!("文章映射键 {key} 与文章标识 {} 不一致", article.id));
        }
        validate_id("文章根标识", &article.root_id)?;
        validate_text("文章标题", &article.title)?;
        validate_text("文章摘要", &article.summary)?;
        validate_text("文章类型", &article.article_type)?;
        validate_text("文章创建时间", &article.created_at)?;
        validate_text("文章更新时间", &article.updated_at)?;
        if !article_ids.contains(&article.root_id) {
            return Err(format!("文章 {} 引用了不存在的根文章", article.id));
        }
        if let Some(parent_id) = &article.parent_id {
            if !article_ids.contains(parent_id) {
                return Err(format!("文章 {} 引用了不存在的父文章", article.id));
            }
        }
        match &article.parent_id {
            None if article.root_id != article.id => {
                return Err(format!("无父文章的 {} 必须以自身作为根标识", article.id));
            }
            Some(parent_id) => {
                let parent = metadata
                    .articles
                    .get(parent_id)
                    .expect("parent existence was validated above");
                if parent.root_id != article.root_id
                    || !parent
                        .child_ids
                        .iter()
                        .any(|child_id| child_id == &article.id)
                {
                    return Err(format!("文章 {} 的父子或根引用不一致", article.id));
                }
            }
            None => {}
        }
        let mut children = HashSet::new();
        for child_id in &article.child_ids {
            if !article_ids.contains(child_id) {
                return Err(format!("文章 {} 引用了不存在的子文章", article.id));
            }
            if child_id == &article.id || !children.insert(child_id) {
                return Err(format!("文章 {} 包含重复或自引用的子文章", article.id));
            }
            if metadata
                .articles
                .get(child_id)
                .and_then(|child| child.parent_id.as_deref())
                != Some(article.id.as_str())
            {
                return Err(format!("文章 {} 的父子关系不一致", child_id));
            }
        }
        if !matches!(article.family.as_str(), "笔记" | "记录" | "交互") {
            return Err(format!(
                "文章 {} 的家族无效：{}",
                article.id, article.family
            ));
        }
        if !matches!(article.creation_method.as_str(), "导入" | "AI" | "手动") {
            return Err(format!(
                "文章 {} 的创建方式无效：{}",
                article.id, article.creation_method
            ));
        }
        for (label, value) in [
            ("文章外观", article.appearance.as_ref()),
            ("文章来源", article.source.as_ref()),
            ("文章结构化内容", article.content_json.as_ref()),
            ("文章原文锚点", article.anchor_json.as_ref()),
            ("文章生成信息", article.generation_json.as_ref()),
            ("文章节点配置", article.config_json.as_ref()),
        ] {
            if let Some(value) = value {
                let serialized = serde_json::to_string(value)
                    .map_err(|error| format!("{label}无法序列化：{error}"))?;
                if serialized.len() > MAX_JSON_LENGTH {
                    return Err(format!("{label}超过 1 MiB 限制"));
                }
            }
        }
    }

    for notebook in &metadata.notebooks {
        validate_id("Notebook 标识", &notebook.id)?;
        validate_id("Notebook 根文章标识", &notebook.root_id)?;
        validate_id("Notebook 最近文章标识", &notebook.last_opened_node_id)?;
        validate_text("Notebook 标题", &notebook.title)?;
        validate_text("Notebook 摘要", &notebook.summary)?;
        validate_text("Notebook 更新时间", &notebook.updated_at)?;
        if !article_ids.contains(&notebook.root_id)
            || !article_ids.contains(&notebook.last_opened_node_id)
        {
            return Err(format!("Notebook {} 引用了不存在的文章", notebook.id));
        }
        if !matches!(notebook.accent.as_str(), "cobalt" | "amber" | "green") {
            return Err(format!("Notebook {} 的强调色无效", notebook.id));
        }
        let mut roots = HashSet::new();
        for root_id in std::iter::once(&notebook.root_id).chain(notebook.root_ids.iter()) {
            if !article_ids.contains(root_id) {
                return Err(format!("Notebook {} 引用了不存在的根文章", notebook.id));
            }
            let root = metadata
                .articles
                .get(root_id)
                .expect("root existence was validated above");
            if root.parent_id.is_some() || root.root_id != root.id {
                return Err(format!("Notebook {} 的根列表包含非根文章", notebook.id));
            }
            roots.insert(root_id);
        }
    }
    Ok(())
}

fn replace_library_metadata_on_connection(
    connection: &mut Connection,
    metadata: &LibraryMetadata,
    force_projection: bool,
) -> Result<(), String> {
    validate_library_metadata(metadata)?;
    let previous = load_library_metadata_from_connection(connection)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .pragma_update(None, "defer_foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    for article in metadata.articles.values() {
        if previous.articles.get(&article.id) == Some(article) {
            continue;
        }
        let appearance_json = article
            .appearance
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| error.to_string())?;
        let source_json = article
            .source
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| error.to_string())?;
        let content_json = article
            .content_json
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| error.to_string())?;
        let anchor_json = article
            .anchor_json
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| error.to_string())?;
        let generation_json = article
            .generation_json
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| error.to_string())?;
        let config_json = article
            .config_json
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO articles (id, root_id, parent_id, title, summary, article_type, appearance_json, source_json, family, creation_method, content_json, anchor_json, generation_json, config_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
                 ON CONFLICT(id) DO UPDATE SET
                   root_id=excluded.root_id, parent_id=excluded.parent_id, title=excluded.title,
                   summary=excluded.summary, article_type=excluded.article_type,
                   appearance_json=excluded.appearance_json, source_json=excluded.source_json,
                   family=excluded.family, creation_method=excluded.creation_method,
                   content_json=excluded.content_json, anchor_json=excluded.anchor_json,
                   generation_json=excluded.generation_json, config_json=excluded.config_json,
                   created_at=excluded.created_at, updated_at=excluded.updated_at",
                params![
                    article.id,
                    article.root_id,
                    article.parent_id,
                    article.title,
                    article.summary,
                    article.article_type,
                    appearance_json,
                    source_json,
                    article.family,
                    article.creation_method,
                    content_json,
                    anchor_json,
                    generation_json,
                    config_json,
                    article.created_at,
                    article.updated_at,
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    for notebook in &metadata.notebooks {
        if previous.notebooks.iter().any(|old| old == notebook) {
            continue;
        }
        transaction
            .execute(
                "INSERT INTO notebooks (id, root_id, title, summary, description, color, icon, updated_at, last_opened_node_id, accent)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(id) DO UPDATE SET
                   root_id=excluded.root_id, title=excluded.title, summary=excluded.summary,
                   description=excluded.description, color=excluded.color, icon=excluded.icon,
                   updated_at=excluded.updated_at,
                   last_opened_node_id=excluded.last_opened_node_id, accent=excluded.accent",
                params![
                    notebook.id,
                    notebook.root_id,
                    notebook.title,
                    notebook.summary,
                    notebook.description,
                    notebook.color,
                    notebook.icon,
                    notebook.updated_at,
                    notebook.last_opened_node_id,
                    notebook.accent,
                ],
            )
            .map_err(|error| error.to_string())?;
        let mut roots = Vec::new();
        for root_id in std::iter::once(&notebook.root_id).chain(notebook.root_ids.iter()) {
            if !roots.contains(root_id) {
                roots.push(root_id.clone());
            }
        }
        let previous_roots = previous
            .notebooks
            .iter()
            .find(|old| old.id == notebook.id)
            .map(|old| &old.root_ids);
        if previous_roots != Some(&roots) {
            transaction
                .execute(
                    "DELETE FROM notebook_roots WHERE notebook_id = ?1",
                    [&notebook.id],
                )
                .map_err(|error| error.to_string())?;
            for (position, root_id) in roots.iter().enumerate() {
                transaction.execute(
                    "INSERT INTO notebook_roots (notebook_id, article_id, position) VALUES (?1, ?2, ?3)",
                    params![notebook.id, root_id, position as i64],
                ).map_err(|error| error.to_string())?;
            }
        }
    }

    for article in metadata.articles.values() {
        if previous
            .articles
            .get(&article.id)
            .is_some_and(|old| old.child_ids == article.child_ids)
        {
            continue;
        }
        transaction
            .execute(
                "DELETE FROM article_edges WHERE parent_id = ?1",
                [&article.id],
            )
            .map_err(|error| error.to_string())?;
        for (position, child_id) in article.child_ids.iter().enumerate() {
            transaction
                .execute(
                    "INSERT INTO article_edges (parent_id, child_id, position) VALUES (?1, ?2, ?3)",
                    params![article.id, child_id, position as i64],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    for notebook in &previous.notebooks {
        if !metadata
            .notebooks
            .iter()
            .any(|current| current.id == notebook.id)
        {
            transaction
                .execute("DELETE FROM notebooks WHERE id = ?1", [&notebook.id])
                .map_err(|error| error.to_string())?;
        }
    }
    for article_id in previous.articles.keys() {
        if !metadata.articles.contains_key(article_id) {
            transaction
                .execute("DELETE FROM articles WHERE id = ?1", [article_id])
                .map_err(|error| error.to_string())?;
        }
    }
    project_markdown_topology(&transaction, &previous, metadata, force_projection)?;
    transaction.commit().map_err(|error| error.to_string())
}

fn markdown_owners(metadata: &LibraryMetadata) -> BTreeMap<&str, &str> {
    let mut root_owners = BTreeMap::<&str, &str>::new();
    for notebook in &metadata.notebooks {
        for root_id in std::iter::once(&notebook.root_id).chain(&notebook.root_ids) {
            root_owners
                .entry(root_id.as_str())
                .and_modify(|owner| {
                    if notebook.id.as_str() < *owner {
                        *owner = &notebook.id;
                    }
                })
                .or_insert(&notebook.id);
        }
    }
    let owners = metadata
        .articles
        .values()
        .filter_map(|article| {
            root_owners
                .get(article.root_id.as_str())
                .map(|owner| (article.id.as_str(), *owner))
        })
        .collect::<BTreeMap<_, _>>();
    owners
}

fn project_markdown_topology(
    transaction: &rusqlite::Transaction<'_>,
    previous: &LibraryMetadata,
    metadata: &LibraryMetadata,
    force: bool,
) -> Result<(), String> {
    for notebook in &metadata.notebooks {
        let description = if notebook.description.is_empty() {
            &notebook.summary
        } else {
            &notebook.description
        };
        transaction
            .execute(
                "INSERT INTO topology_collections (id, title, description) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description,
               updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE title IS NOT excluded.title OR description IS NOT excluded.description",
                params![notebook.id, notebook.title, description],
            )
            .map_err(|error| error.to_string())?;
    }

    // 每篇文章只保留一条物理节点记录以供互动外键引用；其他集合的成员关系由根文章推导。
    let owners = markdown_owners(metadata);
    let previous_owners = markdown_owners(previous);
    for article in metadata.articles.values() {
        let Some(collection_id) = owners.get(article.id.as_str()) else {
            continue;
        };
        if !force
            && previous.articles.get(&article.id) == Some(article)
            && previous_owners.get(article.id.as_str()) == Some(collection_id)
        {
            continue;
        }
        let appearance_json = article
            .appearance
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| error.to_string())?
            .unwrap_or_else(|| "{}".into());
        let node_type = article
            .appearance
            .as_ref()
            .and_then(|value| value.get("typeId"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or(if article.parent_id.is_some() {
                "explain"
            } else {
                "root"
            });
        let content_json = article
            .content_json
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| error.to_string())?;
        let anchor_json = article
            .anchor_json
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| error.to_string())?;
        let generation_json = article
            .generation_json
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| error.to_string())?;
        let config_json = article
            .config_json
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO topology_nodes (id, collection_id, node_type, title, summary,
               content_mode, content, document_id, is_root, is_manual, enabled, interactive,
               interaction_state_json, appearance_json, family, creation_method,
               content_json, anchor_json, generation_json, config_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'markdown', NULL, ?1, ?6, 0, 1, 0,
               '{}', ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
             ON CONFLICT(id) DO UPDATE SET
               collection_id=excluded.collection_id, node_type=excluded.node_type,
               title=excluded.title, summary=excluded.summary, document_id=excluded.document_id,
               is_root=excluded.is_root, appearance_json=excluded.appearance_json,
               family=excluded.family, creation_method=excluded.creation_method,
               content_json=excluded.content_json, anchor_json=excluded.anchor_json,
               generation_json=excluded.generation_json, config_json=excluded.config_json,
               updated_at=excluded.updated_at
             WHERE topology_nodes.collection_id IS NOT excluded.collection_id
               OR topology_nodes.node_type IS NOT excluded.node_type
               OR topology_nodes.title IS NOT excluded.title
               OR topology_nodes.summary IS NOT excluded.summary
               OR topology_nodes.is_root IS NOT excluded.is_root
               OR topology_nodes.appearance_json IS NOT excluded.appearance_json
               OR topology_nodes.family IS NOT excluded.family
               OR topology_nodes.creation_method IS NOT excluded.creation_method
               OR topology_nodes.content_json IS NOT excluded.content_json
               OR topology_nodes.anchor_json IS NOT excluded.anchor_json
               OR topology_nodes.generation_json IS NOT excluded.generation_json
               OR topology_nodes.config_json IS NOT excluded.config_json
               OR topology_nodes.updated_at IS NOT excluded.updated_at",
                params![
                    article.id,
                    collection_id,
                    node_type,
                    article.title,
                    article.summary,
                    article.parent_id.is_none(),
                    appearance_json,
                    article.family,
                    article.creation_method,
                    content_json,
                    anchor_json,
                    generation_json,
                    config_json,
                    article.created_at,
                    article.updated_at
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    // 清除旧前端同步留下的树关系；图谱读取时直接由文章父子关系推导。
    transaction
        .execute(
            "DELETE FROM topology_relations WHERE metadata_json = '{\"source\":\"markdown-tree\"}'",
            [],
        )
        .map_err(|error| error.to_string())?;
    for article_id in previous.articles.keys() {
        if !owners.contains_key(article_id.as_str()) {
            transaction.execute(
                "DELETE FROM topology_relations WHERE source_node_id = ?1 OR target_node_id = ?1",
                [article_id],
            ).map_err(|error| error.to_string())?;
            transaction
                .execute(
                    "DELETE FROM topology_nodes WHERE id = ?1 AND content_mode = 'markdown'",
                    [article_id],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    for notebook in &previous.notebooks {
        if !metadata
            .notebooks
            .iter()
            .any(|current| current.id == notebook.id)
        {
            transaction
                .execute(
                    "DELETE FROM topology_collections WHERE id = ?1",
                    [&notebook.id],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn load_library_metadata_from_connection(
    connection: &Connection,
) -> Result<LibraryMetadata, String> {
    let mut articles = BTreeMap::new();
    {
        let mut statement = connection
            .prepare(
                "SELECT id, root_id, parent_id, title, summary, article_type, appearance_json, source_json, family, creation_method, content_json, anchor_json, generation_json, config_json, created_at, updated_at
                 FROM articles ORDER BY created_at, id",
            )
            .map_err(|error| error.to_string())?;
        let values = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, Option<String>>(12)?,
                    row.get::<_, Option<String>>(13)?,
                    row.get::<_, String>(14)?,
                    row.get::<_, String>(15)?,
                ))
            })
            .map_err(|error| error.to_string())?;
        for value in values {
            let (
                id,
                root_id,
                parent_id,
                title,
                summary,
                article_type,
                appearance,
                source,
                family,
                creation_method,
                content_json,
                anchor_json,
                generation_json,
                config_json,
                created_at,
                updated_at,
            ) = value.map_err(|error| error.to_string())?;
            let appearance = appearance
                .map(|json| serde_json::from_str(&json))
                .transpose()
                .map_err(|error| format!("文章 {id} 的外观数据已损坏：{error}"))?;
            let source = source
                .map(|json| serde_json::from_str(&json))
                .transpose()
                .map_err(|error| format!("文章 {id} 的来源数据已损坏：{error}"))?;
            let content_json = content_json
                .map(|json| serde_json::from_str(&json))
                .transpose()
                .map_err(|error| format!("文章 {id} 的结构化内容已损坏：{error}"))?;
            let anchor_json = anchor_json
                .map(|json| serde_json::from_str(&json))
                .transpose()
                .map_err(|error| format!("文章 {id} 的原文锚点已损坏：{error}"))?;
            let generation_json = generation_json
                .map(|json| serde_json::from_str(&json))
                .transpose()
                .map_err(|error| format!("文章 {id} 的生成信息已损坏：{error}"))?;
            let config_json = config_json
                .map(|json| serde_json::from_str(&json))
                .transpose()
                .map_err(|error| format!("文章 {id} 的节点配置已损坏：{error}"))?;
            articles.insert(
                id.clone(),
                LibraryArticle {
                    id,
                    root_id,
                    parent_id,
                    title,
                    summary,
                    article_type,
                    child_ids: Vec::new(),
                    created_at,
                    updated_at,
                    appearance,
                    source,
                    family,
                    creation_method,
                    content_json,
                    anchor_json,
                    generation_json,
                    config_json,
                },
            );
        }
    }
    {
        let mut statement = connection
            .prepare("SELECT parent_id, child_id FROM article_edges ORDER BY parent_id, position")
            .map_err(|error| error.to_string())?;
        let edges = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| error.to_string())?;
        for edge in edges {
            let (parent_id, child_id) = edge.map_err(|error| error.to_string())?;
            articles
                .get_mut(&parent_id)
                .ok_or_else(|| format!("文章关系引用了不存在的父文章 {parent_id}"))?
                .child_ids
                .push(child_id);
        }
    }

    let mut notebooks = {
        let mut statement = connection
            .prepare(
                "SELECT id, root_id, title, summary, description, color, icon, updated_at, last_opened_node_id, accent
                 FROM notebooks ORDER BY updated_at DESC, id",
            )
            .map_err(|error| error.to_string())?;
        let values = statement
            .query_map([], |row| {
                Ok(LibraryNotebook {
                    id: row.get(0)?,
                    root_id: row.get(1)?,
                    root_ids: Vec::new(),
                    title: row.get(2)?,
                    summary: row.get(3)?,
                    description: row.get(4)?,
                    color: row.get(5)?,
                    icon: row.get(6)?,
                    updated_at: row.get(7)?,
                    last_opened_node_id: row.get(8)?,
                    accent: row.get(9)?,
                })
            })
            .map_err(|error| error.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| error.to_string())?;
        values
    };
    let mut roots = BTreeMap::<String, Vec<String>>::new();
    {
        let mut statement = connection
            .prepare(
                "SELECT notebook_id, article_id FROM notebook_roots ORDER BY notebook_id, position",
            )
            .map_err(|error| error.to_string())?;
        let values = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| error.to_string())?;
        for value in values {
            let (notebook_id, article_id) = value.map_err(|error| error.to_string())?;
            roots.entry(notebook_id).or_default().push(article_id);
        }
    }
    for notebook in &mut notebooks {
        notebook.root_ids = roots
            .remove(&notebook.id)
            .unwrap_or_else(|| vec![notebook.root_id.clone()]);
    }
    Ok(LibraryMetadata {
        notebooks,
        articles,
    })
}

impl TopologyStore {
    pub fn open(database_path: PathBuf) -> Result<Self, String> {
        let parent = database_path
            .parent()
            .ok_or_else(|| "资料库数据库路径无效".to_string())?;
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        let mut connection = Connection::open(database_path).map_err(|error| error.to_string())?;
        initialize_database(&mut connection)?;
        // 旧版 schema 6 工作区可能已有文章但尚无投影；启动时从元数据补齐。
        let metadata = load_library_metadata_from_connection(&connection)?;
        replace_library_metadata_on_connection(&mut connection, &metadata, true)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub(crate) fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.connection
            .lock()
            .map_err(|_| "拓扑数据库锁已损坏".to_string())
    }

    pub fn load_library_metadata(&self) -> Result<LibraryMetadata, String> {
        let connection = self.connection()?;
        load_library_metadata_from_connection(&connection)
    }

    pub fn replace_library_metadata(&self, metadata: LibraryMetadata) -> Result<(), String> {
        let mut connection = self.connection()?;
        replace_library_metadata_on_connection(&mut connection, &metadata, false)
    }

    pub fn load_node_type_definitions(&self) -> Result<Vec<serde_json::Value>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare("SELECT config_json FROM node_type_definitions ORDER BY position, id")
            .map_err(|error| error.to_string())?;
        let definitions = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .map(|value| {
                let json = value.map_err(|error| error.to_string())?;
                serde_json::from_str(&json).map_err(|error| format!("拓扑节点配置已损坏：{error}"))
            })
            .collect();
        definitions
    }

    pub fn replace_node_type_definitions(
        &self,
        definitions: Vec<serde_json::Value>,
    ) -> Result<(), String> {
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        transaction
            .execute("DELETE FROM node_type_definitions", [])
            .map_err(|error| error.to_string())?;
        let mut ids = HashSet::new();
        for (position, definition) in definitions.into_iter().enumerate() {
            let id = definition
                .get("id")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| "拓扑节点配置缺少 id".to_string())?;
            validate_id("拓扑节点类型标识", id)?;
            if !ids.insert(id.to_string()) {
                return Err(format!("拓扑节点配置包含重复标识 {id}"));
            }
            let config_json =
                serde_json::to_string(&definition).map_err(|error| error.to_string())?;
            if config_json.len() > MAX_JSON_LENGTH {
                return Err("拓扑节点配置超过 1 MiB 限制".to_string());
            }
            transaction
                .execute(
                    "INSERT INTO node_type_definitions (id, config_json, position)
                     VALUES (?1, ?2, ?3)",
                    params![id, config_json, position as i64],
                )
                .map_err(|error| error.to_string())?;
        }
        transaction.commit().map_err(|error| error.to_string())
    }

    pub fn upsert_node(&self, request: UpsertTopologyNodeRequest) -> Result<TopologyNode, String> {
        validate_id("节点标识", &request.id)?;
        validate_id("集合标识", &request.collection_id)?;
        validate_text("节点标题", &request.title)?;
        validate_text("节点摘要", &request.summary)?;
        validate_json("节点互动状态", &request.interaction_state_json)?;
        validate_json("节点外观", &request.appearance_json)?;
        if let Some(content_json) = &request.content_json {
            validate_json("节点结构化内容", content_json)?;
        }
        if let Some(anchor_json) = &request.anchor_json {
            validate_json("节点原文锚点", anchor_json)?;
        }
        if let Some(generation_json) = &request.generation_json {
            validate_json("节点生成信息", generation_json)?;
        }
        if let Some(config_json) = &request.config_json {
            validate_json("节点配置", config_json)?;
        }
        if !matches!(request.family.as_str(), "笔记" | "记录" | "交互" | "") {
            return Err(format!("节点家族无效：{}", request.family));
        }
        if !matches!(
            request.creation_method.as_str(),
            "导入" | "AI" | "手动" | ""
        ) {
            return Err(format!("节点创建方式无效：{}", request.creation_method));
        }
        if let Some(content) = &request.content {
            validate_text("节点内容", content)?;
        }
        let content_mode = request.content_mode.trim();
        if content_mode != "database" {
            return Err("Markdown 节点由文章元数据派生，不能独立写入".to_string());
        }
        if request.document_id.is_some() {
            return Err("数据库节点不能关联 Markdown 文档".to_string());
        }

        let connection = self.connection()?;
        connection
            .execute(
                "INSERT OR IGNORE INTO topology_collections (id, title) VALUES (?1, ?1)",
                params![request.collection_id],
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute(
                r#"INSERT INTO topology_nodes (
                     id, collection_id, node_type, title, summary, content_mode, content,
                     document_id, is_root, is_manual, enabled, interactive, interaction_state_json,
                     appearance_json, family, creation_method, content_json, anchor_json,
                     generation_json, config_json
                   ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
                   ON CONFLICT(id) DO UPDATE SET
                     collection_id = excluded.collection_id,
                     node_type = excluded.node_type,
                     title = excluded.title,
                     summary = excluded.summary,
                     content_mode = excluded.content_mode,
                     content = excluded.content,
                     document_id = excluded.document_id,
                     is_root = excluded.is_root,
                     is_manual = excluded.is_manual,
                     enabled = excluded.enabled,
                     interactive = excluded.interactive,
                     interaction_state_json = excluded.interaction_state_json,
                     appearance_json = excluded.appearance_json,
                     family = excluded.family,
                     creation_method = excluded.creation_method,
                     content_json = excluded.content_json,
                     anchor_json = excluded.anchor_json,
                     generation_json = excluded.generation_json,
                     config_json = excluded.config_json,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"#,
                params![
                    request.id,
                    request.collection_id,
                    request.node_type,
                    request.title,
                    request.summary,
                    content_mode,
                    request.content,
                    request.document_id,
                    request.is_root,
                    request.is_manual,
                    request.enabled,
                    request.interactive,
                    request.interaction_state_json,
                    request.appearance_json,
                    request.family,
                    request.creation_method,
                    request.content_json,
                    request.anchor_json,
                    request.generation_json,
                    request.config_json,
                ],
            )
            .map_err(|error| error.to_string())?;
        connection
            .query_row(
                "SELECT id, collection_id, node_type, title, summary, content_mode, content, document_id, is_root, is_manual, enabled, interactive, interaction_state_json, appearance_json, family, creation_method, content_json, anchor_json, generation_json, config_json, created_at, updated_at FROM topology_nodes WHERE id = ?1",
                params![request.id],
                map_node,
            )
            .map_err(|error| error.to_string())
    }

    pub fn delete_node(&self, node_id: &str) -> Result<bool, String> {
        validate_id("节点标识", node_id)?;
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "DELETE FROM topology_relations WHERE source_node_id = ?1 OR target_node_id = ?1",
                params![node_id],
            )
            .map_err(|error| error.to_string())?;
        let deleted = transaction
            .execute("DELETE FROM topology_nodes WHERE id = ?1", params![node_id])
            .map_err(|error| error.to_string())?
            > 0;
        transaction.commit().map_err(|error| error.to_string())?;
        Ok(deleted)
    }

    pub fn upsert_relation(
        &self,
        request: UpsertTopologyRelationRequest,
    ) -> Result<TopologyRelation, String> {
        validate_id("关系标识", &request.id)?;
        validate_id("集合标识", &request.collection_id)?;
        validate_id("来源节点标识", &request.source_node_id)?;
        validate_id("目标节点标识", &request.target_node_id)?;
        if request.source_node_id == request.target_node_id {
            return Err("拓扑关系不能指向节点自身".to_string());
        }
        validate_json("关系元数据", &request.metadata_json)?;
        let connection = self.connection()?;
        for endpoint in [&request.source_node_id, &request.target_node_id] {
            let endpoint_collection = connection
                .query_row(
                    "SELECT collection_id FROM topology_nodes WHERE id = ?1",
                    params![endpoint],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(|error| error.to_string())?;
            if endpoint_collection
                .as_deref()
                .is_some_and(|id| id != request.collection_id)
            {
                let shared_article: bool = connection
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM articles a JOIN notebook_roots nr
                     ON nr.article_id = a.root_id WHERE a.id = ?1 AND nr.notebook_id = ?2)",
                        params![endpoint, request.collection_id],
                        |row| row.get(0),
                    )
                    .map_err(|error| error.to_string())?;
                if !shared_article {
                    return Err("已持久化的关系端点必须位于同一集合".to_string());
                }
            }
        }
        connection
            .execute(
                "INSERT OR IGNORE INTO topology_collections (id, title) VALUES (?1, ?1)",
                params![request.collection_id],
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute(
                r#"INSERT INTO topology_relations (
                     id, collection_id, source_node_id, target_node_id, relation_type, label, directed, metadata_json
                   ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                   ON CONFLICT(id) DO UPDATE SET
                     collection_id = excluded.collection_id,
                     source_node_id = excluded.source_node_id,
                     target_node_id = excluded.target_node_id,
                     relation_type = excluded.relation_type,
                     label = excluded.label,
                     directed = excluded.directed,
                     metadata_json = excluded.metadata_json,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"#,
                params![
                    request.id,
                    request.collection_id,
                    request.source_node_id,
                    request.target_node_id,
                    request.relation_type,
                    request.label,
                    request.directed,
                    request.metadata_json,
                ],
            )
            .map_err(|error| error.to_string())?;
        connection
            .query_row(
                "SELECT id, collection_id, source_node_id, target_node_id, relation_type, label, directed, metadata_json, created_at, updated_at FROM topology_relations WHERE id = ?1",
                params![request.id],
                map_relation,
            )
            .map_err(|error| error.to_string())
    }

    pub fn delete_relation(&self, relation_id: &str) -> Result<bool, String> {
        validate_id("关系标识", relation_id)?;
        self.connection()?
            .execute(
                "DELETE FROM topology_relations WHERE id = ?1",
                params![relation_id],
            )
            .map(|count| count > 0)
            .map_err(|error| error.to_string())
    }

    pub fn upsert_interaction(
        &self,
        request: UpsertTopologyInteractionRequest,
    ) -> Result<TopologyInteraction, String> {
        validate_id("互动标识", &request.id)?;
        validate_id("节点标识", &request.node_id)?;
        validate_json("互动配置", &request.config_json)?;
        validate_json("互动状态", &request.state_json)?;
        let connection = self.connection()?;
        connection
            .execute(
                r#"INSERT INTO topology_interactions (
                     id, node_id, interaction_type, title, config_json, state_json, enabled
                   ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                   ON CONFLICT(id) DO UPDATE SET
                     node_id = excluded.node_id,
                     interaction_type = excluded.interaction_type,
                     title = excluded.title,
                     config_json = excluded.config_json,
                     state_json = excluded.state_json,
                     enabled = excluded.enabled,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"#,
                params![
                    request.id,
                    request.node_id,
                    request.interaction_type,
                    request.title,
                    request.config_json,
                    request.state_json,
                    request.enabled,
                ],
            )
            .map_err(|error| error.to_string())?;
        connection
            .query_row(
                "SELECT id, node_id, interaction_type, title, config_json, state_json, enabled, created_at, updated_at FROM topology_interactions WHERE id = ?1",
                params![request.id],
                map_interaction,
            )
            .map_err(|error| error.to_string())
    }

    pub fn load_graph(&self, collection_id: &str) -> Result<TopologyGraph, String> {
        validate_id("集合标识", collection_id)?;
        let connection = self.connection()?;
        let collection = connection
            .query_row(
                "SELECT id, title, description, created_at, updated_at FROM topology_collections WHERE id = ?1",
                [collection_id], map_collection,
            )
            .optional()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "集合不存在".to_string())?;
        let nodes = {
            let mut statement = connection.prepare(
                "SELECT n.id, n.collection_id, n.node_type, n.title, n.summary, n.content_mode,
                   n.content, n.document_id, n.is_root, n.is_manual, n.enabled, n.interactive,
                   n.interaction_state_json, n.appearance_json, n.family, n.creation_method,
                   n.content_json, n.anchor_json, n.generation_json, n.config_json, n.created_at, n.updated_at
                 FROM topology_nodes n
                 WHERE (n.content_mode = 'database' AND n.collection_id = ?1)
                    OR (n.content_mode = 'markdown' AND EXISTS (
                      SELECT 1 FROM articles a JOIN notebook_roots nr ON nr.article_id = a.root_id
                      WHERE a.id = n.id AND nr.notebook_id = ?1))
                 ORDER BY n.is_root DESC, n.created_at, n.id"
            ).map_err(|error| error.to_string())?;
            let values = statement
                .query_map([collection_id], |row| {
                    let mut node = map_node(row)?;
                    node.collection_id = collection_id.to_string();
                    Ok(node)
                })
                .map_err(|error| error.to_string())?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|error| error.to_string())?;
            values
        };
        let node_ids = nodes
            .iter()
            .map(|node| node.id.as_str())
            .collect::<HashSet<_>>();
        let mut relations = {
            let mut statement = connection.prepare(
                "SELECT id, collection_id, source_node_id, target_node_id, relation_type, label,
                   directed, metadata_json, created_at, updated_at FROM topology_relations
                 WHERE collection_id = ?1 ORDER BY created_at, id"
            ).map_err(|error| error.to_string())?;
            let values = statement
                .query_map([collection_id], map_relation)
                .map_err(|error| error.to_string())?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|error| error.to_string())?;
            values
                .into_iter()
                .filter(|relation| {
                    node_ids.contains(relation.source_node_id.as_str())
                        && node_ids.contains(relation.target_node_id.as_str())
                })
                .collect::<Vec<_>>()
        };
        {
            let mut statement = connection.prepare(
                "SELECT e.parent_id, e.child_id, child.article_type, parent.created_at, parent.updated_at
                 FROM article_edges e JOIN articles parent ON parent.id = e.parent_id
                 JOIN articles child ON child.id = e.child_id
                 JOIN notebook_roots nr ON nr.article_id = parent.root_id
                 WHERE nr.notebook_id = ?1 ORDER BY parent.created_at, e.parent_id, e.position"
            ).map_err(|error| error.to_string())?;
            let edges = statement
                .query_map([collection_id], |row| {
                    let source_node_id: String = row.get(0)?;
                    let target_node_id: String = row.get(1)?;
                    Ok(TopologyRelation {
                        id: format!("tree:{source_node_id}:{target_node_id}"),
                        collection_id: collection_id.to_string(),
                        source_node_id,
                        target_node_id,
                        relation_type: "contains".into(),
                        label: row.get(2)?,
                        directed: true,
                        metadata_json: "{\"source\":\"markdown-tree\"}".into(),
                        created_at: row.get(3)?,
                        updated_at: row.get(4)?,
                    })
                })
                .map_err(|error| error.to_string())?;
            for edge in edges {
                relations.push(edge.map_err(|error| error.to_string())?);
            }
        }
        relations.sort_by(|left, right| {
            left.created_at
                .cmp(&right.created_at)
                .then_with(|| left.id.cmp(&right.id))
        });
        let interactions = {
            let mut statement = connection.prepare(
                "SELECT i.id, i.node_id, i.interaction_type, i.title, i.config_json, i.state_json,
                   i.enabled, i.created_at, i.updated_at
                 FROM topology_interactions i JOIN topology_nodes n ON n.id = i.node_id
                 WHERE (n.content_mode = 'database' AND n.collection_id = ?1)
                    OR (n.content_mode = 'markdown' AND EXISTS (
                      SELECT 1 FROM articles a JOIN notebook_roots nr ON nr.article_id = a.root_id
                      WHERE a.id = i.node_id AND nr.notebook_id = ?1))
                 ORDER BY i.created_at, i.id"
            ).map_err(|error| error.to_string())?;
            let values = statement
                .query_map([collection_id], map_interaction)
                .map_err(|error| error.to_string())?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|error| error.to_string())?;
            values
        };
        Ok(TopologyGraph {
            collection,
            nodes,
            relations,
            interactions,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("annota-topology-{}", uuid::Uuid::new_v4()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn test_store() -> TopologyStore {
        let mut connection = Connection::open_in_memory().expect("open in-memory sqlite");
        initialize_database(&mut connection).expect("initialize topology schema");
        TopologyStore {
            connection: Mutex::new(connection),
        }
    }

    fn create_test_collection(store: &TopologyStore) {
        store
            .connection()
            .unwrap()
            .execute(
                "INSERT INTO topology_collections (id, title) VALUES ('collection-1', '集合')",
                [],
            )
            .unwrap();
    }

    fn sample_library(title: &str) -> LibraryMetadata {
        let root = LibraryArticle {
            id: "root-1".into(),
            root_id: "root-1".into(),
            parent_id: None,
            title: title.into(),
            summary: "根摘要".into(),
            article_type: "根节点".into(),
            child_ids: vec!["child-1".into()],
            created_at: "2026-08-31T00:00:00Z".into(),
            updated_at: "2026-08-31T00:00:00Z".into(),
            appearance: Some(serde_json::json!({"color": "#123456"})),
            source: None,
            family: "笔记".into(),
            creation_method: "导入".into(),
            content_json: None,
            anchor_json: None,
            generation_json: None,
            config_json: None,
        };
        let child = LibraryArticle {
            id: "child-1".into(),
            root_id: "root-1".into(),
            parent_id: Some("root-1".into()),
            title: "子文章".into(),
            summary: String::new(),
            article_type: "解释".into(),
            child_ids: Vec::new(),
            created_at: "2026-08-31T00:00:01Z".into(),
            updated_at: "2026-08-31T00:00:01Z".into(),
            appearance: None,
            source: Some(serde_json::json!({"parentId": "root-1"})),
            family: "记录".into(),
            creation_method: "AI".into(),
            content_json: None,
            anchor_json: None,
            generation_json: None,
            config_json: None,
        };
        LibraryMetadata {
            notebooks: vec![LibraryNotebook {
                id: "notebook-1".into(),
                root_id: "root-1".into(),
                root_ids: vec!["root-1".into()],
                title: title.into(),
                summary: "资料库摘要".into(),
                description: "资料库描述".into(),
                color: "#315fdb".into(),
                icon: "library".into(),
                updated_at: "2026-08-31T00:00:01Z".into(),
                last_opened_node_id: "child-1".into(),
                accent: "cobalt".into(),
            }],
            articles: BTreeMap::from([("root-1".into(), root), ("child-1".into(), child)]),
        }
    }

    #[test]
    fn replaces_and_loads_library_metadata_transactionally() {
        let store = test_store();
        let metadata = sample_library("知识库");
        store.replace_library_metadata(metadata.clone()).unwrap();
        assert_eq!(store.load_library_metadata().unwrap(), metadata);
    }

    #[test]
    fn opening_existing_articles_restores_missing_topology_projection() {
        let directory = TestDirectory::new();
        let path = directory.0.join("library.sqlite3");
        let store = TopologyStore::open(path.clone()).unwrap();
        store
            .replace_library_metadata(sample_library("已有资料库"))
            .unwrap();
        store
            .connection()
            .unwrap()
            .execute("DELETE FROM topology_collections", [])
            .unwrap();
        drop(store);

        let reopened = TopologyStore::open(path).unwrap();
        let graph = reopened.load_graph("notebook-1").unwrap();
        assert_eq!(graph.collection.title, "已有资料库");
        assert_eq!(graph.nodes.len(), 2);
        assert!(graph
            .relations
            .iter()
            .any(|relation| relation.id == "tree:root-1:child-1"));
    }

    #[test]
    fn identical_snapshot_does_not_rewrite_metadata_or_topology() {
        let store = test_store();
        let mut metadata = sample_library("知识库");
        store.replace_library_metadata(metadata.clone()).unwrap();
        let changes = store.connection().unwrap().total_changes();
        store.replace_library_metadata(metadata.clone()).unwrap();
        assert_eq!(store.connection().unwrap().total_changes(), changes);

        metadata.notebooks[0].last_opened_node_id = "root-1".into();
        store.replace_library_metadata(metadata).unwrap();
        assert_eq!(store.connection().unwrap().total_changes(), changes + 1);
    }

    #[test]
    fn shared_articles_appear_in_each_collection_and_accept_manual_relations() {
        let store = test_store();
        let mut metadata = sample_library("知识库");
        let mut second = metadata.notebooks[0].clone();
        second.id = "notebook-2".into();
        second.title = "第二集合".into();
        metadata.notebooks.push(second);
        store.replace_library_metadata(metadata.clone()).unwrap();
        let graph = store.load_graph("notebook-2").unwrap();
        assert_eq!(graph.collection.title, "第二集合");
        assert_eq!(
            graph
                .nodes
                .iter()
                .filter(|node| node.content_mode == "markdown")
                .count(),
            2
        );
        assert!(graph
            .relations
            .iter()
            .any(|relation| relation.id == "tree:root-1:child-1"));

        store
            .upsert_relation(UpsertTopologyRelationRequest {
                id: "manual-link".into(),
                collection_id: "notebook-2".into(),
                source_node_id: "root-1".into(),
                target_node_id: "child-1".into(),
                relation_type: "related".into(),
                label: "补充".into(),
                directed: false,
                metadata_json: "{}".into(),
            })
            .unwrap();
        assert!(store
            .load_graph("notebook-2")
            .unwrap()
            .relations
            .iter()
            .any(|relation| relation.id == "manual-link"));

        metadata
            .articles
            .get_mut("root-1")
            .unwrap()
            .child_ids
            .clear();
        metadata.articles.remove("child-1");
        for notebook in &mut metadata.notebooks {
            notebook.last_opened_node_id = "root-1".into();
        }
        store.replace_library_metadata(metadata).unwrap();
        let graph = store.load_graph("notebook-2").unwrap();
        assert_eq!(
            graph
                .nodes
                .iter()
                .filter(|node| node.content_mode == "markdown")
                .count(),
            1
        );
        assert!(graph.relations.is_empty());
    }

    #[test]
    fn invalid_replacement_does_not_overwrite_existing_library() {
        let store = test_store();
        let metadata = sample_library("保留的数据");
        store.replace_library_metadata(metadata.clone()).unwrap();
        let mut invalid = sample_library("不应写入");
        invalid
            .articles
            .get_mut("root-1")
            .unwrap()
            .child_ids
            .push("missing".into());
        assert!(store.replace_library_metadata(invalid).is_err());
        assert_eq!(store.load_library_metadata().unwrap(), metadata);
    }

    #[test]
    fn creates_only_the_current_database_schema() {
        let mut connection = Connection::open_in_memory().unwrap();
        initialize_database(&mut connection).unwrap();

        assert_eq!(
            connection
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            DATABASE_VERSION
        );

        for table in [
            "topology_collections",
            "topology_nodes",
            "topology_relations",
            "topology_interactions",
            "documents",
            "articles",
            "article_edges",
            "notebooks",
            "notebook_roots",
            "pending_file_ops",
            "node_type_definitions",
        ] {
            let exists: bool = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(exists, "current schema is missing {table}");
        }

        let has_migration_history: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'migration_history')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!has_migration_history);

        connection
            .pragma_update(None, "user_version", DATABASE_VERSION - 1)
            .unwrap();
        let error = initialize_database(&mut connection).unwrap_err();
        assert!(error.contains("不再支持数据库版本"));
    }

    #[test]
    fn stores_multiple_roots_manual_content_relations_and_interactions() {
        let store = test_store();
        create_test_collection(&store);
        for id in ["root-a", "root-b"] {
            store
                .upsert_node(UpsertTopologyNodeRequest {
                    id: id.into(),
                    collection_id: "collection-1".into(),
                    node_type: "note".into(),
                    title: id.into(),
                    summary: String::new(),
                    content_mode: "database".into(),
                    content: Some("手动内容".into()),
                    document_id: None,
                    is_root: true,
                    is_manual: true,
                    enabled: true,
                    interactive: true,
                    interaction_state_json: "{}".into(),
                    appearance_json: "{}".into(),
                    family: "笔记".into(),
                    creation_method: "手动".into(),
                    content_json: None,
                    anchor_json: None,
                    generation_json: None,
                    config_json: None,
                })
                .unwrap();
        }
        store
            .upsert_relation(UpsertTopologyRelationRequest {
                id: "relation-1".into(),
                collection_id: "collection-1".into(),
                source_node_id: "root-a".into(),
                target_node_id: "root-b".into(),
                relation_type: "related".into(),
                label: "关联".into(),
                directed: false,
                metadata_json: "{}".into(),
            })
            .unwrap();
        store
            .upsert_interaction(UpsertTopologyInteractionRequest {
                id: "interaction-1".into(),
                node_id: "root-a".into(),
                interaction_type: "checklist".into(),
                title: "检查项".into(),
                config_json: "{}".into(),
                state_json: r#"{"checked":false}"#.into(),
                enabled: true,
            })
            .unwrap();
        let graph = store.load_graph("collection-1").unwrap();
        assert_eq!(graph.nodes.iter().filter(|node| node.is_root).count(), 2);
        assert_eq!(graph.relations.len(), 1);
        assert_eq!(graph.interactions.len(), 1);
    }

    #[test]
    fn rejects_manual_markdown_nodes() {
        let store = test_store();
        create_test_collection(&store);
        let error = store
            .upsert_node(UpsertTopologyNodeRequest {
                id: "node-1".into(),
                collection_id: "collection-1".into(),
                node_type: "note".into(),
                title: "手动笔记".into(),
                summary: String::new(),
                content_mode: "markdown".into(),
                content: None,
                document_id: Some("doc-1".into()),
                is_root: false,
                is_manual: true,
                enabled: true,
                interactive: false,
                interaction_state_json: "{}".into(),
                appearance_json: "{}".into(),
                family: "笔记".into(),
                creation_method: "手动".into(),
                content_json: None,
                anchor_json: None,
                generation_json: None,
                config_json: None,
            })
            .unwrap_err();
        assert!(error.contains("文章元数据"));
    }

    #[test]
    fn persists_node_level_config_across_replace_and_upsert() {
        let store = test_store();
        let mut metadata = sample_library("带节点配置");
        metadata.articles.get_mut("child-1").unwrap().config_json = Some(serde_json::json!({
                "modelBindingId": "gpt-4o",
                "systemPrompt": "用中文解释",
                "displayFields": ["title", "content"]
        }));
        store.replace_library_metadata(metadata.clone()).unwrap();
        let loaded = store.load_library_metadata().unwrap();
        assert_eq!(
            loaded.articles["child-1"].config_json, metadata.articles["child-1"].config_json,
            "replace/load 应完整保留 config_json"
        );

        create_test_collection(&store);
        let mut request = UpsertTopologyNodeRequest {
            id: "node-1".into(),
            collection_id: "collection-1".into(),
            node_type: "explain".into(),
            title: "解释".into(),
            summary: String::new(),
            content_mode: "database".into(),
            content: Some("内容".into()),
            document_id: None,
            is_root: false,
            is_manual: true,
            enabled: true,
            interactive: false,
            interaction_state_json: "{}".into(),
            appearance_json: "{}".into(),
            family: "记录".into(),
            creation_method: "手动".into(),
            content_json: None,
            anchor_json: None,
            generation_json: None,
            config_json: None,
        };
        store.upsert_node(request.clone()).unwrap();
        request.config_json = Some(
            serde_json::json!({"modelParameters": {"temperature": 0.2, "topP": 0.9, "maxTokens": 512}})
                .to_string(),
        );
        let updated = store.upsert_node(request.clone()).unwrap();
        assert_eq!(updated.config_json, request.config_json);
        let reloaded = store.load_graph("collection-1").unwrap();
        assert_eq!(reloaded.nodes[0].config_json, request.config_json);
    }
}
