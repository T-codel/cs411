import json

from app.routes import GitHubRepo, build_folder_response, parse_json_response, prune_with_gemini


def test_json_parser_recovers_json_wrapped_in_model_commentary():
    result = parse_json_response('Here is the result: {"summary":"usable","folders":[]}', "bad")
    assert result["summary"] == "usable"


def test_llm_pruning_keeps_selected_folders_and_restores_ancestors(monkeypatch):
    llm_result = {
        "summary": "A web application with a component-based frontend.",
        "criteria": ["Keep application architecture", "Remove generated output"],
        "folders": [
            {"id": "root", "description": "The repository root.", "category": "Overview", "category_reason": "Top-level context", "edge_label": ""},
            {"id": "src", "description": "Application source.", "category": "Domain / Core Logic", "category_reason": "Main implementation", "edge_label": "contains"},
            {"id": "src__components", "description": "Core reusable UI components.", "category": "UI / Presentation", "category_reason": "User-facing components", "edge_label": "renders"},
            {"id": "tests", "description": "Behavioral tests document intended outcomes.", "category": "Testing / Quality", "category_reason": "Verifies behavior", "edge_label": "tests"},
        ],
    }
    monkeypatch.setattr("app.routes.call_gemini", lambda *_args, **_kwargs: json.dumps(llm_result))
    tree = [
        {"path": "src", "type": "tree"},
        {"path": "src/components", "type": "tree"},
        {"path": "dist", "type": "tree"},
        {"path": "tests", "type": "tree"},
        {"path": "src/components/Button.tsx", "type": "blob"},
        {"path": "dist/bundle.js", "type": "blob"},
    ]

    response = build_folder_response(GitHubRepo("owner", "repo"), "main", tree)

    assert [folder.path for folder in response.folders] == ["", "src", "src/components", "tests"]
    assert response.folders[2].description == "Core reusable UI components."
    assert response.folders[1].category == "Domain / Core Logic"
    assert response.folders[2].category == "UI / Presentation"
    assert next(edge for edge in response.edges if edge.child_id == "src__components").label == "renders"
    assert response.explanation == llm_result["summary"]
    assert response.original_folder_count == 5


def test_pruning_rejects_unknown_or_too_few_folder_ids(monkeypatch):
    monkeypatch.setattr(
        "app.routes.call_gemini",
        lambda *_args, **_kwargs: '{"summary":"", "criteria":[], "folders":[{"id":"made-up","category":"Overview"}]}',
    )
    candidates = [
        {"id": "root", "path": "(root)", "depth": 0, "direct_files": []},
        {"id": "src", "path": "src", "depth": 1, "direct_files": []},
        {"id": "tests", "path": "tests", "depth": 1, "direct_files": []},
    ]

    try:
        prune_with_gemini(GitHubRepo("owner", "repo"), candidates)
        assert False, "Expected invalid model selection to be rejected"
    except Exception as error:
        assert getattr(error, "status_code", None) == 502
