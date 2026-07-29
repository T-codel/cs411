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

class ExplainRequest(BaseModel):
    repo: str
    folders: list[RepoFolder]


class ExplainResponse(BaseModel):
    explanation: str


class GuideStep(BaseModel):
    folder_id: str
    folder_path: str
    order: int
    reason: str


class GuideRequest(BaseModel):
    repo: str
    folders: list[RepoFolder]


class GuideResponse(BaseModel):
    steps: list[GuideStep]