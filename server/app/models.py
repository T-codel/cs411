from pydantic import BaseModel, Field


class RepoTreeRequest(BaseModel):
    repo_url: str


class RepoFolder(BaseModel):
    id: str
    name: str
    path: str
    depth: int
    child_count: int
    parent: str | None = None
    description: str = ""
    category: str = "Overview"
    category_reason: str = ""


class RepoEdge(BaseModel):
    parent_id: str
    child_id: str
    label: str = "contains"


class RepoTreeResponse(BaseModel):
    repo: str
    source_url: str
    folders: list[RepoFolder]
    explanation: str = ""
    original_folder_count: int = 0
    pruning_criteria: list[str] = Field(default_factory=list)
    edges: list[RepoEdge] = Field(default_factory=list)

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
