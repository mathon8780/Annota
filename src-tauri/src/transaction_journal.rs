use crate::workspace::durable_json_replace;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    ffi::OsString,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    time::Duration,
};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

const JOURNAL_FORMAT_VERSION: u32 = 1;
const OPERATION_KIND: &str = "markdown-write";

#[derive(Clone, Debug, Default)]
pub struct RecoveryReport {
    pub recovered_operations: usize,
    pub finalized_operations: usize,
    pub rolled_back_operations: usize,
    pub orphan_journals: usize,
    pub orphan_artifacts: usize,
}

#[derive(Clone, Debug, Default)]
pub struct JournalStateSummary {
    pub pending_operations: usize,
    pub journal_files: usize,
    pub operation_artifacts: usize,
}

pub struct TransactionJournal {
    workspace_root: PathBuf,
    database_path: PathBuf,
    transactions_dir: PathBuf,
    diagnostics_dir: PathBuf,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct JournalRecord {
    format_version: u32,
    operation_id: String,
    operation_kind: String,
    document_id: String,
    relative_path: String,
    staging_relative_path: String,
    backup_relative_path: String,
    content_hash: String,
    original_hash: Option<String>,
    byte_length: i64,
    target_revision: i64,
    state: String,
    created_at: String,
    updated_at: String,
}

#[derive(Clone, Debug)]
struct PendingOperation {
    operation_id: String,
    operation_kind: String,
    document_id: String,
    relative_path: String,
    staging_relative_path: String,
    backup_relative_path: String,
    content_hash: String,
    original_hash: Option<String>,
    byte_length: i64,
    target_revision: i64,
    state: String,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryFailure<'a> {
    operation_id: &'a str,
    occurred_at: String,
    error: &'a str,
}

fn now() -> Result<String, String> {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|error| format!("无法格式化 transaction journal 时间：{error}"))
}

fn slash_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn safe_relative_path(path: &str) -> bool {
    let path = Path::new(path);
    !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn append_file_suffix(path: &Path, suffix: &str) -> Result<PathBuf, String> {
    let file_name = path
        .file_name()
        .ok_or_else(|| "正文 operation 路径缺少文件名".to_string())?;
    let mut name = OsString::from(file_name);
    name.push(suffix);
    Ok(path.with_file_name(name))
}

fn content_hash(content: &[u8]) -> String {
    format!("{:x}", Sha256::digest(content))
}

fn hash_file(path: &Path) -> Result<Option<(String, i64)>, String> {
    if !path.exists() {
        return Ok(None);
    }
    if !path.is_file() {
        return Err(format!("operation 路径不是普通文件：{}", path.display()));
    }
    let mut file = File::open(path).map_err(|error| format!("无法读取 {}：{error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut byte_length = 0_i64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("无法校验 {}：{error}", path.display()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        byte_length = byte_length
            .checked_add(read as i64)
            .ok_or_else(|| "Markdown 文件大小溢出".to_string())?;
    }
    Ok(Some((format!("{:x}", hasher.finalize()), byte_length)))
}

fn open_database(path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(path)
        .map_err(|error| format!("无法打开 transaction journal 数据库：{error}"))?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| format!("无法配置 transaction journal 数据库：{error}"))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("无法启用 transaction journal 外键：{error}"))?;
    Ok(connection)
}

fn write_staging(path: &Path, content: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|error| format!("无法创建 Markdown staging {}：{error}", path.display()))?;
    file.write_all(content)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("无法同步 Markdown staging {}：{error}", path.display()))
}

fn sync_published_file(path: &Path) -> Result<(), String> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .and_then(|file| file.sync_all())
        .map_err(|error| format!("无法同步已发布 Markdown {}：{error}", path.display()))
}

impl TransactionJournal {
    pub fn new(workspace_root: PathBuf, database_path: PathBuf) -> Self {
        let internal_dir = workspace_root.join(".annota");
        Self {
            workspace_root,
            database_path,
            transactions_dir: internal_dir.join("transactions"),
            diagnostics_dir: internal_dir.join("diagnostics"),
        }
    }

    fn journal_path(&self, operation_id: &str) -> PathBuf {
        self.transactions_dir.join(format!("{operation_id}.json"))
    }

    fn absolute(&self, relative_path: &str) -> Result<PathBuf, String> {
        if !safe_relative_path(relative_path) {
            return Err(format!("transaction journal 包含不安全路径：{relative_path}"));
        }
        Ok(self.workspace_root.join(relative_path))
    }

    fn operation_record(
        &self,
        document_id: &str,
        relative_path: &str,
        bytes: &[u8],
    ) -> Result<(JournalRecord, PathBuf, PathBuf, PathBuf), String> {
        let operation_id = Uuid::new_v4().to_string();
        let target_relative = PathBuf::from(relative_path);
        let staging_relative = append_file_suffix(
            &target_relative,
            &format!(".tmp-{operation_id}"),
        )?;
        let backup_relative = append_file_suffix(
            &target_relative,
            &format!(".bak-{operation_id}"),
        )?;
        let target_path = self.workspace_root.join(&target_relative);
        let staging_path = self.workspace_root.join(&staging_relative);
        let backup_path = self.workspace_root.join(&backup_relative);
        let new_hash = content_hash(bytes);
        let original_hash = hash_file(&target_path)?.map(|value| value.0);
        let connection = open_database(&self.database_path)?;
        let previous = connection
            .query_row(
                "SELECT content_hash, revision FROM documents WHERE id = ?1",
                params![document_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
            )
            .optional()
            .map_err(|error| format!("无法读取 Markdown revision：{error}"))?;
        let target_revision = match previous {
            Some((hash, revision)) if hash == new_hash => revision,
            Some((_, revision)) => revision
                .checked_add(1)
                .ok_or_else(|| "Markdown revision 溢出".to_string())?,
            None => 1,
        };
        let created_at = now()?;
        let record = JournalRecord {
            format_version: JOURNAL_FORMAT_VERSION,
            operation_id,
            operation_kind: OPERATION_KIND.to_string(),
            document_id: document_id.to_string(),
            relative_path: slash_path(&target_relative),
            staging_relative_path: slash_path(&staging_relative),
            backup_relative_path: slash_path(&backup_relative),
            content_hash: new_hash,
            original_hash,
            byte_length: bytes.len() as i64,
            target_revision,
            state: "prepared".to_string(),
            created_at: created_at.clone(),
            updated_at: created_at,
        };
        Ok((record, target_path, staging_path, backup_path))
    }

    fn write_journal(&self, record: &JournalRecord) -> Result<(), String> {
        durable_json_replace(&self.journal_path(&record.operation_id), record)
            .map_err(|error| format!("无法写入 transaction journal：{error}"))
    }

    fn insert_pending(&self, record: &JournalRecord) -> Result<(), String> {
        let connection = open_database(&self.database_path)?;
        connection
            .execute(
                r#"INSERT INTO pending_file_ops (
                     operation_id, operation_kind, document_id, relative_path,
                     staging_relative_path, backup_relative_path, content_hash,
                     original_hash, byte_length, target_revision, state, created_at, updated_at
                   ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)"#,
                params![
                    record.operation_id,
                    record.operation_kind,
                    record.document_id,
                    record.relative_path,
                    record.staging_relative_path,
                    record.backup_relative_path,
                    record.content_hash,
                    record.original_hash,
                    record.byte_length,
                    record.target_revision,
                    record.state,
                    record.created_at,
                    record.updated_at,
                ],
            )
            .map_err(|error| format!("无法登记 pending Markdown operation：{error}"))?;
        Ok(())
    }

    fn update_published(&self, record: &mut JournalRecord) -> Result<(), String> {
        record.state = "published".to_string();
        record.updated_at = now()?;
        self.write_journal(record)?;
        let connection = open_database(&self.database_path)?;
        let updated = connection
            .execute(
                "UPDATE pending_file_ops SET state = 'published', updated_at = ?2 WHERE operation_id = ?1",
                params![record.operation_id, record.updated_at],
            )
            .map_err(|error| format!("无法更新 pending Markdown operation：{error}"))?;
        if updated != 1 {
            return Err("pending Markdown operation 在发布过程中消失".to_string());
        }
        Ok(())
    }

    fn finalize(&self, record: &JournalRecord) -> Result<(), String> {
        let mut connection = open_database(&self.database_path)?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("无法启动 Markdown finalize 事务：{error}"))?;
        transaction
            .execute(
                r#"INSERT INTO documents (
                     id, relative_path, content_hash, byte_length, revision
                   ) VALUES (?1, ?2, ?3, ?4, ?5)
                   ON CONFLICT(id) DO UPDATE SET
                     relative_path = excluded.relative_path,
                     content_hash = excluded.content_hash,
                     byte_length = excluded.byte_length,
                     revision = excluded.revision,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"#,
                params![
                    record.document_id,
                    record.relative_path,
                    record.content_hash,
                    record.byte_length,
                    record.target_revision,
                ],
            )
            .map_err(|error| format!("无法 finalize Markdown documents：{error}"))?;
        let deleted = transaction
            .execute(
                "DELETE FROM pending_file_ops WHERE operation_id = ?1",
                params![record.operation_id],
            )
            .map_err(|error| format!("无法完成 pending Markdown operation：{error}"))?;
        if deleted != 1 {
            return Err("pending Markdown operation 在 finalize 前消失".to_string());
        }
        transaction
            .commit()
            .map_err(|error| format!("无法提交 Markdown finalize 事务：{error}"))
    }

    fn reconcile_existing(
        &self,
        document_id: &str,
        relative_path: &str,
        bytes: &[u8],
    ) -> Result<(), String> {
        let hash = content_hash(bytes);
        let connection = open_database(&self.database_path)?;
        connection
            .execute(
                r#"INSERT INTO documents (id, relative_path, content_hash, byte_length, revision)
                   VALUES (?1, ?2, ?3, ?4, 1)
                   ON CONFLICT(id) DO UPDATE SET
                     relative_path = excluded.relative_path,
                     content_hash = excluded.content_hash,
                     byte_length = excluded.byte_length,
                     revision = CASE
                       WHEN documents.content_hash <> excluded.content_hash THEN documents.revision + 1
                       ELSE documents.revision
                     END,
                     updated_at = CASE
                       WHEN documents.content_hash <> excluded.content_hash
                       THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                       ELSE documents.updated_at
                     END"#,
                params![document_id, relative_path, hash, bytes.len() as i64],
            )
            .map_err(|error| format!("无法登记现有 Markdown 文档：{error}"))?;
        Ok(())
    }

    fn publish_staging(
        &self,
        record: &mut JournalRecord,
        target_path: &Path,
        staging_path: &Path,
        backup_path: &Path,
    ) -> Result<(), String> {
        if !staging_path.is_file() {
            return Err(format!("Markdown staging 不存在：{}", staging_path.display()));
        }
        let staging_hash = hash_file(staging_path)?
            .ok_or_else(|| "Markdown staging 在校验过程中消失".to_string())?;
        if staging_hash.0 != record.content_hash || staging_hash.1 != record.byte_length {
            return Err("Markdown staging hash 或大小与 journal 不一致".to_string());
        }

        match hash_file(target_path)? {
            Some((hash, _)) => {
                if record.original_hash.as_deref() != Some(hash.as_str()) {
                    return Err("目标 Markdown 已被外部修改，拒绝覆盖".to_string());
                }
                if backup_path.exists() {
                    return Err("目标 Markdown 与 operation backup 同时存在，无法安全发布".to_string());
                }
                fs::rename(target_path, backup_path).map_err(|error| {
                    format!("无法为 Markdown 发布创建 operation backup：{error}")
                })?;
            }
            None => match (&record.original_hash, hash_file(backup_path)?) {
                (None, None) => {}
                (Some(expected), Some((hash, _))) if expected == &hash => {}
                _ => {
                    return Err("Markdown 目标缺失且 backup 无法证明原版本".to_string());
                }
            },
        }

        if let Err(error) = fs::rename(staging_path, target_path) {
            if !target_path.exists() && backup_path.exists() {
                let _ = fs::rename(backup_path, target_path);
            }
            return Err(format!("无法发布 Markdown staging：{error}"));
        }
        sync_published_file(target_path)?;
        self.update_published(record)
    }

    fn cleanup_completed(
        &self,
        record: &JournalRecord,
        staging_path: &Path,
        backup_path: &Path,
    ) {
        for path in [
            staging_path.to_path_buf(),
            backup_path.to_path_buf(),
            self.journal_path(&record.operation_id),
        ] {
            if path.exists() {
                let _ = fs::remove_file(path);
            }
        }
    }

    fn ensure_recovered_clean(&self) -> Result<(), String> {
        let recovery = self.recover_pending_operations()?;
        if recovery.orphan_journals > 0 || recovery.orphan_artifacts > 0 {
            return Err(
                "工作区存在未关联的 transaction journal 或 staging，请先运行诊断"
                    .to_string(),
            );
        }
        Ok(())
    }

    pub fn resolve_document_path(&self, document_id: &str) -> Result<Option<String>, String> {
        let connection = open_database(&self.database_path)?;
        connection
            .query_row(
                "SELECT relative_path FROM documents WHERE id = ?1",
                params![document_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| format!("无法读取 Markdown 文档路径：{error}"))
    }

    pub fn write_document(
        &self,
        document_id: &str,
        relative_path: &str,
        content: &str,
    ) -> Result<(), String> {
        self.ensure_recovered_clean()?;
        let bytes = content.as_bytes();
        let (mut record, target_path, staging_path, backup_path) =
            self.operation_record(document_id, relative_path, bytes)?;
        if let Some((hash, length)) = hash_file(&target_path)? {
            if hash == record.content_hash && length == record.byte_length {
                return self.reconcile_existing(
                    document_id,
                    &record.relative_path,
                    bytes,
                );
            }
        }
        let parent = target_path
            .parent()
            .ok_or_else(|| "Markdown 目标路径缺少父目录".to_string())?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建 Markdown 目录：{error}"))?;
        write_staging(&staging_path, bytes)?;
        self.write_journal(&record)?;
        self.insert_pending(&record)?;
        self.publish_staging(&mut record, &target_path, &staging_path, &backup_path)?;
        self.finalize(&record)?;
        self.cleanup_completed(&record, &staging_path, &backup_path);
        Ok(())
    }

    pub fn reconcile_document(
        &self,
        document_id: &str,
        relative_path: &str,
        content: &str,
    ) -> Result<(), String> {
        self.ensure_recovered_clean()?;
        self.reconcile_existing(document_id, relative_path, content.as_bytes())
    }

    fn load_pending(&self) -> Result<Vec<PendingOperation>, String> {
        let connection = open_database(&self.database_path)?;
        let mut statement = connection
            .prepare(
                "SELECT operation_id, operation_kind, document_id, relative_path,
                        staging_relative_path, backup_relative_path, content_hash,
                        original_hash, byte_length, target_revision, state, created_at, updated_at
                 FROM pending_file_ops ORDER BY created_at, operation_id",
            )
            .map_err(|error| format!("无法读取 pending Markdown operations：{error}"))?;
        let rows = statement
            .query_map([], |row| {
                Ok(PendingOperation {
                    operation_id: row.get(0)?,
                    operation_kind: row.get(1)?,
                    document_id: row.get(2)?,
                    relative_path: row.get(3)?,
                    staging_relative_path: row.get(4)?,
                    backup_relative_path: row.get(5)?,
                    content_hash: row.get(6)?,
                    original_hash: row.get(7)?,
                    byte_length: row.get(8)?,
                    target_revision: row.get(9)?,
                    state: row.get(10)?,
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
                })
            })
            .map_err(|error| format!("无法映射 pending Markdown operations：{error}"))?;
        let values = rows
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| format!("无法加载 pending Markdown operations：{error}"))?;
        Ok(values)
    }

    fn load_journal(&self, operation_id: &str) -> Result<JournalRecord, String> {
        let path = self.journal_path(operation_id);
        let raw = fs::read_to_string(&path)
            .map_err(|error| format!("无法读取 transaction journal {}：{error}", path.display()))?;
        serde_json::from_str(&raw)
            .map_err(|error| format!("transaction journal 已损坏，原文件已保留：{error}"))
    }

    fn validate_pair(
        &self,
        pending: &PendingOperation,
        journal: &JournalRecord,
    ) -> Result<(), String> {
        let target = Path::new(&pending.relative_path);
        if !safe_relative_path(&pending.relative_path)
            || !pending.relative_path.starts_with("notes/")
            || !pending.relative_path.ends_with(".md")
        {
            return Err("pending 正文路径必须是 notes/ 下的 Markdown 文件".to_string());
        }
        let expected_staging = append_file_suffix(
            target,
            &format!(".tmp-{}", pending.operation_id),
        )?;
        let expected_backup = append_file_suffix(
            target,
            &format!(".bak-{}", pending.operation_id),
        )?;
        let state_pair_is_valid = matches!(
            (pending.state.as_str(), journal.state.as_str()),
            ("prepared", "prepared") | ("prepared", "published") | ("published", "published")
        );
        let fields_match = journal.format_version == JOURNAL_FORMAT_VERSION
            && pending.operation_kind == OPERATION_KIND
            && journal.operation_kind == pending.operation_kind
            && journal.operation_id == pending.operation_id
            && journal.document_id == pending.document_id
            && journal.relative_path == pending.relative_path
            && journal.staging_relative_path == pending.staging_relative_path
            && journal.backup_relative_path == pending.backup_relative_path
            && journal.content_hash == pending.content_hash
            && journal.original_hash == pending.original_hash
            && journal.byte_length == pending.byte_length
            && journal.target_revision == pending.target_revision
            && state_pair_is_valid
            && pending.created_at == journal.created_at
            && !pending.updated_at.trim().is_empty()
            && pending.staging_relative_path == slash_path(&expected_staging)
            && pending.backup_relative_path == slash_path(&expected_backup)
            && pending.content_hash.len() == 64
            && pending.content_hash.bytes().all(|value| value.is_ascii_hexdigit())
            && pending.byte_length >= 0
            && pending.target_revision >= 1;
        if !fields_match {
            return Err("SQLite pending 与 transaction journal 不一致".to_string());
        }
        Ok(())
    }

    fn archive_rollback(
        &self,
        record: &mut JournalRecord,
        reason: &str,
    ) -> Result<(), String> {
        record.state = "rolledBack".to_string();
        record.updated_at = now()?;
        let mut connection = open_database(&self.database_path)?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("无法启动 Markdown rollback 事务：{error}"))?;
        let deleted = transaction
            .execute(
                "DELETE FROM pending_file_ops WHERE operation_id = ?1",
                params![record.operation_id],
            )
            .map_err(|error| format!("无法回滚 pending Markdown operation：{error}"))?;
        if deleted != 1 {
            return Err("pending Markdown operation 在 rollback 前消失".to_string());
        }
        transaction
            .commit()
            .map_err(|error| format!("无法提交 Markdown rollback：{error}"))?;
        let report = serde_json::json!({
            "operation": &*record,
            "reason": reason,
            "rolledBackAt": record.updated_at.clone(),
        });
        durable_json_replace(
            &self
                .diagnostics_dir
                .join(format!("recovery-{}.json", record.operation_id)),
            &report,
        )
        .map_err(|error| format!("无法保存 Markdown rollback 诊断：{error}"))?;
        let journal_path = self.journal_path(&record.operation_id);
        if journal_path.exists() {
            fs::remove_file(journal_path)
                .map_err(|error| format!("无法归档已回滚 journal：{error}"))?;
        }
        Ok(())
    }

    fn preserve_failure(&self, operation_id: &str, error: &str) {
        let report = RecoveryFailure {
            operation_id,
            occurred_at: now().unwrap_or_else(|_| "unknown".to_string()),
            error,
        };
        let _ = durable_json_replace(
            &self
                .diagnostics_dir
                .join(format!("recovery-blocked-{operation_id}.json")),
            &report,
        );
    }

    pub fn recover_pending_operations(&self) -> Result<RecoveryReport, String> {
        fs::create_dir_all(&self.transactions_dir)
            .and_then(|_| fs::create_dir_all(&self.diagnostics_dir))
            .map_err(|error| format!("无法创建 transaction journal 目录：{error}"))?;
        let pending = self.load_pending()?;
        let mut report = RecoveryReport::default();
        for operation in pending {
            let result = (|| -> Result<(), String> {
                let mut journal = self.load_journal(&operation.operation_id)?;
                self.validate_pair(&operation, &journal)?;
                let target_path = self.absolute(&operation.relative_path)?;
                let staging_path = self.absolute(&operation.staging_relative_path)?;
                let backup_path = self.absolute(&operation.backup_relative_path)?;
                let target = hash_file(&target_path)?;
                let staging = hash_file(&staging_path)?;
                let backup = hash_file(&backup_path)?;

                if target
                    .as_ref()
                    .is_some_and(|value| value.0 == operation.content_hash && value.1 == operation.byte_length)
                {
                    let staging_is_owned = match &staging {
                        None => true,
                        Some((hash, length)) => {
                            hash == &operation.content_hash && *length == operation.byte_length
                        }
                    };
                    let backup_is_owned = match (&backup, &operation.original_hash) {
                        (None, _) => true,
                        (Some((hash, _)), Some(original_hash)) => hash == original_hash,
                        (Some(_), None) => false,
                    };
                    if !staging_is_owned || !backup_is_owned {
                        return Err(
                            "目标 Markdown 已发布，但 staging 或 backup 内容无法归属于本次 operation"
                                .to_string(),
                        );
                    }
                    self.finalize(&journal)?;
                    self.cleanup_completed(&journal, &staging_path, &backup_path);
                    report.finalized_operations += 1;
                    return Ok(());
                }

                if staging
                    .as_ref()
                    .is_some_and(|value| value.0 == operation.content_hash && value.1 == operation.byte_length)
                {
                    self.publish_staging(
                        &mut journal,
                        &target_path,
                        &staging_path,
                        &backup_path,
                    )?;
                    self.finalize(&journal)?;
                    self.cleanup_completed(&journal, &staging_path, &backup_path);
                    report.recovered_operations += 1;
                    return Ok(());
                }

                let original_matches_target = match (&operation.original_hash, &target) {
                    (Some(expected), Some((actual, _))) => expected == actual,
                    _ => false,
                };
                let original_matches_backup = match (&operation.original_hash, &backup) {
                    (Some(expected), Some((actual, _))) => expected == actual,
                    _ => false,
                };
                if original_matches_target {
                    self.archive_rollback(&mut journal, "staging 缺失，目标仍是原版本")?;
                    report.rolled_back_operations += 1;
                    return Ok(());
                }
                if operation.original_hash.is_none()
                    && target.is_none()
                    && staging.is_none()
                    && backup.is_none()
                {
                    self.archive_rollback(&mut journal, "新建正文尚未发布且没有文件残留")?;
                    report.rolled_back_operations += 1;
                    return Ok(());
                }
                if target.is_none() && original_matches_backup {
                    fs::rename(&backup_path, &target_path)
                        .map_err(|error| format!("无法从 operation backup 恢复原正文：{error}"))?;
                    sync_published_file(&target_path)?;
                    self.archive_rollback(&mut journal, "staging 缺失，已从 backup 恢复原版本")?;
                    report.rolled_back_operations += 1;
                    return Ok(());
                }
                Err("无法从目标、staging 或 backup 证明 Markdown operation 的安全恢复路径".to_string())
            })();
            if let Err(error) = result {
                self.preserve_failure(&operation.operation_id, &error);
                return Err(format!(
                    "Markdown operation {} 无法安全恢复，所有证据已保留：{error}",
                    operation.operation_id
                ));
            }
        }

        let remaining_pending_ids = self
            .load_pending()?
            .into_iter()
            .map(|operation| operation.operation_id)
            .collect::<std::collections::HashSet<_>>();
        report.orphan_journals = self
            .journal_operation_ids()?
            .into_iter()
            .filter(|id| !remaining_pending_ids.contains(id))
            .count();
        report.orphan_artifacts = count_operation_artifacts(&self.workspace_root.join("notes"))?;
        Ok(report)
    }

    fn journal_operation_ids(&self) -> Result<Vec<String>, String> {
        if !self.transactions_dir.is_dir() {
            return Ok(Vec::new());
        }
        let mut ids = Vec::new();
        for entry in fs::read_dir(&self.transactions_dir)
            .map_err(|error| format!("无法扫描 transaction journals：{error}"))?
        {
            let entry = entry.map_err(|error| format!("无法读取 transaction journal：{error}"))?;
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|value| value.to_str()) == Some("json") {
                if let Some(id) = path.file_stem().and_then(|value| value.to_str()) {
                    ids.push(id.to_string());
                }
            }
        }
        Ok(ids)
    }

    pub fn inspect_state(&self) -> Result<JournalStateSummary, String> {
        let connection = open_database(&self.database_path)?;
        let pending_operations = connection
            .query_row("SELECT COUNT(*) FROM pending_file_ops", [], |row| row.get::<_, i64>(0))
            .map_err(|error| format!("无法统计 pending Markdown operations：{error}"))?;
        Ok(JournalStateSummary {
            pending_operations: usize::try_from(pending_operations)
                .map_err(|_| "pending Markdown operation 数量无效".to_string())?,
            journal_files: self.journal_operation_ids()?.len(),
            operation_artifacts: count_operation_artifacts(&self.workspace_root.join("notes"))?,
        })
    }
}

fn count_operation_artifacts(root: &Path) -> Result<usize, String> {
    if !root.is_dir() {
        return Ok(0);
    }
    let mut count = 0_usize;
    let mut directories = vec![root.to_path_buf()];
    while let Some(directory) = directories.pop() {
        for entry in fs::read_dir(&directory)
            .map_err(|error| format!("无法扫描 Markdown operation 残留：{error}"))?
        {
            let entry = entry.map_err(|error| format!("无法读取 Markdown operation 残留：{error}"))?;
            let path = entry.path();
            if path.is_dir() {
                directories.push(path);
            } else if path.is_file() {
                let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");
                if name.contains(".md.tmp-")
                    || name.contains(".md.bak-")
                    || name.ends_with(".md.tmp")
                    || name.ends_with(".md.bak")
                {
                    count += 1;
                }
            }
        }
    }
    Ok(count)
}
