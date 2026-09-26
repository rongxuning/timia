"""Natural-language task parsing through a server-side structured model response."""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Any

import httpx
from pydantic import ValidationError

from collections.abc import Callable

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User
from app.schemas.views.schedule import (
    NaturalLanguageParseOut,
    NaturalLanguageParseRequest,
)
from app.services.llm_api_keys import LlmKeyCandidate
from app.services.natural_language_catalog import load_workspace_catalog
from app.services.natural_language_placement import (
    WorkspaceCatalog,
    apply_catalog_and_description,
    format_catalog_prompt,
)


class NaturalLanguageConfigurationError(RuntimeError):
    pass


class NaturalLanguageProviderError(RuntimeError):
    pass


_TASK_DRAFT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "draft": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "title": {"type": "string"},
                "body": {"type": ["string", "null"]},
                "start_at": {"type": ["string", "null"], "format": "date-time"},
                "end_at": {"type": ["string", "null"], "format": "date-time"},
                "all_day": {"type": "boolean"},
                "status": {
                    "type": "string",
                    "enum": ["todo", "doing", "done", "archived"],
                },
                "priority": {"type": "string", "enum": ["1", "2", "3", "4"]},
                "location": {"type": ["string", "null"]},
                "workspace_name": {"type": ["string", "null"]},
                "project_name": {"type": ["string", "null"]},
                "assignee_name": {"type": ["string", "null"]},
                "participant_names": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "recurrence_text": {"type": ["string", "null"]},
            },
            "required": [
                "title",
                "body",
                "start_at",
                "end_at",
                "all_day",
                "status",
                "priority",
                "location",
                "workspace_name",
                "project_name",
                "assignee_name",
                "participant_names",
                "recurrence_text",
            ],
        },
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "assumptions": {"type": "array", "items": {"type": "string"}},
        "missing_fields": {"type": "array", "items": {"type": "string"}},
        "ambiguities": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["draft", "confidence", "assumptions", "missing_fields", "ambiguities"],
}


def _system_prompt(
    payload: NaturalLanguageParseRequest,
    *,
    selected_date: date | None = None,
    catalog: list[WorkspaceCatalog] | None = None,
) -> str:
    selected_line = (
        f"日程页当前选中日期：{selected_date.isoformat()}"
        if selected_date is not None
        else "日程页当前选中日期：未指定（请从用户输入中自行推断日期）"
    )
    rule_no_date = (
        "2. 没有日期时使用当前选中日期，并在 assumptions 中说明。"
        if selected_date is not None
        else "2. 没有日期时不要编造，请把 start_at/end_at 留为 null，并在 ambiguities 中说明「未指定日期」。"
    )
    return f"""
你是 Timia 的中文任务解析器。把用户输入转换成一个任务草稿，不执行任务创建。

当前参考时间：{payload.reference_time.isoformat()}
用户时区：{payload.timezone}
{selected_line}

{format_catalog_prompt(catalog or [])}

规则：
1. 相对日期和时间必须基于参考时间与用户时区解析，并输出带时区的 ISO 8601。
{rule_no_date}
3. 有具体时间但没有结束时间或时长时，默认持续一小时，并在 assumptions 中说明。
4. 只有日期、没有时间时设为全天：start_at 为当天 00:00，end_at 为次日 00:00。
5. 没有状态时 status=todo；没有优先级时 priority=1。
6. 优先级映射：低=1，中=2，高=3，紧急=4。
7. workspace_name 和 project_name 只能从上面的空间与项目列表中选择，名称必须与列表完全一致。
   用户提到空间或项目（例如「某某空间」「放到某某项目」「空间是…」「项目叫…」）时必须填写；
   只提到项目、且该项目只属于一个空间时，同时填写那个空间。
   用户没提到时返回 null，不要猜列表第一项，也不要编造列表外的名称。
   负责人与参与人同样不要编造；未提到时 assignee_name 为 null，participant_names 为空数组。
8. “每天、每周、每月”等重复表达写入 recurrence_text，并将 recurrence_text 加入
   missing_fields，提醒当前版本不能自动创建重复任务。
9. 标题必须简洁，只保留要做的事，不要把日期、时间、地点、空间、项目堆进标题。
10. body 是任务描述。用简短中文写下之后执行需要的关键信息：具体要做什么、背景、材料、注意事项，
    以及用户提到的时间、地点和相关的人。不要把空间名和项目名重复写进描述。
    除标题外没有额外信息时 body 为 null。
11. 对无法确定的信息写入 ambiguities；不要自行猜测。
12. 只输出符合下方 JSON Schema 的 JSON 对象，不要输出解释、Markdown 或代码围栏：
{json.dumps(_TASK_DRAFT_SCHEMA, ensure_ascii=False)}
""".strip()


def build_minimax_request(
    payload: NaturalLanguageParseRequest,
    *,
    selected_date: date | None,
    model: str | None = None,
    catalog: list[WorkspaceCatalog] | None = None,
) -> dict[str, Any]:
    return {
        "model": model or settings.minimax_model,
        "messages": [
            {
                "role": "system",
                "content": _system_prompt(payload, selected_date=selected_date, catalog=catalog),
            },
            {"role": "user", "content": payload.text.strip()},
        ],
        "temperature": 1.0,
        "top_p": 0.95,
        "max_completion_tokens": 2048,
        "reasoning_split": True,
    }


def extract_output_text(response: dict[str, Any]) -> str:
    choices = response.get("choices")
    if isinstance(choices, list) and choices:
        message = choices[0].get("message", {})
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            without_thinking = re.sub(
                r"<think>.*?</think>",
                "",
                content,
                flags=re.DOTALL | re.IGNORECASE,
            ).strip()
            fenced = re.fullmatch(
                r"```(?:json)?\s*(.*?)\s*```",
                without_thinking,
                flags=re.DOTALL | re.IGNORECASE,
            )
            return fenced.group(1).strip() if fenced else without_thinking
    raise NaturalLanguageProviderError("自然语言解析服务未返回有效内容")


def parse_provider_response(response: dict[str, Any]) -> NaturalLanguageParseOut:
    try:
        raw = json.loads(extract_output_text(response))
        parsed = NaturalLanguageParseOut.model_validate(raw)
    except (json.JSONDecodeError, ValidationError) as error:
        raise NaturalLanguageProviderError("自然语言解析结果格式无效，请重试") from error

    if not parsed.draft.title.strip():
        raise NaturalLanguageProviderError("未能从描述中识别任务标题")
    return parsed


def post_chat(candidate: LlmKeyCandidate, body: dict[str, Any]) -> dict[str, Any]:
    url = f"{candidate.base_url.rstrip('/')}/chat/completions"
    with httpx.Client(timeout=candidate.timeout_seconds) as client:
        response = client.post(
            url,
            headers={
                "Authorization": f"Bearer {candidate.api_key}",
                "Content-Type": "application/json",
            },
            json=body,
        )
        response.raise_for_status()
        return response.json()


def probe_llm_key(candidate: LlmKeyCandidate) -> dict[str, Any]:
    """Tiny completion used by the settings page to see whether one key answers."""
    return post_chat(
        candidate,
        {
            "model": candidate.model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_completion_tokens": 16,
            "temperature": 0,
        },
    )


def run_chat_with_failover(
    candidates: list[LlmKeyCandidate],
    *,
    request_for: Callable[[LlmKeyCandidate], dict[str, Any]],
    poster: Callable[[LlmKeyCandidate, dict[str, Any]], dict[str, Any]],
    on_success: Callable[[LlmKeyCandidate], None],
    on_failure: Callable[[LlmKeyCandidate, Exception], None],
) -> tuple[NaturalLanguageParseOut, str]:
    if not candidates:
        raise NaturalLanguageConfigurationError("自然语言解析服务尚未配置")

    last_error: Exception | None = None
    for candidate in candidates:
        try:
            raw = poster(candidate, request_for(candidate))
        except (httpx.HTTPError, ValueError) as error:
            on_failure(candidate, error)
            last_error = error
            continue
        try:
            parsed = parse_provider_response(raw)
        except NaturalLanguageProviderError:
            on_success(candidate)
            raise
        on_success(candidate)
        return parsed, candidate.model

    raise NaturalLanguageProviderError("自然语言解析服务暂时不可用，请稍后重试") from last_error


def _parse(
    db: Session,
    payload: NaturalLanguageParseRequest,
    *,
    selected_date: date | None,
    user: User | None,
) -> tuple[NaturalLanguageParseOut, str]:
    from app.services.llm_api_keys import list_call_candidates, record_failure, record_success

    catalog = load_workspace_catalog(db, user) if user is not None else []
    parsed, provider = run_chat_with_failover(
        list_call_candidates(db),
        request_for=lambda key: build_minimax_request(
            payload, selected_date=selected_date, model=key.model, catalog=catalog
        ),
        poster=post_chat,
        on_success=record_success,
        on_failure=record_failure,
    )
    parsed = apply_catalog_and_description(
        parsed,
        text=payload.text,
        catalog=catalog,
        timezone_name=payload.timezone,
    )
    return parsed, provider


def parse_natural_language_task(
    db: Session,
    payload: NaturalLanguageParseRequest,
    user: User,
) -> NaturalLanguageParseOut:
    """Schedule entry point. Uses the page's selected date when the text has none."""
    parsed, _provider = _parse(db, payload, selected_date=payload.selected_date, user=user)
    return parsed


def parse_natural_language_task_without_date(
    db: Session,
    text: str,
    *,
    timezone: str,
    reference_time: datetime,
    user: User | None = None,
) -> tuple[NaturalLanguageParseOut, str]:
    """Sticky-note entry point. The model infers a date, or leaves it empty."""
    payload = NaturalLanguageParseRequest(
        text=text,
        timezone=timezone,
        reference_time=reference_time,
        selected_date=reference_time.date(),  # temporary; only used to satisfy schema
    )
    return _parse(db, payload, selected_date=None, user=user)
