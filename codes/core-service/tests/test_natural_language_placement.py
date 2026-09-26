from datetime import datetime
from zoneinfo import ZoneInfo

from app.schemas.views.schedule import (
    NaturalLanguageParseOut,
    NaturalLanguageParseRequest,
    NaturalLanguageTaskDraft,
)
from app.services.natural_language_placement import (
    WorkspaceCatalog,
    apply_catalog_and_description,
    resolve_workspace_and_project,
)
from app.services.natural_language_schedule import build_minimax_request


def _catalog() -> list[WorkspaceCatalog]:
    return [
        WorkspaceCatalog(name="产品研发", projects=("iOS", "Android")),
        WorkspaceCatalog(name="产品", projects=("品牌",)),
        WorkspaceCatalog(name="生活", projects=("买菜", "iOS")),
    ]


def _draft(**overrides) -> NaturalLanguageTaskDraft:
    payload = {
        "title": "讨论登录改版",
        "body": None,
        "start_at": datetime(2026, 9, 27, 7, 0, tzinfo=ZoneInfo("UTC")),
        "end_at": datetime(2026, 9, 27, 8, 0, tzinfo=ZoneInfo("UTC")),
        "all_day": False,
        "status": "todo",
        "priority": "1",
        "location": "会议室 A",
        "workspace_name": None,
        "project_name": None,
        "assignee_name": "张三",
        "participant_names": [],
        "recurrence_text": None,
    }
    payload.update(overrides)
    return NaturalLanguageTaskDraft.model_validate(payload)


def test_spoken_space_and_project_select_catalog_names_when_model_omits_them():
    workspace, project, ambiguities = resolve_workspace_and_project(
        text="明天下午三点在产品研发空间的 iOS 项目里，和张三开会讨论登录改版",
        workspace_name=None,
        project_name=None,
        catalog=_catalog(),
    )
    assert workspace == "产品研发"
    assert project == "iOS"
    assert ambiguities == []


def test_near_miss_prefers_the_closer_catalog_name():
    workspace, project, _ambiguities = resolve_workspace_and_project(
        text="开会",
        workspace_name="产品研法",
        project_name="ios",
        catalog=_catalog(),
    )
    assert workspace == "产品研发"
    assert project == "iOS"


def test_suffix_and_near_miss_snap_to_catalog_name():
    workspace, project, _ambiguities = resolve_workspace_and_project(
        text="放到产品研发空间",
        workspace_name="产品研法空间",
        project_name="ios项目",
        catalog=_catalog(),
    )
    assert workspace == "产品研发"
    assert project == "iOS"


def test_unique_project_infers_its_workspace():
    catalog = [
        WorkspaceCatalog(name="产品研发", projects=("iOS",)),
        WorkspaceCatalog(name="生活", projects=("买菜",)),
    ]
    workspace, project, ambiguities = resolve_workspace_and_project(
        text="记到买菜项目里，晚上买牛奶",
        workspace_name=None,
        project_name=None,
        catalog=catalog,
    )
    assert workspace == "生活"
    assert project == "买菜"
    assert ambiguities == []


def test_longer_workspace_wins_when_one_name_contains_another():
    workspace, project, ambiguities = resolve_workspace_and_project(
        text="在产品研发空间开会",
        workspace_name=None,
        project_name=None,
        catalog=_catalog(),
    )
    assert workspace == "产品研发"
    assert project is None
    assert ambiguities == []


def test_ambiguous_workspaces_are_not_guessed():
    catalog = [
        WorkspaceCatalog(name="生活", projects=("家务",)),
        WorkspaceCatalog(name="工作", projects=("周会",)),
    ]
    workspace, _project, ambiguities = resolve_workspace_and_project(
        text="生活空间或者工作空间都可以",
        workspace_name=None,
        project_name=None,
        catalog=catalog,
    )
    assert workspace is None
    assert ambiguities


def test_project_outside_the_chosen_workspace_is_cleared():
    workspace, project, ambiguities = resolve_workspace_and_project(
        text="生活空间",
        workspace_name="生活",
        project_name="Android",
        catalog=_catalog(),
    )
    assert workspace == "生活"
    assert project is None
    assert any("不在空间" in note for note in ambiguities)


def test_description_keeps_key_facts_and_skips_ones_already_written():
    parsed = NaturalLanguageParseOut(
        draft=_draft(body="记得带原型，地点在会议室 A"),
        confidence=0.9,
        assumptions=[],
        missing_fields=[],
        ambiguities=[],
    )
    applied = apply_catalog_and_description(
        parsed,
        text="明天下午三点在产品研发空间的 iOS 项目里讨论登录改版，记得带原型",
        catalog=_catalog(),
        timezone_name="Asia/Shanghai",
    )
    assert applied.draft.workspace_name == "产品研发"
    assert applied.draft.project_name == "iOS"
    assert applied.draft.body is not None
    assert "记得带原型" in applied.draft.body
    assert "地点：会议室 A" not in applied.draft.body
    assert "时间：2026年9月27日 15:00–16:00" in applied.draft.body
    assert "负责人：张三" in applied.draft.body
    assert "产品研发" not in applied.draft.body


def test_prompt_lists_catalog_and_asks_for_description():
    timezone = ZoneInfo("Asia/Shanghai")
    payload = NaturalLanguageParseRequest(
        text="在产品研发空间的 iOS 项目里开会",
        timezone="Asia/Shanghai",
        reference_time=datetime(2026, 9, 26, 10, 0, tzinfo=timezone),
        selected_date=datetime(2026, 9, 26, tzinfo=timezone).date(),
    )
    body = build_minimax_request(payload, selected_date=payload.selected_date, catalog=_catalog())
    prompt = body["messages"][0]["content"]
    assert "- 产品研发 / iOS" in prompt
    assert "body 是任务描述" in prompt
    assert "不要猜列表第一项" in prompt
