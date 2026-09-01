use serde::Serialize;
use std::{
    fs,
    io,
    path::{Path, PathBuf},
    sync::Mutex,
};
use uuid::Uuid;

use crate::transaction_journal::TransactionJournal;

const MAX_DOCUMENT_BYTES: usize = 16 * 1024 * 1024;

pub struct MarkdownStore {
    root: PathBuf,
    journal: TransactionJournal,
    write_lock: Mutex<()>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDocument {
    content: String,
    relative_path: String,
}

impl MarkdownStore {
    pub fn new(workspace_root: PathBuf, database_path: PathBuf) -> Self {
        Self {
            journal: TransactionJournal::new(workspace_root.clone(), database_path),
            root: workspace_root,
            write_lock: Mutex::new(()),
        }
    }

    fn validate_id(document_id: &str) -> Result<(), String> {
        if document_id.is_empty()
            || document_id.len() > 128
            || !document_id
                .bytes()
                .all(|value| value.is_ascii_alphanumeric() || matches!(value, b'-' | b'_'))
        {
            return Err("文档标识无效".to_string());
        }
        Ok(())
    }

    fn validate_content(content: &str) -> Result<(), String> {
        if content.len() > MAX_DOCUMENT_BYTES {
            return Err("Markdown 文档超过 16 MiB 的首期限制".to_string());
        }
        Ok(())
    }

    /// 已登记文档始终复用原路径；新文档进入所属知识点的独立目录，
    /// Markdown 文件名本身只使用随机字符串。
    fn resolve_relative_path(
        &self,
        document_id: &str,
        knowledge_point_id: Option<&str>,
    ) -> Result<String, String> {
        Self::validate_id(document_id)?;
        if let Some(registered) = self.journal.resolve_document_path(document_id)? {
            return Ok(registered);
        }
        let knowledge_point_id = knowledge_point_id
            .ok_or_else(|| "创建 Markdown 文档时缺少知识点标识".to_string())?;
        Self::validate_id(knowledge_point_id)?;
        let random = Uuid::new_v4().to_string().replace('-', "");
        Ok(format!("notes/{knowledge_point_id}/{random}.md"))
    }

    fn recover_legacy_backup_if_needed(path: &Path) -> io::Result<()> {
        let backup = path.with_extension("md.bak");
        if !path.exists() && backup.exists() {
            fs::rename(backup, path)?;
        }
        Ok(())
    }

    pub fn load_or_create(
        &self,
        document_id: &str,
        initial_content: &str,
        knowledge_point_id: Option<&str>,
    ) -> Result<MarkdownDocument, String> {
        Self::validate_content(initial_content)?;
        let _guard = self
            .write_lock
            .lock()
            .map_err(|_| "Markdown 仓库写入锁已损坏".to_string())?;
        let relative_path = self.resolve_relative_path(document_id, knowledge_point_id)?;
        let path = self.root.join(&relative_path);
        let parent = path
            .parent()
            .ok_or_else(|| "Markdown 文档路径无效".to_string())?;
        fs::create_dir_all(parent).map_err(|error| format!("无法创建 Markdown 仓库：{error}"))?;
        Self::recover_legacy_backup_if_needed(&path)
            .map_err(|error| format!("无法恢复 Markdown 文档：{error}"))?;
        if !path.exists() {
            self.journal
                .write_document(document_id, &relative_path, initial_content)
                .map_err(|error| format!("无法创建 Markdown 文档：{error}"))?;
        }
        let content = fs::read_to_string(&path)
            .map_err(|error| format!("无法读取 Markdown 文档：{error}"))?;
        Self::validate_content(&content)?;
        self.journal
            .reconcile_document(document_id, &relative_path, &content)?;
        Ok(MarkdownDocument {
            content,
            relative_path,
        })
    }

    pub fn save(
        &self,
        document_id: &str,
        content: &str,
        knowledge_point_id: Option<&str>,
    ) -> Result<MarkdownDocument, String> {
        Self::validate_content(content)?;
        let _guard = self
            .write_lock
            .lock()
            .map_err(|_| "Markdown 仓库写入锁已损坏".to_string())?;
        let relative_path = self.resolve_relative_path(document_id, knowledge_point_id)?;
        let path = self.root.join(&relative_path);
        let parent = path
            .parent()
            .ok_or_else(|| "Markdown 文档路径无效".to_string())?;
        fs::create_dir_all(parent).map_err(|error| format!("无法创建 Markdown 仓库：{error}"))?;
        Self::recover_legacy_backup_if_needed(&path)
            .map_err(|error| format!("无法恢复 Markdown 文档：{error}"))?;
        self.journal
            .write_document(document_id, &relative_path, content)
            .map_err(|error| format!("无法保存 Markdown 文档：{error}"))?;
        Ok(MarkdownDocument {
            content: content.to_string(),
            relative_path,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::MarkdownStore;
    use crate::topology_store::TopologyStore;
    use rusqlite::Connection;
    use std::{fs, path::PathBuf};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "annota-markdown-{label}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .expect("clock should be available")
                    .as_nanos()
            ));
            fs::create_dir_all(&path).expect("test directory should be created");
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn test_store(directory: &TestDirectory) -> MarkdownStore {
        let database_path = directory.0.join(".annota/library.sqlite3");
        TopologyStore::open(database_path.clone()).expect("database should be initialized");
        MarkdownStore::new(directory.0.clone(), database_path)
    }

    #[test]
    fn creates_and_updates_managed_markdown_document() {
        let directory = TestDirectory::new("save");
        let store = test_store(&directory);
        let created = store
            .load_or_create("article-1", "# 初始内容\n", Some("knowledge-1"))
            .expect("document should be created");
        assert_eq!(created.content, "# 初始内容\n");
        assert!(
            regex_is_random_note_path(&created.relative_path),
            "新文档应使用随机文件名，实际为 {}",
            created.relative_path
        );
        let first_path = created.relative_path.clone();
        let file_on_disk = directory.0.join(&first_path);
        assert!(file_on_disk.is_file(), "随机路径文件应存在：{first_path}");

        store
            .save("article-1", "# 已更新\n", Some("knowledge-1"))
            .expect("document should be saved");
        let reloaded = store
            .load_or_create("article-1", "不会覆盖", Some("knowledge-1"))
            .expect("document should be reloaded");
        assert_eq!(reloaded.content, "# 已更新\n");
        assert_eq!(
            reloaded.relative_path, first_path,
            "二次加载应复用数据库登记的同一路径"
        );
        let connection = Connection::open(directory.0.join(".annota/library.sqlite3")).unwrap();
        let (relative_path, revision, byte_length) = connection
            .query_row(
                "SELECT relative_path, revision, byte_length FROM documents WHERE id = 'article-1'",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(relative_path, first_path, "documents 应登记随机路径");
        assert_eq!(revision, 2);
        assert_eq!(byte_length, "# 已更新\n".len() as i64);
    }

    fn regex_is_random_note_path(path: &str) -> bool {
        let mut parts = path.split('/');
        matches!(
            (parts.next(), parts.next(), parts.next(), parts.next()),
            (Some("notes"), Some("knowledge-1"), Some(name), None)
                if name.ends_with(".md")
                    && name[..name.len() - 3].len() == 32
                    && name[..name.len() - 3]
                        .bytes()
                        .all(|value| value.is_ascii_alphanumeric())
        )
    }

    #[test]
    fn rejects_document_ids_that_can_escape_the_store() {
        let directory = TestDirectory::new("path");
        let store = test_store(&directory);
        assert!(
            store
                .load_or_create("../outside", "text", Some("knowledge-1"))
                .is_err()
        );
        assert!(
            store
                .load_or_create("article-1", "text", Some("../outside"))
                .is_err()
        );
    }
}
