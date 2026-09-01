use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryLoadResult {
    pub metadata: LibraryMetadata,
    pub imported_legacy: bool,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertTopologyCollectionRequest {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncMarkdownTopologyRequest {
    pub collection: UpsertTopologyCollectionRequest,
    #[serde(default)]
    pub nodes: Vec<UpsertTopologyNodeRequest>,
    #[serde(default)]
    pub relations: Vec<UpsertTopologyRelationRequest>,
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

fn migrate(connection: &mut Connection) -> Result<(), String> {
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| error.to_string())?;
    let mut version = connection
        .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
        .map_err(|error| error.to_string())?;
    if version > DATABASE_VERSION {
        return Err(format!(
            "拓扑数据库版本 {version} 高于当前支持版本 {DATABASE_VERSION}"
        ));
    }
    if version == 0 {
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        migrate_v1(&transaction)?;
        transaction
            .pragma_update(None, "user_version", 1)
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        version = 1;
    }
    if version < 2 {
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        migrate_v2(&transaction)?;
        transaction
            .pragma_update(None, "user_version", 2)
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        version = 2;
    }
    if version < 3 {
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        migrate_v3(&transaction)?;
        transaction
            .pragma_update(None, "user_version", 3)
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        version = 3;
    }
    if version < 4 {
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        migrate_v4(&transaction)?;
        transaction
            .pragma_update(None, "user_version", 4)
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        version = 4;
    }
    if version < 5 {
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        migrate_v5(&transaction)?;
        transaction
            .pragma_update(None, "user_version", 5)
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        version = 5;
    }
    if version < 6 {
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        migrate_v6(&transaction)?;
        transaction
            .pragma_update(None, "user_version", 6)
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        version = 6;
    }
    Ok(())
}

fn migrate_v1(transaction: &Transaction<'_>) -> Result<(), String> {
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
            "#,
        )
        .map_err(|error| error.to_string())
}

fn migrate_v2(transaction: &Transaction<'_>) -> Result<(), String> {
    transaction
        .execute_batch(
            r#"
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
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX articles_root_idx ON articles(root_id, updated_at DESC, id);
            CREATE INDEX articles_parent_idx ON articles(parent_id, updated_at DESC, id);

            CREATE TABLE article_edges (
                parent_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                child_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                position INTEGER NOT NULL CHECK (position >= 0),
                PRIMARY KEY (parent_id, child_id),
                UNIQUE (parent_id, position),
                CHECK (parent_id <> child_id)
            );

            CREATE TABLE notebooks (
                id TEXT PRIMARY KEY NOT NULL,
                root_id TEXT NOT NULL REFERENCES articles(id) DEFERRABLE INITIALLY DEFERRED,
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
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
            "#,
        )
        .map_err(|error| error.to_string())
}

fn migrate_v3(transaction: &Transaction<'_>) -> Result<(), String> {
    transaction
        .execute_batch(
            r#"
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

            CREATE TABLE migration_history (
                version INTEGER PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            INSERT INTO migration_history (version, name)
            VALUES (3, 'transaction-journal-and-pending-file-ops');
            "#,
        )
        .map_err(|error| error.to_string())
}

fn migrate_v4(transaction: &Transaction<'_>) -> Result<(), String> {
    transaction
        .execute_batch(
            r#"
            ALTER TABLE articles ADD COLUMN family TEXT NOT NULL DEFAULT '笔记';
            ALTER TABLE articles ADD COLUMN creation_method TEXT NOT NULL DEFAULT '手动';
            ALTER TABLE articles ADD COLUMN content_json TEXT;
            ALTER TABLE articles ADD COLUMN anchor_json TEXT;
            ALTER TABLE articles ADD COLUMN generation_json TEXT;

            ALTER TABLE topology_nodes ADD COLUMN family TEXT NOT NULL DEFAULT '笔记';
            ALTER TABLE topology_nodes ADD COLUMN creation_method TEXT NOT NULL DEFAULT '手动';
            ALTER TABLE topology_nodes ADD COLUMN content_json TEXT;
            ALTER TABLE topology_nodes ADD COLUMN anchor_json TEXT;
            ALTER TABLE topology_nodes ADD COLUMN generation_json TEXT;

            ALTER TABLE article_edges ADD COLUMN relation_type TEXT NOT NULL DEFAULT '派生';

            INSERT INTO migration_history (version, name)
            VALUES (4, 'node-content-contract-fields');
            "#,
        )
        .map_err(|error| error.to_string())
}

fn migrate_v5(transaction: &Transaction<'_>) -> Result<(), String> {
    transaction
        .execute_batch(
            r#"
            ALTER TABLE notebooks ADD COLUMN description TEXT NOT NULL DEFAULT '';
            ALTER TABLE notebooks ADD COLUMN color TEXT NOT NULL DEFAULT '#315fdb';
            ALTER TABLE notebooks ADD COLUMN icon TEXT NOT NULL DEFAULT 'library';

            CREATE TABLE node_type_definitions (
                id TEXT PRIMARY KEY NOT NULL,
                config_json TEXT NOT NULL,
                position INTEGER NOT NULL CHECK (position >= 0),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            INSERT INTO migration_history (version, name)
            VALUES (5, 'collections-and-node-type-definitions');
            "#,
        )
        .map_err(|error| error.to_string())
}

fn migrate_v6(transaction: &Transaction<'_>) -> Result<(), String> {
    transaction
        .execute_batch(
            r#"
            ALTER TABLE articles ADD COLUMN config_json TEXT;
            ALTER TABLE topology_nodes ADD COLUMN config_json TEXT;

            INSERT INTO migration_history (version, name)
            VALUES (6, 'node-level-config');
            "#,
        )
        .map_err(|error| error.to_string())
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
            return Err(format!("文章 {} 的家族无效：{}", article.id, article.family));
        }
        if !matches!(
            article.creation_method.as_str(),
            "导入" | "AI" | "手动"
        ) {
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
                validate_json(label, &value.to_string())?;
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
) -> Result<(), String> {
    validate_library_metadata(metadata)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .pragma_update(None, "defer_foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    transaction
        .execute_batch(
            "DELETE FROM notebook_roots;
             DELETE FROM article_edges;
             DELETE FROM notebooks;
             DELETE FROM articles;",
        )
        .map_err(|error| error.to_string())?;

    for article in metadata.articles.values() {
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
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
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
        transaction
            .execute(
                "INSERT INTO notebooks (id, root_id, title, summary, description, color, icon, updated_at, last_opened_node_id, accent)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
        for (position, root_id) in roots.iter().enumerate() {
            transaction
                .execute(
                    "INSERT INTO notebook_roots (notebook_id, article_id, position) VALUES (?1, ?2, ?3)",
                    params![notebook.id, root_id, position as i64],
                )
                .map_err(|error| error.to_string())?;
        }
    }

    for article in metadata.articles.values() {
        for (position, child_id) in article.child_ids.iter().enumerate() {
            transaction
                .execute(
                    "INSERT INTO article_edges (parent_id, child_id, position) VALUES (?1, ?2, ?3)",
                    params![article.id, child_id, position as i64],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    transaction.commit().map_err(|error| error.to_string())
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
        migrate(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub(crate) fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.connection
            .lock()
            .map_err(|_| "拓扑数据库锁已损坏".to_string())
    }

    pub fn load_library_metadata(
        &self,
        legacy: Option<LibraryMetadata>,
    ) -> Result<LibraryLoadResult, String> {
        let mut connection = self.connection()?;
        let contains_metadata = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM notebooks) OR EXISTS(SELECT 1 FROM articles)",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|error| error.to_string())?
            != 0;
        let imported_legacy = if !contains_metadata {
            match legacy {
                Some(metadata)
                    if !metadata.notebooks.is_empty() || !metadata.articles.is_empty() =>
                {
                    replace_library_metadata_on_connection(&mut connection, &metadata)?;
                    true
                }
                _ => false,
            }
        } else {
            false
        };
        Ok(LibraryLoadResult {
            metadata: load_library_metadata_from_connection(&connection)?,
            imported_legacy,
        })
    }

    pub fn replace_library_metadata(&self, metadata: LibraryMetadata) -> Result<(), String> {
        let mut connection = self.connection()?;
        replace_library_metadata_on_connection(&mut connection, &metadata)
    }

    pub fn load_node_type_definitions(&self) -> Result<Vec<serde_json::Value>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT config_json FROM node_type_definitions ORDER BY position, id",
            )
            .map_err(|error| error.to_string())?;
        let definitions = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .map(|value| {
                let json = value.map_err(|error| error.to_string())?;
                serde_json::from_str(&json)
                    .map_err(|error| format!("拓扑节点配置已损坏：{error}"))
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
            let config_json = serde_json::to_string(&definition)
                .map_err(|error| error.to_string())?;
            validate_json("拓扑节点配置", &config_json)?;
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

    pub fn list_collections(&self) -> Result<Vec<TopologyCollection>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare("SELECT id, title, description, created_at, updated_at FROM topology_collections ORDER BY updated_at DESC, id")
            .map_err(|error| error.to_string())?;
        let collections = statement
            .query_map([], map_collection)
            .map_err(|error| error.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| error.to_string())?;
        Ok(collections)
    }

    pub fn upsert_collection(
        &self,
        request: UpsertTopologyCollectionRequest,
    ) -> Result<TopologyCollection, String> {
        validate_id("集合标识", &request.id)?;
        validate_text("集合标题", &request.title)?;
        validate_text("集合说明", &request.description)?;
        let connection = self.connection()?;
        connection
            .execute(
                r#"INSERT INTO topology_collections (id, title, description)
                   VALUES (?1, ?2, ?3)
                   ON CONFLICT(id) DO UPDATE SET
                     title = excluded.title,
                     description = excluded.description,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"#,
                params![request.id, request.title, request.description],
            )
            .map_err(|error| error.to_string())?;
        connection
            .query_row(
                "SELECT id, title, description, created_at, updated_at FROM topology_collections WHERE id = ?1",
                params![request.id],
                map_collection,
            )
            .map_err(|error| error.to_string())
    }

    pub fn sync_markdown_topology(
        &self,
        request: SyncMarkdownTopologyRequest,
    ) -> Result<TopologyGraph, String> {
        validate_id("集合标识", &request.collection.id)?;
        validate_text("集合标题", &request.collection.title)?;
        validate_text("集合说明", &request.collection.description)?;

        let node_ids = request
            .nodes
            .iter()
            .map(|node| node.id.as_str())
            .collect::<HashSet<_>>();
        for node in &request.nodes {
            validate_id("节点标识", &node.id)?;
            validate_id("集合标识", &node.collection_id)?;
            validate_text("节点标题", &node.title)?;
            validate_text("节点摘要", &node.summary)?;
            validate_json("节点互动状态", &node.interaction_state_json)?;
            validate_json("节点外观", &node.appearance_json)?;
            if let Some(content_json) = &node.content_json {
                validate_json("节点结构化内容", content_json)?;
            }
            if let Some(anchor_json) = &node.anchor_json {
                validate_json("节点原文锚点", anchor_json)?;
            }
            if let Some(generation_json) = &node.generation_json {
                validate_json("节点生成信息", generation_json)?;
            }
            if let Some(config_json) = &node.config_json {
                validate_json("节点配置", config_json)?;
            }
            if !matches!(node.family.as_str(), "笔记" | "记录" | "交互" | "") {
                return Err(format!("节点家族无效：{}", node.family));
            }
            if !matches!(
                node.creation_method.as_str(),
                "导入" | "AI" | "手动" | ""
            ) {
                return Err(format!("节点创建方式无效：{}", node.creation_method));
            }
            if node.collection_id != request.collection.id {
                return Err("批量同步节点必须属于当前集合".to_string());
            }
            if node.content_mode != "markdown"
                || node.is_manual
                || node.content.is_some()
                || node
                    .document_id
                    .as_deref()
                    .map(str::trim)
                    .unwrap_or("")
                    .is_empty()
            {
                return Err("批量同步只接受文件关联的 Markdown 节点".to_string());
            }
        }
        for relation in &request.relations {
            validate_id("关系标识", &relation.id)?;
            validate_id("集合标识", &relation.collection_id)?;
            validate_id("来源节点标识", &relation.source_node_id)?;
            validate_id("目标节点标识", &relation.target_node_id)?;
            validate_json("关系元数据", &relation.metadata_json)?;
            if relation.collection_id != request.collection.id {
                return Err("批量同步关系必须属于当前集合".to_string());
            }
            if relation.source_node_id == relation.target_node_id {
                return Err("拓扑关系不能指向节点自身".to_string());
            }
            if !node_ids.contains(relation.source_node_id.as_str())
                || !node_ids.contains(relation.target_node_id.as_str())
            {
                return Err("批量同步关系必须连接本次同步的 Markdown 节点".to_string());
            }
        }

        let collection_id = request.collection.id.clone();
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                r#"INSERT INTO topology_collections (id, title, description)
                   VALUES (?1, ?2, ?3)
                   ON CONFLICT(id) DO UPDATE SET
                     title = excluded.title,
                     description = excluded.description,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"#,
                params![
                    &request.collection.id,
                    &request.collection.title,
                    &request.collection.description
                ],
            )
            .map_err(|error| error.to_string())?;
        {
            let mut statement = transaction
                .prepare(
                    r#"INSERT INTO topology_nodes (
                         id, collection_id, node_type, title, summary, content_mode, content,
                         document_id, is_root, is_manual, enabled, interactive,
                         interaction_state_json, appearance_json, family, creation_method,
                         content_json, anchor_json, generation_json, config_json
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
                )
                .map_err(|error| error.to_string())?;
            for node in &request.nodes {
                statement
                    .execute(params![
                        &node.id,
                        &node.collection_id,
                        &node.node_type,
                        &node.title,
                        &node.summary,
                        &node.content_mode,
                        &node.content,
                        &node.document_id,
                        node.is_root,
                        node.is_manual,
                        node.enabled,
                        node.interactive,
                        &node.interaction_state_json,
                        &node.appearance_json,
                        &node.family,
                        &node.creation_method,
                        &node.content_json,
                        &node.anchor_json,
                        &node.generation_json,
                        &node.config_json,
                    ])
                    .map_err(|error| error.to_string())?;
            }
        }
        {
            let mut statement = transaction
                .prepare(
                    r#"INSERT INTO topology_relations (
                         id, collection_id, source_node_id, target_node_id, relation_type,
                         label, directed, metadata_json
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
                )
                .map_err(|error| error.to_string())?;
            for relation in &request.relations {
                statement
                    .execute(params![
                        &relation.id,
                        &relation.collection_id,
                        &relation.source_node_id,
                        &relation.target_node_id,
                        &relation.relation_type,
                        &relation.label,
                        relation.directed,
                        &relation.metadata_json,
                    ])
                    .map_err(|error| error.to_string())?;
            }
        }
        transaction.commit().map_err(|error| error.to_string())?;
        drop(connection);
        self.load_graph(&collection_id)
    }

    pub fn delete_collection(&self, collection_id: &str) -> Result<bool, String> {
        validate_id("集合标识", collection_id)?;
        self.connection()?
            .execute(
                "DELETE FROM topology_collections WHERE id = ?1",
                params![collection_id],
            )
            .map(|count| count > 0)
            .map_err(|error| error.to_string())
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
        if content_mode != "markdown" && content_mode != "database" {
            return Err("节点内容模式只能是 markdown 或 database".to_string());
        }
        if request.is_manual && content_mode != "database" {
            return Err("手动节点内容必须存入 SQLite，不能关联 Markdown".to_string());
        }
        if content_mode == "markdown" {
            if request.content.is_some() {
                return Err("Markdown 节点正文不能写入 SQLite".to_string());
            }
            if request
                .document_id
                .as_deref()
                .map(str::trim)
                .unwrap_or("")
                .is_empty()
            {
                return Err("Markdown 节点必须关联文档标识".to_string());
            }
        } else if request.document_id.is_some() {
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
                return Err("已持久化的关系端点必须位于同一集合".to_string());
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

    pub fn delete_interaction(&self, interaction_id: &str) -> Result<bool, String> {
        validate_id("互动标识", interaction_id)?;
        self.connection()?
            .execute(
                "DELETE FROM topology_interactions WHERE id = ?1",
                params![interaction_id],
            )
            .map(|count| count > 0)
            .map_err(|error| error.to_string())
    }

    pub fn load_graph(&self, collection_id: &str) -> Result<TopologyGraph, String> {
        validate_id("集合标识", collection_id)?;
        let connection = self.connection()?;
        let collection = connection
            .query_row(
                "SELECT id, title, description, created_at, updated_at FROM topology_collections WHERE id = ?1",
                params![collection_id],
                map_collection,
            )
            .optional()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "集合不存在".to_string())?;
        let nodes = {
            let mut statement = connection
                .prepare("SELECT id, collection_id, node_type, title, summary, content_mode, content, document_id, is_root, is_manual, enabled, interactive, interaction_state_json, appearance_json, family, creation_method, content_json, anchor_json, generation_json, config_json, created_at, updated_at FROM topology_nodes WHERE collection_id = ?1 ORDER BY is_root DESC, created_at, id")
                .map_err(|error| error.to_string())?;
            let values = statement
                .query_map(params![collection_id], map_node)
                .map_err(|error| error.to_string())?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|error| error.to_string())?;
            values
        };
        let relations = {
            let mut statement = connection
                .prepare("SELECT id, collection_id, source_node_id, target_node_id, relation_type, label, directed, metadata_json, created_at, updated_at FROM topology_relations WHERE collection_id = ?1 ORDER BY created_at, id")
                .map_err(|error| error.to_string())?;
            let values = statement
                .query_map(params![collection_id], map_relation)
                .map_err(|error| error.to_string())?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|error| error.to_string())?;
            values
        };
        let interactions = {
            let mut statement = connection
                .prepare("SELECT i.id, i.node_id, i.interaction_type, i.title, i.config_json, i.state_json, i.enabled, i.created_at, i.updated_at FROM topology_interactions i JOIN topology_nodes n ON n.id = i.node_id WHERE n.collection_id = ?1 ORDER BY i.created_at, i.id")
                .map_err(|error| error.to_string())?;
            let values = statement
                .query_map(params![collection_id], map_interaction)
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

    fn test_store() -> TopologyStore {
        let mut connection = Connection::open_in_memory().expect("open in-memory sqlite");
        migrate(&mut connection).expect("migrate topology schema");
        TopologyStore {
            connection: Mutex::new(connection),
        }
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
        let loaded = store.load_library_metadata(None).unwrap();
        assert!(!loaded.imported_legacy);
        assert_eq!(loaded.metadata, metadata);
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
        assert_eq!(
            store.load_library_metadata(None).unwrap().metadata,
            metadata
        );
    }

    #[test]
    fn imports_legacy_metadata_only_when_the_database_is_empty() {
        let store = test_store();
        let first = store
            .load_library_metadata(Some(sample_library("旧资料库")))
            .unwrap();
        assert!(first.imported_legacy);
        assert_eq!(first.metadata.notebooks[0].title, "旧资料库");

        let second = store
            .load_library_metadata(Some(sample_library("不应覆盖")))
            .unwrap();
        assert!(!second.imported_legacy);
        assert_eq!(second.metadata.notebooks[0].title, "旧资料库");
    }

    #[test]
    fn upgrades_an_existing_v1_database_without_losing_topology() {
        let mut connection = Connection::open_in_memory().unwrap();
        {
            let transaction = connection.transaction().unwrap();
            migrate_v1(&transaction).unwrap();
            transaction.pragma_update(None, "user_version", 1).unwrap();
            transaction.commit().unwrap();
        }
        connection
            .execute(
                "INSERT INTO topology_collections (id, title) VALUES ('legacy', '旧拓扑')",
                [],
            )
            .unwrap();
        migrate(&mut connection).unwrap();
        assert_eq!(
            connection
                .query_row(
                    "SELECT title FROM topology_collections WHERE id = 'legacy'",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "旧拓扑"
        );
        assert_eq!(
            connection
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            6
        );
        connection
            .prepare("SELECT id FROM documents")
            .expect("v2 documents table should exist");
        connection
            .prepare("SELECT operation_id FROM pending_file_ops")
            .expect("v3 pending_file_ops table should exist");
        connection
            .prepare("SELECT version FROM migration_history")
            .expect("v3 migration_history table should exist");
        connection
            .prepare("SELECT family FROM articles")
            .expect("v4 articles family column should exist");
        connection
            .prepare("SELECT relation_type FROM article_edges")
            .expect("v4 article_edges relation_type column should exist");
    }

    #[test]
    fn stores_multiple_roots_manual_content_relations_and_interactions() {
        let store = test_store();
        store
            .upsert_collection(UpsertTopologyCollectionRequest {
                id: "collection-1".into(),
                title: "集合".into(),
                description: String::new(),
            })
            .unwrap();
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
        store
            .upsert_collection(UpsertTopologyCollectionRequest {
                id: "collection-1".into(),
                title: "集合".into(),
                description: String::new(),
            })
            .unwrap();
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
        assert!(error.contains("SQLite"));
    }

    #[test]
    fn bulk_syncs_markdown_graph_without_replacing_manual_nodes() {
        let store = test_store();
        store
            .upsert_node(UpsertTopologyNodeRequest {
                id: "manual-1".into(),
                collection_id: "collection-1".into(),
                node_type: "note".into(),
                title: "个人笔记".into(),
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

        let markdown_node = |id: &str, is_root: bool| UpsertTopologyNodeRequest {
            id: id.into(),
            collection_id: "collection-1".into(),
            node_type: if is_root { "root" } else { "explain" }.into(),
            title: id.into(),
            summary: String::new(),
            content_mode: "markdown".into(),
            content: None,
            document_id: Some(id.into()),
            is_root,
            is_manual: false,
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
        };
        let graph = store
            .sync_markdown_topology(SyncMarkdownTopologyRequest {
                collection: UpsertTopologyCollectionRequest {
                    id: "collection-1".into(),
                    title: "同步后的集合".into(),
                    description: "说明".into(),
                },
                nodes: vec![
                    markdown_node("root-1", true),
                    markdown_node("child-1", false),
                ],
                relations: vec![UpsertTopologyRelationRequest {
                    id: "tree:root-1:child-1".into(),
                    collection_id: "collection-1".into(),
                    source_node_id: "root-1".into(),
                    target_node_id: "child-1".into(),
                    relation_type: "contains".into(),
                    label: "下一级".into(),
                    directed: true,
                    metadata_json: r#"{"source":"markdown-tree"}"#.into(),
                }],
            })
            .unwrap();

        assert_eq!(graph.collection.title, "同步后的集合");
        assert_eq!(graph.nodes.len(), 3);
        assert!(graph.nodes.iter().any(|node| node.id == "manual-1"));
        assert!(graph
            .relations
            .iter()
            .any(|relation| relation.id == "tree:root-1:child-1"));
    }

    #[test]
    fn persists_node_level_config_across_replace_and_upsert() {
        let store = test_store();
        let mut metadata = sample_library("带节点配置");
        metadata
            .articles
            .get_mut("child-1")
            .unwrap()
            .config_json = Some(serde_json::json!({
                "modelBindingId": "gpt-4o",
                "systemPrompt": "用中文解释",
                "displayFields": ["title", "content"]
            }));
        store.replace_library_metadata(metadata.clone()).unwrap();
        let loaded = store.load_library_metadata(None).unwrap();
        assert_eq!(
            loaded.metadata.articles["child-1"].config_json,
            metadata.articles["child-1"].config_json,
            "replace/load 应完整保留 config_json"
        );

        store
            .upsert_collection(UpsertTopologyCollectionRequest {
                id: "collection-1".into(),
                title: "集合".into(),
                description: String::new(),
            })
            .unwrap();
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

    #[test]
    fn upgrades_an_existing_v3_database_without_losing_topology() {
        let mut connection = Connection::open_in_memory().expect("open in-memory sqlite");
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        {
            let transaction = connection.transaction().expect("begin transaction");
            migrate_v1(&transaction).expect("migrate v1");
            migrate_v2(&transaction).expect("migrate v2");
            migrate_v3(&transaction).expect("migrate v3");
            transaction
                .pragma_update(None, "user_version", 3)
                .expect("set user_version");
            transaction.commit().expect("commit");
        }
        connection
            .execute(
                "INSERT INTO articles (id, root_id, parent_id, title, summary, article_type, created_at, updated_at)
                 VALUES ('old-root', 'old-root', NULL, '旧文章', '旧摘要', '根节点', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            )
            .expect("insert v3-era article");

        migrate(&mut connection).expect("upgrade to v4");

        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("read user_version");
        assert_eq!(version, 6);
        let article_columns = connection
            .prepare("PRAGMA table_info(articles)")
            .expect("prepare pragma")
            .query_map([], |row| row.get::<_, String>(1))
            .expect("query columns")
            .collect::<rusqlite::Result<Vec<_>>>()
            .expect("collect columns");
        for column in [
            "family",
            "creation_method",
            "content_json",
            "anchor_json",
            "generation_json",
            "config_json",
        ] {
            assert!(article_columns.iter().any(|name| name == column), "articles 缺少列 {column}");
        }
        let node_columns = connection
            .prepare("PRAGMA table_info(topology_nodes)")
            .expect("prepare pragma")
            .query_map([], |row| row.get::<_, String>(1))
            .expect("query columns")
            .collect::<rusqlite::Result<Vec<_>>>()
            .expect("collect columns");
        assert!(node_columns.iter().any(|name| name == "family"), "topology_nodes 缺少列 family");
        assert!(node_columns.iter().any(|name| name == "config_json"), "topology_nodes 缺少列 config_json");
        let edge_columns = connection
            .prepare("PRAGMA table_info(article_edges)")
            .expect("prepare pragma")
            .query_map([], |row| row.get::<_, String>(1))
            .expect("query columns")
            .collect::<rusqlite::Result<Vec<_>>>()
            .expect("collect columns");
        assert!(edge_columns.iter().any(|name| name == "relation_type"), "article_edges 缺少列 relation_type");
        let (family, creation_method): (String, String) = connection
            .query_row(
                "SELECT family, creation_method FROM articles WHERE id = 'old-root'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read legacy defaults");
        assert_eq!(family, "笔记");
        assert_eq!(creation_method, "手动");
    }
