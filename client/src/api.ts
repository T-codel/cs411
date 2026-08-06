import type { ExplainResponse, GuideResponse, NodeCategory, RepoFolder, RepoTreeResponse } from "@/types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const NODE_CATEGORIES = new Set<NodeCategory>([
  "Overview", "Entry Point", "UI / Presentation", "API / Interface", "Domain / Core Logic",
  "Data / Persistence", "Infrastructure / Configuration", "Shared / Utilities",
  "Testing / Quality", "Documentation / Examples",
]);

function normalizeRepoTree(payload: unknown): RepoTreeResponse {
  if (!payload || typeof payload !== "object") throw new Error("Backend returned an invalid repository response.");
  const value = payload as Record<string, unknown>;
  if (!Array.isArray(value.folders)) throw new Error("Backend response is missing folders.");

  const folders: RepoFolder[] = value.folders.map((raw, index) => {
    const folder = raw as Record<string, unknown>;
    const category = String(folder.category ?? "Overview") as NodeCategory;
    if (!NODE_CATEGORIES.has(category)) throw new Error(`Backend returned an invalid category for folder ${String(folder.path ?? index)}.`);
    return {
      id: String(folder.id ?? `folder-${index}`),
      name: String(folder.name ?? folder.path ?? "folder"),
      path: String(folder.path ?? ""),
      depth: Number(folder.depth) || 0,
      child_count: Number(folder.child_count) || 0,
      ...(folder.parent ? { parent: String(folder.parent) } : {}),
      description: String(folder.description ?? "No description is available."),
      category,
      category_reason: String(folder.category_reason ?? ""),
    };
  });
  const ids = new Set(folders.map((folder) => folder.id));
  const rawEdges = Array.isArray(value.edges) ? value.edges : [];
  const edges = rawEdges
    .map((raw) => raw as Record<string, unknown>)
    .filter((edge) => ids.has(String(edge.parent_id)) && ids.has(String(edge.child_id)))
    .map((edge) => ({
      parent_id: String(edge.parent_id),
      child_id: String(edge.child_id),
      label: String(edge.label ?? "contains").trim() || "contains",
    }));

  return {
    repo: String(value.repo ?? "unknown repository"),
    source_url: String(value.source_url ?? ""),
    folders,
    edges,
    explanation: String(value.explanation ?? ""),
    original_folder_count: Number(value.original_folder_count) || folders.length,
    pruning_criteria: Array.isArray(value.pruning_criteria) ? value.pruning_criteria.map(String) : [],
  };
}

export async function analyzeRepository(repoUrl: string): Promise<RepoTreeResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}/api/repo-tree`, {
      body: JSON.stringify({ repo_url: repoUrl }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  } catch {
    throw new Error(`Could not reach the FastAPI backend at ${API_URL}. Make sure it is running on port 8000.`);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.detail ?? `Request failed with ${response.status}`);
  }

  return normalizeRepoTree(payload);
}

export async function explainRepository(repo: string, folders: RepoFolder[]): Promise<ExplainResponse> {
  const response = await fetch(`${API_URL}/api/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, folders }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.detail ?? `Request failed with ${response.status}`);
  if (!payload || typeof payload.explanation !== "string") throw new Error("Backend returned an invalid explanation.");
  return { explanation: payload.explanation };
}

export async function guideRepository(repo: string, folders: RepoFolder[]): Promise<GuideResponse> {
  const response = await fetch(`${API_URL}/api/guide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, folders }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.detail ?? `Request failed with ${response.status}`);
  if (!payload || !Array.isArray(payload.steps)) throw new Error("Backend returned an invalid guide.");
  return {
    steps: payload.steps.map((step: Record<string, unknown>, index: number) => ({
      folder_id: String(step.folder_id ?? ""),
      folder_path: String(step.folder_path ?? "(root)"),
      order: Number(step.order) || index + 1,
      reason: String(step.reason ?? ""),
    })),
  };
}
