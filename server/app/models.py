from pydantic import BaseModel


class RepoTreeRequest(BaseModel):
    repo_url: str


class RepoFolder(BaseModel):
    id: str
    name: str
    path: str
    depth: int
    child_count: int
    parent: str | None = None


class RepoTreeResponse(BaseModel):
    repo: str
    source_url: str
    folders: list[RepoFolder]
