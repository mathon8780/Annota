use rusqlite::{backup::Backup, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    time::Duration,
};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

const WORKSPACE_FORMAT: &str = "annota-workspace";
const WORKSPACE_FORMAT_VERSION: u32 = 1;
const DATABASE_SCHEMA_VERSION: u32 = 5;
const CONTENT_LAYOUT_VERSION: u32 = 2;

#[derive(Clone, Debug)]
pub struct WorkspaceLayout {
    root: PathBuf,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceManifest {
    pub format: String,
    pub workspace_id: String,
    pub display_name: String,
    pub workspace_format_version: u32,
    pub database_schema_version: u32,
    pub content_layout_version: u32,
    pub created_at: String,
    pub minimum_app_version: String,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct LegacyMigrationReport {
    pub database_copied: bool,
    pub documents_copied: usize,
}

impl WorkspaceLayout {
    pub fn at(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn managed(app_data_dir: &Path) -> Self {
        Self::at(app_data_dir.join("workspaces").join("default"))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn manifest_path(&self) -> PathBuf {
        self.root.join("workspace.json")
    }

    pub fn notes_dir(&self) -> PathBuf {
        self.root.join("notes")
    }

    pub fn assets_dir(&self) -> PathBuf {
        self.root.join("assets").join("sha256")
    }

    pub fn internal_dir(&self) -> PathBuf {
        self.root.join(".annota")
    }

    pub fn database_path(&self) -> PathBuf {
        self.internal_dir().join("library.sqlite3")
    }

    pub fn transactions_dir(&self) -> PathBuf {
        self.internal_dir().join("transactions")
    }

    pub fn trash_dir(&self) -> PathBuf {
        self.internal_dir().join("trash")
    }

    pub fn diagnostics_dir(&self) -> PathBuf {
        self.internal_dir().join("diagnostics")
    }

    pub fn initialize(app_data_dir: &Path) -> Result<(Self, WorkspaceManifest), String> {
        let layout = Self::managed(app_data_dir);
        let manifest = if layout.manifest_path().is_file() {
            layout.open_existing_manifest()?
        } else {
            layout.create_manifest("我的 Annota 资料库")?
        };
        layout.migrate_legacy_data(app_data_dir)?;
        Ok((layout, manifest))
    }

    pub fn create_at(
        root: PathBuf,
        display_name: &str,
    ) -> Result<(Self, WorkspaceManifest), String> {
        let layout = Self::at(root);
        if layout.manifest_path().exists() {
            return Err("目标目录已经包含 Annota 工作区".to_string());
        }
        let manifest = layout.create_manifest(display_name)?;
        Ok((layout, manifest))
    }

    pub fn open_existing(root: PathBuf) -> Result<(Self, WorkspaceManifest), String> {
        let layout = Self::at(root);
        if !layout.manifest_path().is_file() {
            return Err("所选目录不包含 workspace.json，不能作为现有工作区添加".to_string());
        }
        let manifest = layout.open_existing_manifest()?;
        Ok((layout, manifest))
    }

    pub(crate) fn create_directories(&self) -> Result<(), String> {
        for directory in [
            self.notes_dir(),
            self.assets_dir(),
            self.transactions_dir(),
            self.trash_dir().join("notes"),
            self.trash_dir().join("assets"),
            self.diagnostics_dir(),
        ] {
            fs::create_dir_all(&directory)
                .map_err(|error| format!("无法创建工作区目录 {}：{error}", directory.display()))?;
        }
        Ok(())
    }

    fn open_existing_manifest(&self) -> Result<WorkspaceManifest, String> {
        self.create_directories()?;
        let path = self.manifest_path();
        let raw = fs::read_to_string(&path)
            .map_err(|error| format!("无法读取工作区 manifest：{error}"))?;
        let manifest: WorkspaceManifest = serde_json::from_str(&raw)
            .map_err(|error| format!("工作区 manifest 已损坏，原文件已保留：{error}"))?;
        manifest.validate()?;
        Ok(manifest)
    }

    fn create_manifest(&self, display_name: &str) -> Result<WorkspaceManifest, String> {
        let display_name = display_name.trim();
        if display_name.is_empty() || display_name.len() > 256 {
            return Err("工作区名称不能为空且长度不能超过 256".to_string());
        }
        self.create_directories()?;
        let path = self.manifest_path();
        let manifest = WorkspaceManifest {
            format: WORKSPACE_FORMAT.to_string(),
            workspace_id: Uuid::new_v4().to_string(),
            display_name: display_name.to_string(),
            workspace_format_version: WORKSPACE_FORMAT_VERSION,
            database_schema_version: DATABASE_SCHEMA_VERSION,
            content_layout_version: CONTENT_LAYOUT_VERSION,
            created_at: OffsetDateTime::now_utc()
                .format(&Rfc3339)
                .map_err(|error| format!("无法格式化工作区创建时间：{error}"))?,
            minimum_app_version: env!("CARGO_PKG_VERSION").to_string(),
        };
        durable_json_replace(&path, &manifest)
            .map_err(|error| format!("无法创建工作区 manifest：{error}"))?;
        Ok(manifest)
    }

    pub fn migrate_legacy_data(
        &self,
        app_data_dir: &Path,
    ) -> Result<LegacyMigrationReport, String> {
        let database_copied =
            copy_legacy_database(&app_data_dir.join("library.sqlite3"), &self.database_path())?;
        let documents_copied =
            copy_legacy_documents(&app_data_dir.join("vault").join("documents"), self)?;
        Ok(LegacyMigrationReport {
            database_copied,
            documents_copied,
        })
    }

    pub(crate) fn synchronize_database_schema_version(
        &self,
        manifest: &mut WorkspaceManifest,
    ) -> Result<(), String> {
        if manifest.database_schema_version == DATABASE_SCHEMA_VERSION {
            return Ok(());
        }
        if manifest.database_schema_version > DATABASE_SCHEMA_VERSION {
            return Err(format!(
                "数据库 schema 版本 {} 高于当前支持版本 {}",
                manifest.database_schema_version, DATABASE_SCHEMA_VERSION
            ));
        }
        manifest.database_schema_version = DATABASE_SCHEMA_VERSION;
        durable_json_replace(&self.manifest_path(), manifest)
            .map_err(|error| format!("无法更新工作区数据库版本：{error}"))
    }
}

impl WorkspaceManifest {
    fn validate(&self) -> Result<(), String> {
        if self.format != WORKSPACE_FORMAT {
            return Err(format!("不支持的工作区格式：{}", self.format));
        }
        if self.workspace_format_version > WORKSPACE_FORMAT_VERSION {
            return Err(format!(
                "工作区格式版本 {} 高于当前支持版本 {}",
                self.workspace_format_version, WORKSPACE_FORMAT_VERSION
            ));
        }
        if self.content_layout_version > CONTENT_LAYOUT_VERSION {
            return Err(format!(
                "正文目录版本 {} 高于当前支持版本 {}",
                self.content_layout_version, CONTENT_LAYOUT_VERSION
            ));
        }
        if self.database_schema_version > DATABASE_SCHEMA_VERSION {
            return Err(format!(
                "数据库 schema 版本 {} 高于当前支持版本 {}",
                self.database_schema_version, DATABASE_SCHEMA_VERSION
            ));
        }
        if self.workspace_id.trim().is_empty() {
            return Err("工作区 ID 不能为空".to_string());
        }
        Ok(())
    }
}

pub fn document_relative_path(document_id: &str) -> Result<PathBuf, String> {
    validate_document_id(document_id)?;
    let prefix = &document_id[..document_id.len().min(2)];
    Ok(PathBuf::from("notes")
        .join(prefix)
        .join(format!("{document_id}.md")))
}

fn validate_document_id(document_id: &str) -> Result<(), String> {
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

pub(crate) fn durable_json_replace<T: Serialize>(path: &Path, value: &T) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    if temporary.exists() {
        fs::remove_file(&temporary)?;
    }
    let content = serde_json::to_vec_pretty(value).map_err(io::Error::other)?;
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)?;
    file.write_all(&content)?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    drop(file);

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

fn copy_legacy_database(source: &Path, destination: &Path) -> Result<bool, String> {
    if !source.is_file() || destination.exists() {
        return Ok(false);
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "工作区数据库路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = destination.with_extension("sqlite3.migration-tmp");
    if temporary.exists() {
        fs::remove_file(&temporary).map_err(|error| error.to_string())?;
    }

    let result = (|| -> Result<(), String> {
        let source_connection = Connection::open_with_flags(
            source,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|error| format!("无法打开旧资料库数据库：{error}"))?;
        let mut destination_connection = Connection::open(&temporary)
            .map_err(|error| format!("无法创建工作区数据库快照：{error}"))?;
        {
            let backup = Backup::new(&source_connection, &mut destination_connection)
                .map_err(|error| format!("无法启动旧数据库迁移：{error}"))?;
            backup
                .run_to_completion(128, Duration::from_millis(10), None)
                .map_err(|error| format!("无法完成旧数据库迁移：{error}"))?;
        }
        destination_connection
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|error| format!("无法校验迁移数据库：{error}"))?;
        drop(destination_connection);
        OpenOptions::new()
            .read(true)
            .write(true)
            .open(&temporary)
            .and_then(|file| file.sync_all())
            .map_err(|error| format!("无法同步迁移数据库：{error}"))?;
        fs::rename(&temporary, destination)
            .map_err(|error| format!("无法提交迁移数据库：{error}"))?;
        Ok(())
    })();

    if result.is_err() && temporary.exists() {
        let _ = fs::remove_file(&temporary);
    }
    result.map(|_| true)
}

fn copy_legacy_documents(source: &Path, layout: &WorkspaceLayout) -> Result<usize, String> {
    if !source.is_dir() {
        return Ok(0);
    }
    let mut copied = 0;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }
        let Some(document_id) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        let relative_path = document_relative_path(document_id)?;
        let destination = layout.root().join(relative_path);
        if copy_file_without_overwrite(&path, &destination)
            .map_err(|error| format!("无法迁移 Markdown 文档 {document_id}：{error}"))?
        {
            copied += 1;
        }
    }
    Ok(copied)
}

fn copy_file_without_overwrite(source: &Path, destination: &Path) -> io::Result<bool> {
    if destination.exists() {
        return Ok(false);
    }
    let parent = destination
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "destination has no parent"))?;
    fs::create_dir_all(parent)?;
    let temporary = destination.with_extension("md.migration-tmp");
    if temporary.exists() {
        fs::remove_file(&temporary)?;
    }
    let mut input = File::open(source)?;
    let mut output = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)?;
    io::copy(&mut input, &mut output)?;
    output.sync_all()?;
    drop(output);
    match fs::rename(&temporary, destination) {
        Ok(()) => Ok(true),
        Err(_) if destination.exists() => {
            let _ = fs::remove_file(temporary);
            Ok(false)
        }
        Err(error) => {
            let _ = fs::remove_file(temporary);
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "annota-workspace-{label}-{}-{}",
                std::process::id(),
                Uuid::new_v4()
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
    fn creates_a_versioned_managed_workspace() {
        let directory = TestDirectory::new("create");
        let (layout, manifest) = WorkspaceLayout::initialize(&directory.0).unwrap();
        assert_eq!(manifest.format, WORKSPACE_FORMAT);
        assert_eq!(manifest.workspace_format_version, 1);
        assert_eq!(manifest.database_schema_version, 5);
        assert!(layout.manifest_path().is_file());
        assert!(layout.notes_dir().is_dir());
        assert!(layout.assets_dir().is_dir());
        assert!(layout.transactions_dir().is_dir());
        assert!(layout.trash_dir().join("notes").is_dir());
        assert!(layout.diagnostics_dir().is_dir());

        let (_, reloaded) = WorkspaceLayout::initialize(&directory.0).unwrap();
        assert_eq!(manifest.workspace_id, reloaded.workspace_id);
    }

    #[test]
    fn migrates_legacy_data_once_without_removing_the_source() {
        let directory = TestDirectory::new("migration");
        let legacy_documents = directory.0.join("vault/documents");
        fs::create_dir_all(&legacy_documents).unwrap();
        fs::write(legacy_documents.join("article-1.md"), "# 旧正文\n").unwrap();
        let legacy_database = directory.0.join("library.sqlite3");
        let connection = Connection::open(&legacy_database).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE legacy_value(value TEXT); INSERT INTO legacy_value VALUES ('kept');",
            )
            .unwrap();
        drop(connection);

        let layout = WorkspaceLayout::managed(&directory.0);
        layout.create_directories().unwrap();
        let first = layout.migrate_legacy_data(&directory.0).unwrap();
        assert_eq!(first.documents_copied, 1);
        assert!(first.database_copied);
        assert!(legacy_documents.join("article-1.md").is_file());
        assert!(legacy_database.is_file());
        assert_eq!(
            fs::read_to_string(layout.root().join("notes/ar/article-1.md")).unwrap(),
            "# 旧正文\n"
        );
        let migrated = Connection::open(layout.database_path()).unwrap();
        assert_eq!(
            migrated
                .query_row("SELECT value FROM legacy_value", [], |row| row
                    .get::<_, String>(0))
                .unwrap(),
            "kept"
        );
        drop(migrated);

        let second = layout.migrate_legacy_data(&directory.0).unwrap();
        assert_eq!(second, LegacyMigrationReport::default());
    }
}
