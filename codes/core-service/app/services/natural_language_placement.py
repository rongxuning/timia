"""Snap parsed workspace/project names onto the user's catalog and keep key facts in the description."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from zoneinfo import ZoneInfo

from app.schemas.views.schedule import NaturalLanguageParseOut, NaturalLanguageTaskDraft

_SEPARATORS = re.compile(r"[\s_\-—·.。,，、/／]+")
_NAME_CHARS = r"0-9A-Za-z\u4e00-\u9fff"
_LEADING_PARTICLES = re.compile(r"^[在到给把和的去从]+")
_TRAILING_PARTICLES = re.compile(r"[里中的吧啊呀呢吗]+$")
_CATALOG_SUFFIXES = ("工作空间", "空间", "项目")


@dataclass(frozen=True)
class WorkspaceCatalog:
    name: str
    projects: tuple[str, ...]


def normalize_label(value: str) -> str:
    text = _SEPARATORS.sub("", value.strip().casefold())
    for suffix in _CATALOG_SUFFIXES:
        if text.endswith(suffix) and len(text) > len(suffix):
            text = text[: -len(suffix)]
            break
    return text


def format_catalog_prompt(catalog: list[WorkspaceCatalog], *, limit: int = 200) -> str:
    if not catalog:
        return "可选择的空间与项目：无。workspace_name 和 project_name 必须为 null。"
    lines = [
        "可选择的空间与项目（workspace_name / project_name 必须与下列名称完全一致；没提到则为 null）："
    ]
    listed = 0
    for workspace in catalog:
        projects = workspace.projects or ("（无项目）",)
        for project in projects:
            lines.append(f"- {workspace.name} / {project}")
            listed += 1
            if listed >= limit:
                lines.append("- …其余未列出，不要猜测未列出的名称")
                return "\n".join(lines)
    return "\n".join(lines)


def resolve_workspace_and_project(
    *,
    text: str,
    workspace_name: str | None,
    project_name: str | None,
    catalog: list[WorkspaceCatalog],
) -> tuple[str | None, str | None, list[str]]:
    """Return catalog workspace name, catalog project name, and extra ambiguities."""
    if not catalog:
        return None, None, []

    ambiguities: list[str] = []
    workspace_names = [workspace.name for workspace in catalog]
    text_workspace, workspace_notes = _pick_from_text(
        text, workspace_names, kind="空间", markers=("工作空间", "空间")
    )
    model_workspace = _snap_candidate(workspace_name, workspace_names)
    chosen_workspace = text_workspace or model_workspace
    if (
        text_workspace
        and model_workspace
        and normalize_label(text_workspace) != normalize_label(model_workspace)
    ):
        chosen_workspace = text_workspace
    ambiguities.extend(workspace_notes)

    if chosen_workspace:
        projects = _projects_for(catalog, chosen_workspace)
        pool = [(chosen_workspace, project) for project in projects]
    else:
        pool = [
            (workspace.name, project) for workspace in catalog for project in workspace.projects
        ]

    project_names = _unique_names(project for _, project in pool)
    text_project, project_notes = _pick_from_text(
        text, project_names, kind="项目", markers=("项目",)
    )
    model_project = _snap_candidate(project_name, project_names)
    chosen_project = text_project or model_project
    if (
        text_project
        and model_project
        and normalize_label(text_project) != normalize_label(model_project)
    ):
        chosen_project = text_project
    ambiguities.extend(project_notes)

    if chosen_project:
        owners = _unique_names(
            workspace
            for workspace, project in pool
            if normalize_label(project) == normalize_label(chosen_project)
        )
        if chosen_workspace is None:
            if len(owners) == 1:
                chosen_workspace = owners[0]
            else:
                ambiguities.append(f"项目「{chosen_project}」存在于多个空间，请确认空间")
                chosen_project = None
        elif not any(
            normalize_label(workspace) == normalize_label(chosen_workspace)
            and normalize_label(project) == normalize_label(chosen_project)
            for workspace, project in pool
        ):
            ambiguities.append(f"项目「{chosen_project}」不在空间「{chosen_workspace}」中")
            chosen_project = None
        else:
            chosen_project = next(
                project
                for workspace, project in pool
                if normalize_label(workspace) == normalize_label(chosen_workspace)
                and normalize_label(project) == normalize_label(chosen_project)
            )

    if chosen_workspace:
        chosen_workspace = next(
            workspace.name
            for workspace in catalog
            if normalize_label(workspace.name) == normalize_label(chosen_workspace)
        )
    if chosen_project is None and project_name and project_name.strip() and not project_notes:
        everywhere = _unique_names(project for workspace in catalog for project in workspace.projects)
        snapped = _snap_candidate(project_name, everywhere)
        if snapped and chosen_workspace:
            ambiguities.append(f"项目「{snapped}」不在空间「{chosen_workspace}」中")
        elif snapped is None:
            ambiguities.append(f"未能匹配项目「{project_name.strip()}」")
    return chosen_workspace, chosen_project, _unique_names(ambiguities)


def enrich_description(
    draft: NaturalLanguageTaskDraft,
    *,
    timezone_name: str,
) -> str | None:
    """Keep spoken key facts in the task description without repeating ones already written."""
    text = (draft.body or "").strip()
    extras = [
        f"{label}：{value}"
        for label, value in _key_facts(draft, timezone_name)
        if not _already_covered(text, value)
    ]
    if not text:
        return "\n".join(extras) or None
    if not extras:
        return text
    return text + "\n" + "\n".join(extras)


def apply_catalog_and_description(
    parsed: NaturalLanguageParseOut,
    *,
    text: str,
    catalog: list[WorkspaceCatalog],
    timezone_name: str,
) -> NaturalLanguageParseOut:
    workspace_name, project_name, ambiguities = resolve_workspace_and_project(
        text=text,
        workspace_name=parsed.draft.workspace_name,
        project_name=parsed.draft.project_name,
        catalog=catalog,
    )
    body = enrich_description(parsed.draft, timezone_name=timezone_name)
    draft = parsed.draft.model_copy(
        update={
            "workspace_name": workspace_name,
            "project_name": project_name,
            "body": body,
        }
    )
    merged = list(parsed.ambiguities)
    for note in ambiguities:
        if note not in merged:
            merged.append(note)
    return parsed.model_copy(update={"draft": draft, "ambiguities": merged})


def _projects_for(catalog: list[WorkspaceCatalog], workspace_name: str) -> tuple[str, ...]:
    target = normalize_label(workspace_name)
    for workspace in catalog:
        if normalize_label(workspace.name) == target:
            return workspace.projects
    return ()


def _pick_from_text(
    text: str,
    names: list[str],
    *,
    kind: str,
    markers: tuple[str, ...],
) -> tuple[str | None, list[str]]:
    if not text.strip() or not names:
        return None, []
    mentions = [name for name in names if _mentioned(name, text)]
    chosen = _prefer_longest(mentions)
    if chosen:
        return chosen, []
    if _distinct(mentions):
        return None, [f"提到了多个{kind}：{'、'.join(_distinct(mentions))}，请确认"]

    span_hits: list[str] = []
    for span in _hint_spans(text, markers):
        matched = _snap_candidate(span, names)
        if matched:
            span_hits.append(matched)
    chosen = _prefer_longest(span_hits)
    if chosen:
        return chosen, []
    distinct = _distinct(span_hits)
    if len(distinct) > 1:
        return None, [f"提到了多个{kind}：{'、'.join(distinct)}，请确认"]
    return None, []


def _snap_candidate(candidate: str | None, names: list[str]) -> str | None:
    if not candidate or not candidate.strip() or not names:
        return None
    exact = [name for name in names if normalize_label(name) == normalize_label(candidate)]
    chosen = _prefer_longest(exact)
    if chosen:
        return chosen

    norm_candidate = normalize_label(candidate)
    if len(norm_candidate) < 2:
        return None
    contained: list[str] = []
    for name in names:
        norm_name = normalize_label(name)
        if not norm_name:
            continue
        if norm_name in norm_candidate and len(norm_name) / len(norm_candidate) >= 0.67:
            contained.append(name)
        elif norm_candidate in norm_name and len(norm_candidate) / len(norm_name) >= 0.67:
            contained.append(name)
    chosen = _prefer_longest(contained)
    if chosen:
        return chosen

    scored = sorted(
        (
            (SequenceMatcher(None, norm_candidate, normalize_label(name)).ratio(), name)
            for name in names
        ),
        key=lambda item: item[0],
        reverse=True,
    )
    if not scored or scored[0][0] < 0.72:
        return None
    if len(scored) > 1 and scored[0][0] - scored[1][0] < 0.08:
        if normalize_label(scored[0][1]) != normalize_label(scored[1][1]):
            return None
    return scored[0][1]


def _mentioned(name: str, text: str) -> bool:
    label = normalize_label(name)
    if len(label) < 2:
        return False
    compact = _SEPARATORS.sub("", text.casefold())
    if label.isascii():
        return re.search(rf"(?<![a-z0-9]){re.escape(label)}(?![a-z0-9])", compact) is not None
    return label in compact


def _hint_spans(text: str, markers: tuple[str, ...]) -> list[str]:
    spans: list[str] = []
    for marker in sorted(markers, key=len, reverse=True):
        start = 0
        while True:
            index = text.find(marker, start)
            if index < 0:
                break
            prefix = text[max(0, index - 16) : index]
            prefix_match = re.search(rf"([{_NAME_CHARS}]{{2,16}})$", prefix)
            if prefix_match:
                spans.append(_trim_span(prefix_match.group(1)))
            suffix = text[index + len(marker) : index + len(marker) + 18]
            suffix_match = re.match(rf"(?:是|叫|为|：|:|的)?([{_NAME_CHARS}]{{2,16}})", suffix)
            if suffix_match:
                spans.append(_trim_span(suffix_match.group(1)))
            start = index + len(marker)
    return [span for span in spans if span]


def _trim_span(span: str) -> str:
    return _TRAILING_PARTICLES.sub("", _LEADING_PARTICLES.sub("", span))


def _prefer_longest(names: list[str]) -> str | None:
    distinct = _distinct(names)
    if not distinct:
        return None
    ranked = sorted(distinct, key=lambda name: len(normalize_label(name)), reverse=True)
    best_len = len(normalize_label(ranked[0]))
    top = [name for name in ranked if len(normalize_label(name)) == best_len]
    if len(top) == 1:
        return top[0]
    return None


def _distinct(names: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for name in names:
        key = normalize_label(name)
        if not key or key in seen:
            continue
        seen.add(key)
        ordered.append(name)
    return ordered


def _unique_names(names) -> list[str]:
    return _distinct(list(names))


def _key_facts(draft: NaturalLanguageTaskDraft, timezone_name: str) -> list[tuple[str, str]]:
    facts: list[tuple[str, str]] = []
    when = _format_when(draft, timezone_name)
    if when:
        facts.append(("时间", when))
    location = (draft.location or "").strip()
    if location:
        facts.append(("地点", location))
    assignee = (draft.assignee_name or "").strip()
    if assignee:
        facts.append(("负责人", assignee))
    participants = [name.strip() for name in draft.participant_names if name.strip()]
    if participants:
        facts.append(("参与人", "、".join(participants)))
    recurrence = (draft.recurrence_text or "").strip()
    if recurrence:
        facts.append(("重复", recurrence))
    return facts


def _format_when(draft: NaturalLanguageTaskDraft, timezone_name: str) -> str | None:
    start = draft.start_at
    if start is None:
        return None
    timezone = _zone(timezone_name)
    start_local = _as_local(start, timezone)
    if draft.all_day:
        return f"{start_local.year}年{start_local.month}月{start_local.day}日 全天"
    end = draft.end_at
    clock = start_local.strftime("%H:%M")
    date_label = f"{start_local.year}年{start_local.month}月{start_local.day}日 {clock}"
    if end is None:
        return date_label
    end_local = _as_local(end, timezone)
    if start_local.date() == end_local.date():
        return f"{date_label}–{end_local.strftime('%H:%M')}"
    return (
        f"{date_label}–{end_local.year}年{end_local.month}月{end_local.day}日 "
        f"{end_local.strftime('%H:%M')}"
    )


def _zone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except Exception:
        return ZoneInfo("Asia/Shanghai")


def _as_local(value: datetime, timezone: ZoneInfo) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone)
    return value.astimezone(timezone)


def _already_covered(text: str, value: str) -> bool:
    if not text:
        return False
    compact_text = _SEPARATORS.sub("", text.casefold())
    compact_value = _SEPARATORS.sub("", value.casefold())
    if len(compact_value) >= 2 and compact_value in compact_text:
        return True
    clock = re.search(r"\d{2}:\d{2}", value)
    return bool(clock and clock.group(0) in text)
