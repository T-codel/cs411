import type { RepoTreeResponse } from "@/types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

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

  return payload;
}
