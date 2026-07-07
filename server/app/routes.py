from dataclasses import dataclass
import json
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException

from .models import RepoFolder, RepoTreeRequest, RepoTreeResponse

router = APIRouter()
MAX_FOLDERS = 90
MAX_DEPTH = 4


@dataclass(frozen=True)
class GitHubRepo:
    owner: str
    name: str
    branch: str | None = None


def read_json(url: str) -> dict:
    request = Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "cs411-repo-tree"})
    try:
        with urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        message = "GitHub rejected the repository request"
        try:
            payload = json.loads(error.read().decode("utf-8"))
            if isinstance(payload.get("message"), str):
                message = payload["message"]
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass

        if error.code == 404:
            raise HTTPException(status_code=404, detail="Repository or branch was not found") from error
        if error.code == 403:
            raise HTTPException(status_code=429, detail=f"GitHub refused the request: {message}") from error
        raise HTTPException(status_code=502, detail=f"GitHub refused the request: {message}") from error
    except URLError as error:
        raise HTTPException(status_code=502, detail="Could not reach GitHub") from error


def parse_github_url(repo_url: str) -> GitHubRepo:
    clean_url = repo_url.strip()
    if not clean_url:
        raise HTTPException(status_code=400, detail="Enter a GitHub repository URL")
    if "://" not in clean_url:
        clean_url = f"https://{clean_url}"

    parsed = urlparse(clean_url)
    if parsed.netloc.lower() not in {"github.com", "www.github.com"}:
        raise HTTPException(status_code=400, detail="Enter a GitHub repository URL")

    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="GitHub URL must include owner and repository")

    branch = parts[3] if len(parts) == 4 and parts[2] == "tree" else None
    return GitHubRepo(owner=parts[0], name=parts[1].removesuffix(".git"), branch=branch)


def get_default_branch(repo: GitHubRepo) -> str:
    details = read_json(f"https://api.github.com/repos/{repo.owner}/{repo.name}")
    default_branch = details.get("default_branch")
    if not isinstance(default_branch, str):
        raise HTTPException(status_code=502, detail="GitHub did not return a default branch")
    return default_branch


def folder_id(path: str) -> str:
    return "root" if not path else path.replace("/", "__")


def parent_for(path: str, available_paths: set[str]) -> str:
    parent = "/".join(path.split("/")[:-1])
    while parent and parent not in available_paths:
        parent = "/".join(parent.split("/")[:-1])
    return folder_id(parent)


def build_folder_response(repo: GitHubRepo, branch: str, tree: list[dict]) -> RepoTreeResponse:
    folder_paths = sorted(
        item["path"]
        for item in tree
        if item.get("type") == "tree" and isinstance(item.get("path"), str) and item["path"].count("/") < MAX_DEPTH
    )
    folder_paths = folder_paths[: MAX_FOLDERS - 1]
    available_paths = set(folder_paths)
    child_counts = {path: 0 for path in ["", *folder_paths]}

    for path in folder_paths:
        parent = "/".join(path.split("/")[:-1])
        if parent in child_counts:
            child_counts[parent] += 1

    root = RepoFolder(
        id="root",
        name=repo.name,
        path="",
        depth=0,
        child_count=sum(1 for path in folder_paths if "/" not in path),
    )
    folders = [root]

    for path in folder_paths:
        folders.append(
            RepoFolder(
                id=folder_id(path),
                name=path.split("/")[-1],
                path=path,
                depth=path.count("/") + 1,
                parent=parent_for(path, available_paths),
                child_count=child_counts[path],
            )
        )

    return RepoTreeResponse(
        repo=f"{repo.owner}/{repo.name}",
        source_url=f"https://github.com/{repo.owner}/{repo.name}/tree/{branch}",
        folders=folders,
    )


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/repo-tree", response_model=RepoTreeResponse)
def create_repo_tree(payload: RepoTreeRequest) -> RepoTreeResponse:
    repo = parse_github_url(payload.repo_url)
    branch = repo.branch or get_default_branch(repo)
    encoded_branch = quote(branch, safe="")
    tree_payload = read_json(
        f"https://api.github.com/repos/{repo.owner}/{repo.name}/git/trees/{encoded_branch}?recursive=1"
    )
    tree = tree_payload.get("tree")

    if not isinstance(tree, list):
        raise HTTPException(status_code=502, detail="GitHub did not return a repository tree")

    return build_folder_response(repo, branch, tree)
