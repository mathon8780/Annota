import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type WorkspaceKind = "managed" | "user";
export type WorkspaceHealth = "healthy" | "warning" | "error";

export interface WorkspaceDiagnosticCheck {
  id: string;
  status: "ok" | "warning" | "error";
  message: string;
}

export interface WorkspaceDiagnosticReport {
  workspaceId: string;
  checkedAt: string;
  status: WorkspaceHealth;
  checks: WorkspaceDiagnosticCheck[];
}

export interface WorkspaceSummary {
  id: string;
  displayName: string;
  path: string;
  kind: WorkspaceKind;
  lastOpenedAt: string;
  active: boolean;
}

export interface WorkspaceCatalog {
  activeWorkspaceId: string;
  workspaces: WorkspaceSummary[];
  diagnostic: WorkspaceDiagnosticReport;
}

function requireDesktop() {
  if (!isTauri()) throw new Error("工作区目录管理仅在桌面应用中可用");
}

export async function listWorkspaces(): Promise<WorkspaceCatalog> {
  requireDesktop();
  return invoke<WorkspaceCatalog>("list_workspaces");
}

export async function createWorkspace(
  path: string,
  displayName: string
): Promise<WorkspaceCatalog> {
  requireDesktop();
  return invoke<WorkspaceCatalog>("create_workspace", { path, displayName });
}

export async function addExistingWorkspace(path: string): Promise<WorkspaceCatalog> {
  requireDesktop();
  return invoke<WorkspaceCatalog>("add_existing_workspace", { path });
}

export async function switchWorkspace(workspaceId: string): Promise<WorkspaceCatalog> {
  requireDesktop();
  return invoke<WorkspaceCatalog>("switch_workspace", { workspaceId });
}

export async function removeWorkspace(workspaceId: string): Promise<WorkspaceCatalog> {
  requireDesktop();
  return invoke<WorkspaceCatalog>("remove_workspace", { workspaceId });
}

export async function diagnoseWorkspace(): Promise<WorkspaceDiagnosticReport> {
  requireDesktop();
  return invoke<WorkspaceDiagnosticReport>("diagnose_workspace");
}

export async function pickWorkspaceDirectory(title: string): Promise<string | null> {
  requireDesktop();
  const selected = await open({
    title,
    directory: true,
    multiple: false,
    canCreateDirectories: true
  });
  return typeof selected === "string" ? selected : null;
}
