use crate::{
    markdown_store::MarkdownStore,
    topology_store::TopologyStore,
    transaction_journal::{RecoveryReport, TransactionJournal},
    workspace::{durable_json_replace, WorkspaceLayout, WorkspaceManifest},
};
use fs2::FileExt;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Seek, SeekFrom, Write},
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

const REGISTRY_FORMAT_VERSION: u32 = 1;

pub struct WorkspaceRuntime {
    registry_path: PathBuf,
    state: Mutex<RuntimeState>,
}

struct RuntimeState {
    registry: WorkspaceRegistry,
    active: ActiveWorkspace,
}

struct ActiveWorkspace {
    entry: WorkspaceEntry,
    layout: WorkspaceLayout,
    manifest: WorkspaceManifest,
    _lock: WorkspaceWriteLock,
    topology: TopologyStore,
    markdown: MarkdownStore,
    recovery: RecoveryReport,
    diagnostic: WorkspaceDiagnosticReport,
}

#[derive(Debug)]
struct WorkspaceWriteLock {
    file: File,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceRegistry {
    format_version: u32,
    active_workspace_id: String,
    workspaces: Vec<WorkspaceEntry>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntry {
    pub id: String,
    pub display_name: String,
    pub path: PathBuf,
    pub kind: String,
    pub last_opened_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub id: String,
    pub display_name: String,
    pub path: PathBuf,
    pub kind: String,
    pub last_opened_at: String,
    pub active: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCatalog {
    pub active_workspace_id: String,
    pub workspaces: Vec<WorkspaceSummary>,
    pub diagnostic: WorkspaceDiagnosticReport,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDiagnosticCheck {
    pub id: String,
    pub status: String,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDiagnosticReport {
    pub workspace_id: String,
    pub checked_at: String,
    pub status: String,
    pub checks: Vec<WorkspaceDiagnosticCheck>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LockDiagnostic<'a> {
    workspace_id: &'a str,
    instance_id: String,
    pid: u32,
    started_at: String,
    app_version: &'static str,
    mode: &'static str,
}

fn now() -> Result<String, String> {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|error| format!("无法格式化工作区时间：{error}"))
}

fn registry_path_key(path: &Path) -> String {
    let path = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let key = path.to_string_lossy().replace('/', "\\");
    if cfg!(windows) {
        key.to_lowercase()
    } else {
        key
    }
}

fn validate_registry(registry: &WorkspaceRegistry) -> Result<(), String> {
    if registry.format_version > REGISTRY_FORMAT_VERSION {
        return Err(format!(
            "工作区注册表版本 {} 高于当前支持版本 {}",
            registry.format_version, REGISTRY_FORMAT_VERSION
        ));
    }
    let mut ids = HashSet::new();
    let mut paths = HashSet::new();
    for entry in &registry.workspaces {
        if entry.id.trim().is_empty()
            || entry.display_name.trim().is_empty()
            || !entry.path.is_absolute()
            || !matches!(entry.kind.as_str(), "managed" | "user")
            || !ids.insert(&entry.id)
            || !paths.insert(registry_path_key(&entry.path))
        {
            return Err("工作区注册表包含无效或重复记录，原文件已保留".to_string());
        }
    }
    if !ids.contains(&registry.active_workspace_id) {
        return Err("工作区注册表引用了不存在的活动工作区，原文件已保留".to_string());
    }
    Ok(())
}

fn load_registry(path: &Path) -> Result<Option<WorkspaceRegistry>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path).map_err(|error| format!("无法读取工作区注册表：{error}"))?;
    let registry: WorkspaceRegistry = serde_json::from_str(&raw)
        .map_err(|error| format!("工作区注册表已损坏，原文件已保留：{error}"))?;
    validate_registry(&registry)?;
    Ok(Some(registry))
}

fn save_registry(path: &Path, registry: &WorkspaceRegistry) -> Result<(), String> {
    validate_registry(registry)?;
    durable_json_replace(path, registry).map_err(|error| format!("无法保存工作区注册表：{error}"))
}

impl WorkspaceWriteLock {
    fn acquire(layout: &WorkspaceLayout, manifest: &WorkspaceManifest) -> Result<Self, String> {
        let path = layout.internal_dir().join("lock.json");
        let mut file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(&path)
            .map_err(|error| format!("无法打开工作区锁 {}：{error}", path.display()))?;
        file.try_lock_exclusive()
            .map_err(|_| "工作区正被另一个 Annota 实例以写入模式使用".to_string())?;
        let diagnostic = LockDiagnostic {
            workspace_id: &manifest.workspace_id,
            instance_id: Uuid::new_v4().to_string(),
            pid: std::process::id(),
            started_at: now()?,
            app_version: env!("CARGO_PKG_VERSION"),
            mode: "write",
        };
        let payload = serde_json::to_vec_pretty(&diagnostic)
            .map_err(|error| format!("无法序列化工作区锁：{error}"))?;
        file.set_len(0)
            .and_then(|_| file.seek(SeekFrom::Start(0)))
            .and_then(|_| file.write_all(&payload))
            .and_then(|_| file.write_all(b"\n"))
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("无法写入工作区锁诊断：{error}"))?;
        Ok(Self { file })
    }
}

impl Drop for WorkspaceWriteLock {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.file);
    }
}

fn safe_workspace_relative_path(path: &str) -> bool {
    let path = Path::new(path);
    !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
        && path.starts_with("notes")
}

fn diagnose_workspace(
    layout: &WorkspaceLayout,
    manifest: &WorkspaceManifest,
    recovery: &RecoveryReport,
) -> Result<WorkspaceDiagnosticReport, String> {
    let mut checks = vec![WorkspaceDiagnosticCheck {
        id: "manifest".into(),
        status: "ok".into(),
        message: "workspace.json 格式与版本有效".into(),
    }];

    let probe = layout
        .diagnostics_dir()
        .join(format!("write-probe-{}", Uuid::new_v4()));
    match OpenOptions::new().create_new(true).write(true).open(&probe) {
        Ok(mut file) => {
            let result = file
                .write_all(b"annota-workspace-probe\n")
                .and_then(|_| file.sync_all());
            drop(file);
            let _ = fs::remove_file(&probe);
            match result {
                Ok(()) => checks.push(WorkspaceDiagnosticCheck {
                    id: "writable".into(),
                    status: "ok".into(),
                    message: "工作区内部目录可写".into(),
                }),
                Err(error) => checks.push(WorkspaceDiagnosticCheck {
                    id: "writable".into(),
                    status: "error".into(),
                    message: format!("工作区同步写入失败：{error}"),
                }),
            }
        }
        Err(error) => checks.push(WorkspaceDiagnosticCheck {
            id: "writable".into(),
            status: "error".into(),
            message: format!("工作区不可写：{error}"),
        }),
    }

    let connection = Connection::open(layout.database_path())
        .map_err(|error| format!("无法打开工作区数据库进行诊断：{error}"))?;
    let quick_check = connection
        .query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
        .map_err(|error| format!("SQLite quick_check 失败：{error}"))?;
    checks.push(WorkspaceDiagnosticCheck {
        id: "sqlite-quick-check".into(),
        status: if quick_check == "ok" { "ok" } else { "error" }.into(),
        message: if quick_check == "ok" {
            "SQLite quick_check 通过".into()
        } else {
            format!("SQLite quick_check 报告：{quick_check}")
        },
    });

    let foreign_key_issues = {
        let mut statement = connection
            .prepare("PRAGMA foreign_key_check")
            .map_err(|error| error.to_string())?;
        let issue_count = statement
            .query_map([], |_| Ok(()))
            .map_err(|error| error.to_string())?
            .count();
        issue_count
    };
    checks.push(WorkspaceDiagnosticCheck {
        id: "foreign-keys".into(),
        status: if foreign_key_issues == 0 {
            "ok"
        } else {
            "error"
        }
        .into(),
        message: if foreign_key_issues == 0 {
            "SQLite 外键引用有效".into()
        } else {
            format!("发现 {foreign_key_issues} 个 SQLite 外键问题")
        },
    });

    let mut missing_documents = 0_usize;
    let mut unsafe_documents = 0_usize;
    {
        let mut statement = connection
            .prepare("SELECT relative_path FROM documents ORDER BY id")
            .map_err(|error| error.to_string())?;
        let paths = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        for relative_path in paths {
            let relative_path = relative_path.map_err(|error| error.to_string())?;
            if !safe_workspace_relative_path(&relative_path) {
                unsafe_documents += 1;
            } else if !layout.root().join(relative_path).is_file() {
                missing_documents += 1;
            }
        }
    }
    checks.push(WorkspaceDiagnosticCheck {
        id: "documents".into(),
        status: if unsafe_documents > 0 {
            "error"
        } else if missing_documents > 0 {
            "warning"
        } else {
            "ok"
        }
        .into(),
        message: if unsafe_documents > 0 {
            format!("发现 {unsafe_documents} 个不安全的正文相对路径")
        } else if missing_documents > 0 {
            format!("发现 {missing_documents} 个缺失的 Markdown 正文")
        } else {
            "SQLite 登记的 Markdown 正文均存在".into()
        },
    });

    let transaction_state = TransactionJournal::new(
        layout.root().to_path_buf(),
        layout.database_path(),
    )
    .inspect_state()?;
    let transaction_clean = transaction_state.pending_operations == 0
        && transaction_state.journal_files == 0
        && transaction_state.operation_artifacts == 0;
    checks.push(WorkspaceDiagnosticCheck {
        id: "transactions".into(),
        status: if transaction_clean { "ok" } else { "error" }.into(),
        message: if transaction_clean {
            "没有未完成的 Markdown transaction".into()
        } else {
            format!(
                "发现 {} 个 pending、{} 个 journal、{} 个 staging/backup 残留",
                transaction_state.pending_operations,
                transaction_state.journal_files,
                transaction_state.operation_artifacts
            )
        },
    });

    let recovery_events = recovery.recovered_operations
        + recovery.finalized_operations
        + recovery.rolled_back_operations;
    checks.push(WorkspaceDiagnosticCheck {
        id: "startup-recovery".into(),
        status: if recovery.rolled_back_operations > 0 {
            "warning"
        } else {
            "ok"
        }
        .into(),
        message: if recovery_events == 0 {
            "本次会话启动时没有待恢复的 Markdown operation".into()
        } else {
            format!(
                "本次启动续写 {} 个、finalize {} 个、回滚 {} 个 Markdown operation",
                recovery.recovered_operations,
                recovery.finalized_operations,
                recovery.rolled_back_operations
            )
        },
    });

    let status = if checks.iter().any(|check| check.status == "error") {
        "error"
    } else if checks.iter().any(|check| check.status == "warning") {
        "warning"
    } else {
        "healthy"
    };
    let report = WorkspaceDiagnosticReport {
        workspace_id: manifest.workspace_id.clone(),
        checked_at: now()?,
        status: status.into(),
        checks,
    };
    durable_json_replace(&layout.diagnostics_dir().join("last-check.json"), &report)
        .map_err(|error| format!("无法保存工作区诊断：{error}"))?;
    Ok(report)
}

impl ActiveWorkspace {
    fn open(entry: WorkspaceEntry) -> Result<Self, String> {
        let (layout, mut manifest) = WorkspaceLayout::open_existing(entry.path.clone())?;
        if manifest.workspace_id != entry.id {
            return Err("工作区注册表 ID 与 workspace.json 不一致".to_string());
        }
        let write_lock = WorkspaceWriteLock::acquire(&layout, &manifest)?;
        let topology = TopologyStore::open(layout.database_path())?;
        layout.synchronize_database_schema_version(&mut manifest)?;
        let recovery = TransactionJournal::new(
            layout.root().to_path_buf(),
            layout.database_path(),
        )
        .recover_pending_operations()?;
        let markdown = MarkdownStore::new(layout.root().to_path_buf(), layout.database_path());
        let diagnostic = diagnose_workspace(&layout, &manifest, &recovery)?;
        Ok(Self {
            entry,
            layout,
            manifest,
            _lock: write_lock,
            topology,
            markdown,
            recovery,
            diagnostic,
        })
    }
}

impl WorkspaceRuntime {
    pub fn initialize(app_data_dir: PathBuf, app_config_dir: PathBuf) -> Result<Self, String> {
        let (managed_layout, managed_manifest) = WorkspaceLayout::initialize(&app_data_dir)?;
        let registry_path = app_config_dir.join("workspaces.json");
        let timestamp = now()?;
        let managed_entry = WorkspaceEntry {
            id: managed_manifest.workspace_id.clone(),
            display_name: managed_manifest.display_name.clone(),
            path: managed_layout.root().to_path_buf(),
            kind: "managed".into(),
            last_opened_at: timestamp,
        };
        let mut registry = load_registry(&registry_path)?.unwrap_or_else(|| WorkspaceRegistry {
            format_version: REGISTRY_FORMAT_VERSION,
            active_workspace_id: managed_entry.id.clone(),
            workspaces: vec![managed_entry.clone()],
        });
        if let Some(existing) = registry
            .workspaces
            .iter_mut()
            .find(|entry| entry.id == managed_entry.id)
        {
            existing.path = managed_entry.path.clone();
            existing.display_name = managed_entry.display_name.clone();
            existing.kind = "managed".into();
        } else {
            registry.workspaces.push(managed_entry.clone());
        }
        if !registry
            .workspaces
            .iter()
            .any(|entry| entry.id == registry.active_workspace_id)
        {
            registry.active_workspace_id = managed_entry.id.clone();
        }
        let active_entry = registry
            .workspaces
            .iter()
            .find(|entry| entry.id == registry.active_workspace_id)
            .cloned()
            .ok_or_else(|| "活动工作区记录不存在".to_string())?;
        let active = ActiveWorkspace::open(active_entry)?;
        save_registry(&registry_path, &registry)?;
        Ok(Self {
            registry_path,
            state: Mutex::new(RuntimeState { registry, active }),
        })
    }

    fn state(&self) -> Result<std::sync::MutexGuard<'_, RuntimeState>, String> {
        self.state
            .lock()
            .map_err(|_| "WorkspaceRuntime 锁已损坏".to_string())
    }

    pub fn with_topology<T>(
        &self,
        operation: impl FnOnce(&TopologyStore) -> Result<T, String>,
    ) -> Result<T, String> {
        operation(&self.state()?.active.topology)
    }

    pub fn with_markdown<T>(
        &self,
        operation: impl FnOnce(&MarkdownStore) -> Result<T, String>,
    ) -> Result<T, String> {
        operation(&self.state()?.active.markdown)
    }

    pub fn catalog(&self) -> Result<WorkspaceCatalog, String> {
        let state = self.state()?;
        Ok(catalog_from_state(&state))
    }

    pub fn create_workspace(
        &self,
        root: PathBuf,
        display_name: String,
    ) -> Result<WorkspaceCatalog, String> {
        if !root.is_absolute() {
            return Err("新工作区路径必须是绝对路径".to_string());
        }
        if root.exists()
            && fs::read_dir(&root)
                .map_err(|error| format!("无法检查目标目录：{error}"))?
                .next()
                .is_some()
        {
            return Err("新工作区目录必须为空".to_string());
        }
        let (layout, manifest) = WorkspaceLayout::create_at(root, &display_name)?;
        let canonical_root = fs::canonicalize(layout.root())
            .map_err(|error| format!("无法解析新工作区路径：{error}"))?;
        self.activate_candidate(WorkspaceEntry {
            id: manifest.workspace_id,
            display_name: manifest.display_name,
            path: canonical_root,
            kind: "user".into(),
            last_opened_at: now()?,
        })
    }

    pub fn add_existing_workspace(&self, root: PathBuf) -> Result<WorkspaceCatalog, String> {
        if !root.is_absolute() {
            return Err("工作区路径必须是绝对路径".to_string());
        }
        let canonical_root =
            fs::canonicalize(&root).map_err(|error| format!("无法解析工作区路径：{error}"))?;
        let (_, manifest) = WorkspaceLayout::open_existing(canonical_root.clone())?;
        let kind = {
            let state = self.state()?;
            if state.active.entry.id == manifest.workspace_id
                && registry_path_key(&state.active.entry.path) == registry_path_key(&canonical_root)
            {
                return Ok(catalog_from_state(&state));
            }
            if state.registry.workspaces.iter().any(|entry| {
                entry.id != manifest.workspace_id
                    && registry_path_key(&entry.path) == registry_path_key(&canonical_root)
            }) {
                return Err("该目录已由另一个工作区记录占用".to_string());
            }
            state
                .registry
                .workspaces
                .iter()
                .find(|entry| entry.id == manifest.workspace_id)
                .map(|entry| entry.kind.clone())
                .unwrap_or_else(|| "user".to_string())
        };
        self.activate_candidate(WorkspaceEntry {
            id: manifest.workspace_id,
            display_name: manifest.display_name,
            path: canonical_root,
            kind,
            last_opened_at: now()?,
        })
    }

    pub fn switch_workspace(&self, workspace_id: &str) -> Result<WorkspaceCatalog, String> {
        let entry = {
            let state = self.state()?;
            if state.active.entry.id == workspace_id {
                return Ok(catalog_from_state(&state));
            }
            state
                .registry
                .workspaces
                .iter()
                .find(|entry| entry.id == workspace_id)
                .cloned()
                .ok_or_else(|| "工作区不在注册表中".to_string())?
        };
        self.activate_candidate(WorkspaceEntry {
            last_opened_at: now()?,
            ..entry
        })
    }

    fn activate_candidate(&self, entry: WorkspaceEntry) -> Result<WorkspaceCatalog, String> {
        let candidate = ActiveWorkspace::open(entry.clone())?;
        let mut state = self.state()?;
        if state.registry.workspaces.iter().any(|existing| {
            registry_path_key(&existing.path) == registry_path_key(&entry.path)
                && existing.id != entry.id
        }) {
            return Err("该目录已由另一个工作区记录占用".to_string());
        }
        let mut registry = state.registry.clone();
        if let Some(existing) = registry
            .workspaces
            .iter_mut()
            .find(|existing| existing.id == entry.id)
        {
            *existing = entry.clone();
        } else {
            registry.workspaces.push(entry.clone());
        }
        registry.active_workspace_id = entry.id.clone();
        save_registry(&self.registry_path, &registry)?;
        state.registry = registry;
        state.active = candidate;
        Ok(catalog_from_state(&state))
    }

    pub fn remove_workspace(&self, workspace_id: &str) -> Result<WorkspaceCatalog, String> {
        let mut state = self.state()?;
        if state.active.entry.id == workspace_id {
            return Err("不能从列表移除当前活动工作区".to_string());
        }
        if state
            .registry
            .workspaces
            .iter()
            .any(|entry| entry.id == workspace_id && entry.kind == "managed")
        {
            return Err("不能从列表移除 Annota 管理的默认工作区".to_string());
        }
        let mut registry = state.registry.clone();
        let original_len = registry.workspaces.len();
        registry.workspaces.retain(|entry| entry.id != workspace_id);
        if registry.workspaces.len() == original_len {
            return Err("工作区不在注册表中".to_string());
        }
        save_registry(&self.registry_path, &registry)?;
        state.registry = registry;
        Ok(catalog_from_state(&state))
    }

    pub fn diagnose_active(&self) -> Result<WorkspaceDiagnosticReport, String> {
        let mut state = self.state()?;
        let report = diagnose_workspace(
            &state.active.layout,
            &state.active.manifest,
            &state.active.recovery,
        )?;
        state.active.diagnostic = report.clone();
        Ok(report)
    }
}

fn catalog_from_state(state: &RuntimeState) -> WorkspaceCatalog {
    WorkspaceCatalog {
        active_workspace_id: state.active.entry.id.clone(),
        workspaces: state
            .registry
            .workspaces
            .iter()
            .map(|entry| WorkspaceSummary {
                id: entry.id.clone(),
                display_name: entry.display_name.clone(),
                path: entry.path.clone(),
                kind: entry.kind.clone(),
                last_opened_at: entry.last_opened_at.clone(),
                active: entry.id == state.active.entry.id,
            })
            .collect(),
        diagnostic: state.active.diagnostic.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "annota-runtime-{label}-{}-{}",
                std::process::id(),
                Uuid::new_v4()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn an_os_lock_allows_only_one_writer() {
        let directory = TestDirectory::new("lock");
        let (layout, manifest) =
            WorkspaceLayout::create_at(directory.0.join("workspace"), "锁测试").unwrap();
        let first = WorkspaceWriteLock::acquire(&layout, &manifest).unwrap();
        let error = WorkspaceWriteLock::acquire(&layout, &manifest).unwrap_err();
        assert!(error.contains("另一个 Annota 实例"));
        drop(first);
        WorkspaceWriteLock::acquire(&layout, &manifest).unwrap();
    }

    #[test]
    fn creates_switches_and_unregisters_without_deleting_user_data() {
        let directory = TestDirectory::new("registry");
        let runtime =
            WorkspaceRuntime::initialize(directory.0.join("data"), directory.0.join("config"))
                .unwrap();
        let managed_id = runtime.catalog().unwrap().active_workspace_id;
        let user_root = directory.0.join("user-workspace");
        let created = runtime
            .create_workspace(user_root.clone(), "第二资料库".into())
            .unwrap();
        let user_id = created.active_workspace_id.clone();
        assert_ne!(managed_id, user_id);
        assert_eq!(created.workspaces.len(), 2);
        assert!(user_root.join("workspace.json").is_file());
        assert!(runtime
            .remove_workspace(&managed_id)
            .unwrap_err()
            .contains("默认工作区"));

        runtime.switch_workspace(&managed_id).unwrap();
        let catalog = runtime.remove_workspace(&user_id).unwrap();
        assert_eq!(catalog.workspaces.len(), 1);
        assert!(user_root.join("workspace.json").is_file());

        let readded = runtime.add_existing_workspace(user_root).unwrap();
        assert_eq!(readded.active_workspace_id, user_id);
        let duplicate_add = runtime
            .add_existing_workspace(readded.workspaces[1].path.clone())
            .unwrap();
        assert_eq!(duplicate_add.workspaces.len(), 2);
    }

    #[test]
    fn registry_rejects_duplicate_paths() {
        let directory = TestDirectory::new("duplicate-path");
        let path = directory.0.join("workspace");
        let registry = WorkspaceRegistry {
            format_version: REGISTRY_FORMAT_VERSION,
            active_workspace_id: "first".into(),
            workspaces: vec![
                WorkspaceEntry {
                    id: "first".into(),
                    display_name: "一".into(),
                    path: path.clone(),
                    kind: "user".into(),
                    last_opened_at: "now".into(),
                },
                WorkspaceEntry {
                    id: "second".into(),
                    display_name: "二".into(),
                    path,
                    kind: "user".into(),
                    last_opened_at: "now".into(),
                },
            ],
        };
        assert!(validate_registry(&registry)
            .unwrap_err()
            .contains("重复记录"));
    }

    #[test]
    fn reports_missing_documents_without_following_unsafe_paths() {
        let directory = TestDirectory::new("diagnostic");
        let runtime =
            WorkspaceRuntime::initialize(directory.0.join("data"), directory.0.join("config"))
                .unwrap();
        runtime
            .with_topology(|store| {
                let connection = store.connection()?;
                connection
                    .execute(
                        "INSERT INTO documents (id, relative_path, content_hash, byte_length) VALUES ('missing', 'notes/mi/missing.md', 'hash', 1)",
                        [],
                    )
                    .map_err(|error| error.to_string())?;
                Ok(())
            })
            .unwrap();
        let report = runtime.diagnose_active().unwrap();
        assert_eq!(report.status, "warning");
        assert!(report
            .checks
            .iter()
            .any(|check| check.id == "documents" && check.message.contains("1 个缺失")));
    }
}
