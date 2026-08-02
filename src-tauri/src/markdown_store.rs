use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

const MAX_DOCUMENT_BYTES: usize = 16 * 1024 * 1024;
const CONTENT_RESET_MARKER: &str = ".content-reset.single-markdown-v1";

pub struct MarkdownStore {
    root: PathBuf,
    write_lock: Mutex<()>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDocument {
    content: String,
    relative_path: String,
}

impl MarkdownStore {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            root: app_data_dir.join("vault").join("documents"),
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

    fn document_path(&self, document_id: &str) -> Result<PathBuf, String> {
        Self::validate_id(document_id)?;
        Ok(self.root.join(format!("{document_id}.md")))
    }

    fn validate_content(content: &str) -> Result<(), String> {
        if content.len() > MAX_DOCUMENT_BYTES {
            return Err("Markdown 文档超过 16 MiB 的首期限制".to_string());
        }
        Ok(())
    }

    fn relative_path(document_id: &str) -> String {
        format!("vault/documents/{document_id}.md")
    }

    pub fn apply_content_reset(&self) -> Result<(), String> {
        let _guard = self
            .write_lock
            .lock()
            .map_err(|_| "Markdown 仓库写入锁已损坏".to_string())?;
        let app_data_dir = self
            .root
            .parent()
            .and_then(Path::parent)
            .ok_or_else(|| "Markdown 仓库目录无效".to_string())?;
        let marker = app_data_dir.join(CONTENT_RESET_MARKER);
        if marker.exists() {
            return Ok(());
        }
        if self.root.exists() {
            fs::remove_dir_all(&self.root)
                .map_err(|error| format!("无法清空旧 Markdown 文章：{error}"))?;
        }
        fs::create_dir_all(app_data_dir)
            .map_err(|error| format!("无法创建应用数据目录：{error}"))?;
        fs::write(&marker, b"single-markdown-v1\n")
            .map_err(|error| format!("无法记录文章清空迁移：{error}"))?;
        Ok(())
    }

    fn recover_if_needed(path: &Path) -> io::Result<()> {
        let backup = path.with_extension("md.bak");
        if !path.exists() && backup.exists() {
            fs::rename(backup, path)?;
        }
        Ok(())
    }

    fn durable_write(path: &Path, content: &str) -> io::Result<()> {
        let temporary = path.with_extension("md.tmp");
        let backup = path.with_extension("md.bak");
        if temporary.exists() {
            fs::remove_file(&temporary)?;
        }
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;

        if path.exists() {
            if backup.exists() {
                fs::remove_file(&backup)?;
            }
            fs::rename(path, &backup)?;
        }
        if let Err(error) = fs::rename(&temporary, path) {
            if backup.exists() && !path.exists() {
                let _ = fs::rename(&backup, path);
            }
            let _ = fs::remove_file(&temporary);
            return Err(error);
        }
        if backup.exists() {
            fs::remove_file(backup)?;
        }
        Ok(())
    }

    pub fn load_or_create(
        &self,
        document_id: &str,
        initial_content: &str,
    ) -> Result<MarkdownDocument, String> {
        Self::validate_content(initial_content)?;
        let _guard = self
            .write_lock
            .lock()
            .map_err(|_| "Markdown 仓库写入锁已损坏".to_string())?;
        let path = self.document_path(document_id)?;
        fs::create_dir_all(&self.root)
            .map_err(|error| format!("无法创建 Markdown 仓库：{error}"))?;
        Self::recover_if_needed(&path)
            .map_err(|error| format!("无法恢复 Markdown 文档：{error}"))?;
        if !path.exists() {
            Self::durable_write(&path, initial_content)
                .map_err(|error| format!("无法创建 Markdown 文档：{error}"))?;
        }
        let content = fs::read_to_string(&path)
            .map_err(|error| format!("无法读取 Markdown 文档：{error}"))?;
        Self::validate_content(&content)?;
        Ok(MarkdownDocument {
            content,
            relative_path: Self::relative_path(document_id),
        })
    }

    pub fn save(&self, document_id: &str, content: &str) -> Result<MarkdownDocument, String> {
        Self::validate_content(content)?;
        let _guard = self
            .write_lock
            .lock()
            .map_err(|_| "Markdown 仓库写入锁已损坏".to_string())?;
        let path = self.document_path(document_id)?;
        fs::create_dir_all(&self.root)
            .map_err(|error| format!("无法创建 Markdown 仓库：{error}"))?;
        Self::recover_if_needed(&path)
            .map_err(|error| format!("无法恢复 Markdown 文档：{error}"))?;
        Self::durable_write(&path, content)
            .map_err(|error| format!("无法保存 Markdown 文档：{error}"))?;
        Ok(MarkdownDocument {
            content: content.to_string(),
            relative_path: Self::relative_path(document_id),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::MarkdownStore;
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

    #[test]
    fn creates_and_updates_managed_markdown_document() {
        let directory = TestDirectory::new("save");
        let store = MarkdownStore::new(directory.0.clone());
        let created = store
            .load_or_create("article-1", "# 初始内容\n")
            .expect("document should be created");
        assert_eq!(created.content, "# 初始内容\n");
        assert_eq!(created.relative_path, "vault/documents/article-1.md");

        store
            .save("article-1", "# 已更新\n")
            .expect("document should be saved");
        let reloaded = store
            .load_or_create("article-1", "不会覆盖")
            .expect("document should be reloaded");
        assert_eq!(reloaded.content, "# 已更新\n");
    }

    #[test]
    fn rejects_document_ids_that_can_escape_the_store() {
        let directory = TestDirectory::new("path");
        let store = MarkdownStore::new(directory.0.clone());
        assert!(store.load_or_create("../outside", "text").is_err());
    }

    #[test]
    fn clears_existing_documents_exactly_once() {
        let directory = TestDirectory::new("content-reset");
        let store = MarkdownStore::new(directory.0.clone());
        store
            .save("old-article", "旧正文")
            .expect("old document should be saved");

        store
            .apply_content_reset()
            .expect("first reset should clear documents");
        assert!(!directory.0.join("vault/documents/old-article.md").exists());

        store
            .save("new-article", "新正文")
            .expect("new document should be saved");
        store
            .apply_content_reset()
            .expect("second reset should be a no-op");
        assert!(directory.0.join("vault/documents/new-article.md").exists());
    }
}
