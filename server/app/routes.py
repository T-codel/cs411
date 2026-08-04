from dataclasses import dataclass
import hashlib
import json
import os
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException



from .models import ExplainRequest, ExplainResponse, GuideRequest, GuideResponse, GuideStep, RepoEdge, RepoFolder, RepoTreeRequest, RepoTreeResponse

router = APIRouter()
MAX_FOLDERS = 90
MAX_DEPTH = 4
MAX_LLM_FOLDERS = 30
CATEGORIES = {
    "Overview",
    "Entry Point",
    "UI / Presentation",
    "API / Interface",
    "Domain / Core Logic",
    "Data / Persistence",
    "Infrastructure / Configuration",
    "Shared / Utilities",
    "Testing / Quality",
    "Documentation / Examples",
}
PRUNING_RESPONSE_SCHEMA = {
    "type": "object",
    "required": ["summary", "criteria", "folders"],
    "properties": {
        "summary": {"type": "string"},
        "criteria": {"type": "array", "items": {"type": "string"}},
        "folders": {
            "type": "array",
            "minItems": 1,
            "maxItems": MAX_LLM_FOLDERS,
            "items": {
                "type": "object",
                "required": ["id", "description", "category", "category_reason", "edge_label"],
                "properties": {
                    "id": {"type": "string"},
                    "description": {"type": "string"},
                    "category": {"type": "string", "enum": sorted(CATEGORIES)},
                    "category_reason": {"type": "string"},
                    "edge_label": {"type": "string"},
                },
            },
        },
    },
}
GUIDE_RESPONSE_SCHEMA = {
    "type": "array",
    "minItems": 3,
    "maxItems": 5,
    "items": {
        "type": "object",
        "required": ["folder_id", "folder_path", "order", "reason"],
        "properties": {
            "folder_id": {"type": "string"},
            "folder_path": {"type": "string"},
            "order": {"type": "integer"},
            "reason": {"type": "string"},
        },
    },
}
GEMINI_MIN_INTERVAL_SECONDS = float(os.environ.get("GEMINI_MIN_INTERVAL_SECONDS", "4"))
ANALYSIS_CACHE_SECONDS = int(os.environ.get("ANALYSIS_CACHE_SECONDS", "900"))
_gemini_lock = threading.Lock()
_last_gemini_request = 0.0
_analysis_cache_lock = threading.Lock()
_analysis_cache: dict[str, tuple[float, tuple]] = {}


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
    except TimeoutError as error:
        raise HTTPException(status_code=504, detail="GitHub took too long to return the repository data") from error


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


def candidate_folder_data(tree: list[dict], folder_paths: list[str]) -> list[dict]:
    """Add representative direct files so pruning is based on repository signals, not names alone."""
    direct_files: dict[str, list[str]] = {path: [] for path in ["", *folder_paths]}
    for item in tree:
        path = item.get("path")
        if item.get("type") != "blob" or not isinstance(path, str):
            continue
        parent, _, name = path.rpartition("/")
        if parent in direct_files and len(direct_files[parent]) < 8:
            direct_files[parent].append(name)

    return [
        {
            "id": folder_id(path),
            "path": path or "(root)",
            "depth": 0 if not path else path.count("/") + 1,
            "direct_files": direct_files[path],
        }
        for path in ["", *folder_paths]
    ]


def parse_json_response(raw: str, error_message: str) -> object:
    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[-1]
        if clean.endswith("```"):
            clean = clean.rsplit("```", 1)[0]
        clean = clean.strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError as original_error:
        # Some model versions prepend a short sentence despite JSON mode. Decode the
        # first complete JSON value instead of making the frontend understand model text.
        decoder = json.JSONDecoder()
        for index, character in enumerate(clean):
            if character not in "[{":
                continue
            try:
                value, _ = decoder.raw_decode(clean[index:])
                return value
            except json.JSONDecodeError:
                continue
        raise HTTPException(status_code=502, detail=error_message) from original_error


def prune_with_gemini(
    repo: GitHubRepo, candidates: list[dict]
) -> tuple[set[str], dict[str, str], dict[str, str], dict[str, str], dict[str, str], str, list[str]]:
    prompt = (
        f"You are creating a compact architecture map for a developer trying to understand "
        f"the repository '{repo.owner}/{repo.name}'. Analyze these folder candidates:\n"
        f"{json.dumps(candidates, indent=2)}\n\n"
        "Select only folders that materially improve understanding of the system. Prioritize: "
        "(1) source roots and architectural boundaries, (2) application entry points and interfaces, "
        "(3) domain/business logic and data models, (4) configuration and infrastructure that explain runtime behavior, "
        "(5) representative tests that explain intended behavior, and (6) useful documentation. "
        "Prune generated output, dependencies, caches, vendored code, static/media assets, build artifacts, "
        "tool-internal folders, empty folders, and repetitive low-level implementation folders whose parent already conveys their role. "
        f"Aim for 10-{MAX_LLM_FOLDERS} folders, but use fewer for a small repository. Always include root. "
        "The selected folders MUST form a connected tree: include every selected folder's ancestors. "
        "Assign exactly one category to every selected folder from this enum: "
        f"{json.dumps(sorted(CATEGORIES))}. "
        "Also label each selected non-root folder's edge from its immediate selected parent with a short relationship phrase. "
        "Prefer contains when evidence does not justify a stronger claim; other useful labels include starts in, renders, exposes, "
        "routes to, implements, uses, persists through, configures, tests, documents, and supports. "
        "Do not select an item not present in the input. Return ONLY JSON with this shape: "
        '{"summary":"2-4 sentence repository description",'
        '"criteria":["short criterion", "short criterion"],'
        '"folders":[{"id":"exact input id","description":"one sentence explaining this folder and why it matters",'
        '"category":"exact enum value","category_reason":"short reason for this classification",'
        '"edge_label":"relationship from its parent, or empty for root"}]}.'
    )
    raw = call_gemini(prompt, json_response=True, response_schema=PRUNING_RESPONSE_SCHEMA)
    try:
        result = parse_json_response(raw, "Pruning LLM returned invalid JSON")
    except HTTPException:
        # A single schema-constrained retry is only used for malformed output. It is
        # paced by call_gemini, so it cannot bypass the configured RPM limit.
        raw = call_gemini(
            prompt + "\nYour previous response was malformed. Return compact JSON matching the schema exactly.",
            json_response=True,
            response_schema=PRUNING_RESPONSE_SCHEMA,
        )
        result = parse_json_response(raw, "Pruning LLM returned invalid JSON after retry")
    if not isinstance(result, dict) or not isinstance(result.get("folders"), list):
        raise HTTPException(status_code=502, detail="Pruning LLM returned an invalid structure")

    valid_ids = {candidate["id"] for candidate in candidates}
    selected: set[str] = {"root"}
    descriptions: dict[str, str] = {}
    categories: dict[str, str] = {}
    category_reasons: dict[str, str] = {}
    edge_labels: dict[str, str] = {}
    for item in result["folders"][:MAX_LLM_FOLDERS]:
        if not isinstance(item, dict):
            continue
        item_id = str(item.get("id", ""))
        description = str(item.get("description", "")).strip()
        category = str(item.get("category", "")).strip()
        if item_id in valid_ids and category in CATEGORIES:
            selected.add(item_id)
            categories[item_id] = category
            if description:
                descriptions[item_id] = description
            category_reasons[item_id] = str(item.get("category_reason", "")).strip()
            edge_label = " ".join(str(item.get("edge_label", "contains")).strip().split())[:40]
            edge_labels[item_id] = edge_label or "contains"

    if len(selected) < min(3, len(candidates)):
        raise HTTPException(status_code=502, detail="Pruning LLM selected too few valid folders")
    candidate_by_id = {candidate["id"]: candidate for candidate in candidates}
    for item_id in selected - {"root"}:
        path = candidate_by_id[item_id]["path"]
        parent_path = "/".join(path.split("/")[:-1])
        if folder_id(parent_path) not in selected:
            raise HTTPException(status_code=502, detail="Pruning LLM returned a disconnected folder selection")
    summary = str(result.get("summary", "")).strip()
    criteria = [str(value).strip() for value in result.get("criteria", []) if str(value).strip()][:8]
    return selected, descriptions, categories, category_reasons, edge_labels, summary, criteria


def cached_pruning(repo: GitHubRepo, branch: str, candidates: list[dict]) -> tuple:
    fingerprint = hashlib.sha256(
        json.dumps([repo.owner, repo.name, branch, candidates], sort_keys=True).encode()
    ).hexdigest()
    now = time.monotonic()
    with _analysis_cache_lock:
        cached = _analysis_cache.get(fingerprint)
        if cached and now - cached[0] < ANALYSIS_CACHE_SECONDS:
            return cached[1]

    result = prune_with_gemini(repo, candidates)
    with _analysis_cache_lock:
        _analysis_cache[fingerprint] = (time.monotonic(), result)
        expired = [key for key, value in _analysis_cache.items() if now - value[0] >= ANALYSIS_CACHE_SECONDS]
        for key in expired:
            _analysis_cache.pop(key, None)
    return result


def build_folder_response(repo: GitHubRepo, branch: str, tree: list[dict]) -> RepoTreeResponse:
    folder_paths = sorted(
        item["path"]
        for item in tree
        if item.get("type") == "tree" and isinstance(item.get("path"), str) and item["path"].count("/") < MAX_DEPTH
    )
    folder_paths = folder_paths[: MAX_FOLDERS - 1]
    candidates = candidate_folder_data(tree, folder_paths)
    selected_ids, descriptions, categories, category_reasons, edge_labels, summary, criteria = cached_pruning(
        repo, branch, candidates
    )
    selected_paths = {candidate["path"] for candidate in candidates if candidate["id"] in selected_ids}
    selected_paths.discard("(root)")
    folder_paths = [path for path in folder_paths if path in selected_paths]
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
        description=descriptions.get("root", "Repository root and top-level architecture."),
        category=categories.get("root", "Overview"),
        category_reason=category_reasons.get("root", "Top-level repository context."),
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
                description=descriptions[folder_id(path)],
                category=categories[folder_id(path)],
                category_reason=category_reasons.get(folder_id(path), ""),
            )
        )

    edges = [
        RepoEdge(parent_id=folder.parent, child_id=folder.id, label=edge_labels.get(folder.id, "contains"))
        for folder in folders
        if folder.parent
    ]
    return RepoTreeResponse(
        repo=f"{repo.owner}/{repo.name}",
        source_url=f"https://github.com/{repo.owner}/{repo.name}/tree/{branch}",
        folders=folders,
        explanation=summary,
        original_folder_count=len(candidates),
        pruning_criteria=criteria,
        edges=edges,
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


GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-3.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

def call_gemini(prompt: str, json_response: bool = False, response_schema: dict | None = None) -> str:
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")

    request_payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 8192},
    }
    if response_schema:
        # Current Gemini 3 generateContent uses responseFormat with standard,
        # lower-case JSON Schema types.
        request_payload["generationConfig"]["responseFormat"] = {
            "text": {"mimeType": "application/json", "schema": response_schema}
        }
    elif json_response:
        request_payload["generationConfig"]["responseMimeType"] = "application/json"
    body = json.dumps(request_payload).encode()
    request = Request(
        GEMINI_URL,
        data=body,
        headers={"Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY},
    )
    global _last_gemini_request
    try:
        # Serialize and pace requests. The default of 4 seconds caps this process at 15 RPM,
        # and can be raised for stricter Gemini project quotas.
        with _gemini_lock:
            wait_seconds = GEMINI_MIN_INTERVAL_SECONDS - (time.monotonic() - _last_gemini_request)
            if wait_seconds > 0:
                time.sleep(wait_seconds)
            # Structured pruning can be slower than a short text generation because
            # Gemini must classify and describe the complete candidate tree.
            with urlopen(request, timeout=90) as response:
                payload = json.loads(response.read().decode("utf-8"))
            _last_gemini_request = time.monotonic()
    except HTTPError as error:
        try:
            error_body = json.loads(error.read().decode("utf-8"))
            error_message = error_body.get("error", {}).get("message", str(error))
        except Exception:
            error_message = str(error)
        if error.code == 400 and response_schema:
            # Compatibility fallback for API/model revisions that do not accept
            # responseFormat. Backend validation still enforces the same contract.
            _last_gemini_request = time.monotonic()
            return call_gemini(prompt, json_response=True, response_schema=None)
        raise HTTPException(
            status_code=502,
            detail=f"Gemini error {error.code}: {error_message}",
        ) from error
    except URLError as error:
        raise HTTPException(status_code=502, detail=f"Could not reach Gemini: {error.reason}") from error
    except TimeoutError as error:
        raise HTTPException(status_code=504, detail="Gemini took too long to analyze the repository; try again") from error

    try:
        candidate = payload["candidates"][0]
        parts = candidate["content"]["parts"]
        text = "".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()
        if not text:
            finish_reason = candidate.get("finishReason", "unknown")
            raise HTTPException(status_code=502, detail=f"Gemini returned no usable text (finish reason: {finish_reason})")
        return text
    except (KeyError, IndexError, TypeError) as error:
        raise HTTPException(status_code=502, detail="Gemini returned an unexpected response structure") from error
    
@router.post("/explain", response_model=ExplainResponse)
def explain_repo(payload: ExplainRequest) -> ExplainResponse:
    folder_list = "\n".join(f"- {f.path or '(root)'}" for f in payload.folders)
    prompt = (
        f"Given this folder structure for the GitHub repo '{payload.repo}', "
        f"write a 3-4 sentence plain-English summary of what this project likely does "
        f"and how it's organized:\n\n{folder_list}"
    )
    return ExplainResponse(explanation=call_gemini(prompt))


@router.post("/guide", response_model=GuideResponse)
def guide_repo(payload: GuideRequest) -> GuideResponse:
    folder_index = {f.id: f for f in payload.folders}
    folder_lines = "\n".join(
        f'  {{"id": "{f.id}", "path": "{f.path or "(root)"}", "depth": {f.depth}, "child_count": {f.child_count}}}'
        for f in payload.folders
    )
    prompt = (
        f"You are a senior engineer onboarding a new developer to the GitHub repository '{payload.repo}'.\n"
        f"Below is the repository's folder list as JSON objects with id, path, depth, and child_count.\n\n"
        f"[\n{folder_lines}\n]\n\n"
        f"Choose the best 3 to 5 folders a newcomer should explore FIRST to build mental model of this codebase. "
        f"Order them from most important to least important.\n"
        f"Return ONLY a JSON array (no markdown, no explanation outside JSON) like this:\n"
        f'[\n'
        f'  {{"folder_id": "<id>", "folder_path": "<path>", "order": 1, "reason": "<one sentence why>"}},\n'
        f'  {{"folder_id": "<id>", "folder_path": "<path>", "order": 2, "reason": "<one sentence why>"}},\n'
        f'  {{"folder_id": "<id>", "folder_path": "<path>", "order": 3, "reason": "<one sentence why>"}}\n'
        f']\n'
        f"Rules:\n"
        f"- folder_id must exactly match one of the id values in the input list.\n"
        f"- folder_path must exactly match the corresponding path value (use '(root)' for the root).\n"
        f"- Include at least 3 entries and no more than 5.\n"
        f"- Reason must be a single clear sentence explaining WHY a newcomer should look here first.\n"
        f"- Return pure JSON only."
    )
    raw = call_gemini(prompt, json_response=True, response_schema=GUIDE_RESPONSE_SCHEMA)

    items = parse_json_response(raw, "Guide LLM returned invalid JSON")
    if not isinstance(items, list):
        raise HTTPException(status_code=502, detail="Guide LLM returned an invalid structure")

    steps: list[GuideStep] = []
    for item in items:
        folder_id_val = str(item.get("folder_id", ""))
        # Validate that the folder_id actually exists in the provided folder list
        matched_folder = folder_index.get(folder_id_val)
        if matched_folder is None:
            continue
        steps.append(
            GuideStep(
                folder_id=folder_id_val,
                folder_path=matched_folder.path or "(root)",
                order=int(item.get("order", len(steps) + 1)),
                reason=str(item.get("reason", "")),
            )
        )

    steps.sort(key=lambda s: s.order)

    if len(steps) < 3:
        raise HTTPException(
            status_code=502,
            detail=f"Guide LLM returned fewer than 3 valid steps (got {len(steps)})",
        )

    return GuideResponse(steps=steps)
