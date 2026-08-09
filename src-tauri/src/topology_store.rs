use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};

const DATABASE_VERSION: i64 = 1;
const MAX_ID_LENGTH: usize = 128;
const MAX_TEXT_LENGTH: usize = 16 * 1024 * 1024;
const MAX_JSON_LENGTH: usize = 1024 * 1024;

pub struct TopologyStore {
    connection: Mutex<Connection>,
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

#[derive(Deserialize)]
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
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
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
    let version = connection
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
            .pragma_update(None, "user_version", DATABASE_VERSION)
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
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

impl TopologyStore {
    pub fn open(app_data_dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
        let mut connection = Connection::open(app_data_dir.join("library.sqlite3"))
            .map_err(|error| error.to_string())?;
        migrate(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.connection
            .lock()
            .map_err(|_| "拓扑数据库锁已损坏".to_string())
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
        validate_id("内容集合标识", &request.id)?;
        validate_text("内容集合标题", &request.title)?;
        validate_text("内容集合说明", &request.description)?;
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

    pub fn delete_collection(&self, collection_id: &str) -> Result<bool, String> {
        validate_id("内容集合标识", collection_id)?;
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
        validate_id("内容集合标识", &request.collection_id)?;
        validate_text("节点标题", &request.title)?;
        validate_text("节点摘要", &request.summary)?;
        validate_json("节点互动状态", &request.interaction_state_json)?;
        validate_json("节点外观", &request.appearance_json)?;
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
                     appearance_json
                   ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
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
                ],
            )
            .map_err(|error| error.to_string())?;
        connection
            .query_row(
                "SELECT id, collection_id, node_type, title, summary, content_mode, content, document_id, is_root, is_manual, enabled, interactive, interaction_state_json, appearance_json, created_at, updated_at FROM topology_nodes WHERE id = ?1",
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
        validate_id("内容集合标识", &request.collection_id)?;
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
                return Err("已持久化的关系端点必须位于同一内容集合".to_string());
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
        validate_id("内容集合标识", collection_id)?;
        let connection = self.connection()?;
        let collection = connection
            .query_row(
                "SELECT id, title, description, created_at, updated_at FROM topology_collections WHERE id = ?1",
                params![collection_id],
                map_collection,
            )
            .optional()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "内容集合不存在".to_string())?;
        let nodes = {
            let mut statement = connection
                .prepare("SELECT id, collection_id, node_type, title, summary, content_mode, content, document_id, is_root, is_manual, enabled, interactive, interaction_state_json, appearance_json, created_at, updated_at FROM topology_nodes WHERE collection_id = ?1 ORDER BY is_root DESC, created_at, id")
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
            })
            .unwrap_err();
        assert!(error.contains("SQLite"));
    }
}
