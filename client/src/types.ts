export type RepoFolder = {
  id: string;
  name: string;
  path: string;
  depth: number;
  child_count: number;
  parent?: string;
};

export type RepoTreeResponse = {
  repo: string;
  source_url: string;
  folders: RepoFolder[];
};

export type ExplainResponse = {
  explanation: string;
};

export type GuideStep = {
  folder_id: string;
  folder_path: string;
  order: number;
  reason: string;
};

export type GuideResponse = {
  steps: GuideStep[];
};