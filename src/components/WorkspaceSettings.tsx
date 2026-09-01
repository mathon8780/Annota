import { useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  Database,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  XCircle
} from "lucide-react";
import { useAppStore } from "../store/AppStore";
import { pickWorkspaceDirectory } from "../utils/workspaceRepository";
import type {
  WorkspaceDiagnosticCheck,
  WorkspaceHealth
} from "../utils/workspaceRepository";

const healthCopy: Record<WorkspaceHealth, { label: string; detail: string }> = {
  healthy: { label: "状态良好", detail: "目录、数据库与正文引用均已通过检查" },
  warning: { label: "需要留意", detail: "工作区可用，但有项目需要人工确认" },
  error: { label: "检查失败", detail: "工作区存在会影响可靠读写的问题" }
};

function CheckIcon({ status }: Pick<WorkspaceDiagnosticCheck, "status">) {
  if (status === "error") return <XCircle aria-hidden="true" size={15} />;
  if (status === "warning") return <TriangleAlert aria-hidden="true" size={15} />;
  return <CheckCircle2 aria-hidden="true" size={15} />;
}

export function WorkspaceSettings() {
  const {
    workspaceCatalog,
    workspaceBusy,
    workspaceError,
    createWorkspaceAt,
    addWorkspaceFrom,
    activateWorkspace,
    forgetWorkspace,
    runWorkspaceDiagnostics
  } = useAppStore();
  const [displayName, setDisplayName] = useState("我的知识库");
  const [localMessage, setLocalMessage] = useState("");

  if (!workspaceCatalog) {
    return (
      <div className="workspace-settings-empty" role="note">
        <Database aria-hidden="true" size={22} />
        <div>
          <strong>浏览器预览不管理磁盘工作区</strong>
          <p>请在 Annota 桌面应用中创建、添加或切换知识库目录。</p>
        </div>
      </div>
    );
  }

  const active =
    workspaceCatalog.workspaces.find((workspace) => workspace.active) ??
    workspaceCatalog.workspaces[0];
  const health = healthCopy[workspaceCatalog.diagnostic.status];

  const chooseAndCreate = async () => {
    const name = displayName.trim();
    if (!name) {
      setLocalMessage("先填写新工作区名称。");
      return;
    }
    try {
      const path = await pickWorkspaceDirectory("选择一个空目录作为新工作区");
      if (!path) return;
      const changed = await createWorkspaceAt(path, name);
      setLocalMessage(changed ? `已创建并切换到“${name}”。` : "");
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const chooseAndAdd = async () => {
    try {
      const path = await pickWorkspaceDirectory("选择包含 workspace.json 的工作区");
      if (!path) return;
      const changed = await addWorkspaceFrom(path);
      setLocalMessage(changed ? "已添加并切换到所选工作区。" : "");
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="workspace-settings">
      <section className="workspace-current" aria-label="当前工作区">
        <div className="workspace-current-mark" aria-hidden="true">
          <Database size={18} />
        </div>
        <div className="workspace-current-copy">
          <span>正在使用</span>
          <h3>{active.displayName}</h3>
          <code title={active.path}>{active.path}</code>
        </div>
        <div className={`workspace-health is-${workspaceCatalog.diagnostic.status}`}>
          <ShieldCheck aria-hidden="true" size={17} />
          <span>
            <strong>{health.label}</strong>
            <small>{health.detail}</small>
          </span>
        </div>
      </section>

      {(workspaceError || localMessage) && (
        <div
          className={`workspace-operation-message${workspaceError ? " is-error" : ""}`}
          role={workspaceError ? "alert" : "status"}
        >
          {workspaceError || localMessage}
        </div>
      )}

      <section className="workspace-actions" aria-labelledby="workspace-actions-title">
        <header>
          <div>
            <span>目录入口</span>
            <h3 id="workspace-actions-title">建立或接入资料库</h3>
          </div>
          <small>所有正文留在所选目录；移出列表不会删除文件。</small>
        </header>
        <div className="workspace-action-grid">
          <label className="workspace-name-field">
            <span>新工作区名称</span>
            <input
              value={displayName}
              maxLength={80}
              disabled={workspaceBusy}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <button
            className="workspace-primary-action"
            type="button"
            disabled={workspaceBusy}
            onClick={() => void chooseAndCreate()}
          >
            <FolderPlus aria-hidden="true" size={17} />
            选择空目录并创建
          </button>
          <button
            className="workspace-secondary-action"
            type="button"
            disabled={workspaceBusy}
            onClick={() => void chooseAndAdd()}
          >
            <FolderOpen aria-hidden="true" size={17} />
            添加已有工作区
          </button>
        </div>
      </section>

      <section className="workspace-registry" aria-labelledby="workspace-registry-title">
        <header>
          <div>
            <span>已登记目录</span>
            <h3 id="workspace-registry-title">工作区列表</h3>
          </div>
          <strong>{workspaceCatalog.workspaces.length.toString().padStart(2, "0")}</strong>
        </header>
        <div className="workspace-registry-list">
          {workspaceCatalog.workspaces.map((workspace) => (
            <article
              className={`workspace-registry-entry${workspace.active ? " is-active" : ""}`}
              key={workspace.id}
            >
              <div className="workspace-entry-index" aria-hidden="true">
                {workspace.active ? "LIVE" : workspace.kind === "managed" ? "BASE" : "USER"}
              </div>
              <div className="workspace-entry-copy">
                <div>
                  <h4>{workspace.displayName}</h4>
                  <span>{workspace.kind === "managed" ? "Annota 管理" : "用户目录"}</span>
                </div>
                <code title={workspace.path}>{workspace.path}</code>
              </div>
              <div className="workspace-entry-actions">
                {workspace.active ? (
                  <span className="workspace-active-label">
                    <CheckCircle2 aria-hidden="true" size={14} /> 当前
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={workspaceBusy}
                    onClick={() => void activateWorkspace(workspace.id)}
                  >
                    <ArrowRightLeft aria-hidden="true" size={14} /> 切换
                  </button>
                )}
                {!workspace.active && workspace.kind === "user" && (
                  <button
                    className="is-quiet-danger"
                    type="button"
                    title="只移出列表，不删除目录中的文件"
                    disabled={workspaceBusy}
                    onClick={() => void forgetWorkspace(workspace.id)}
                  >
                    <Trash2 aria-hidden="true" size={14} /> 移出列表
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="workspace-diagnostics" aria-labelledby="workspace-diagnostics-title">
        <header>
          <div>
            <span>最近一次检查</span>
            <h3 id="workspace-diagnostics-title">数据完整性</h3>
          </div>
          <button
            type="button"
            disabled={workspaceBusy}
            onClick={() => void runWorkspaceDiagnostics()}
          >
            <RefreshCw
              aria-hidden="true"
              className={workspaceBusy ? "is-spinning" : undefined}
              size={15}
            />
            重新检查
          </button>
        </header>
        <div className="workspace-check-list">
          {workspaceCatalog.diagnostic.checks.map((check) => (
            <div className={`workspace-check is-${check.status}`} key={check.id}>
              <CheckIcon status={check.status} />
              <span>{check.message}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
