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
