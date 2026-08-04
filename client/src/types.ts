export type RepoFolder = {
  id: string;
  name: string;
  path: string;
  depth: number;
  child_count: number;
  parent?: string;
  description: string;
  category: NodeCategory;
  category_reason: string;
};

export type NodeCategory =
  | "Overview"
  | "Entry Point"
  | "UI / Presentation"
  | "API / Interface"
  | "Domain / Core Logic"
  | "Data / Persistence"
  | "Infrastructure / Configuration"
  | "Shared / Utilities"
  | "Testing / Quality"
  | "Documentation / Examples";

export type RepoEdge = {
  parent_id: string;
  child_id: string;
  label: string;
};

export type RepoTreeResponse = {
  repo: string;
  source_url: string;
  folders: RepoFolder[];
  explanation: string;
  original_folder_count: number;
  pruning_criteria: string[];
  edges: RepoEdge[];
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
