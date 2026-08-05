"""Natural-language task parsing through a server-side structured model response."""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Any

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.views.schedule import (
    NaturalLanguageParseOut,
    NaturalLanguageParseRequest,
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

规则：
1. 相对日期和时间必须基于参考时间与用户时区解析，并输出带时区的 ISO 8601。
{rule_no_date}
3. 有具体时间但没有结束时间或时长时，默认持续一小时，并在 assumptions 中说明。
4. 只有日期、没有时间时设为全天：start_at 为当天 00:00，end_at 为次日 00:00。
5. 没有状态时 status=todo；没有优先级时 priority=1。
6. 优先级映射：低=1，中=2，高=3，紧急=4。
7. 不要编造空间、项目、负责人或参与人名称；用户未提及时返回 null 或空数组。
8. “每天、每周、每月”等重复表达写入 recurrence_text，并将 recurrence_text 加入
   missing_fields，提醒当前版本不能自动创建重复任务。
9. 标题必须简洁，移除已经拆入日期、时间、地点的附加描述。
10. 对无法确定的信息写入 ambiguities；不要自行猜测。
11. 只输出符合下方 JSON Schema 的 JSON 对象，不要输出解释、Markdown 或代码围栏：
{json.dumps(_TASK_DRAFT_SCHEMA, ensure_ascii=False)}
""".strip()


def build_minimax_request(
    payload: NaturalLanguageParseRequest,
    *,
    selected_date: date | None,
) -> dict[str, Any]:
    return {
        "model": settings.minimax_model,
        "messages": [
            {"role": "system", "content": _system_prompt(payload, selected_date=selected_date)},
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


def parse_natural_language_task(
    payload: NaturalLanguageParseRequest,
) -> NaturalLanguageParseOut:
    """Backwards-compatible entry point — passes ``selected_date`` through.

    The schedule view sends ``payload.selected_date`` so the model uses it as
    the implicit date when the text is ambiguous. Pass it explicitly so any
    future change to ``NaturalLanguageParseRequest.selected_date``'s
    nullability does not silently break the schedule call.
    """
    if not settings.minimax_api_key:
        raise NaturalLanguageConfigurationError("自然语言解析服务尚未配置")

    url = f"{settings.minimax_base_url.rstrip('/')}/chat/completions"
    try:
        with httpx.Client(timeout=settings.minimax_timeout_seconds) as client:
            response = client.post(
                url,
                headers={
                    "Authorization": f"Bearer {settings.minimax_api_key}",
                    "Content-Type": "application/json",
                },
                json=build_minimax_request(payload, selected_date=payload.selected_date),
            )
            response.raise_for_status()
            body = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise NaturalLanguageProviderError("自然语言解析服务暂时不可用，请稍后重试") from error

    return parse_provider_response(body)


def parse_natural_language_task_without_date(
    text: str,
    *,
    timezone: str,
    reference_time: datetime,
) -> NaturalLanguageParseOut:
    """Variant for sticky notes — no ``selected_date`` context.

    The model is told to infer a date from the text itself; if it cannot, it
    should leave ``start_at``/``end_at`` null and note the ambiguity.
    """
    if not settings.minimax_api_key:
        raise NaturalLanguageConfigurationError("自然语言解析服务尚未配置")

    payload = NaturalLanguageParseRequest(
        text=text,
        timezone=timezone,
        reference_time=reference_time,
        selected_date=reference_time.date(),  # temporary; only used to satisfy schema
    )
    url = f"{settings.minimax_base_url.rstrip('/')}/chat/completions"
    try:
        with httpx.Client(timeout=settings.minimax_timeout_seconds) as client:
            response = client.post(
                url,
                headers={
                    "Authorization": f"Bearer {settings.minimax_api_key}",
                    "Content-Type": "application/json",
                },
                json=build_minimax_request(payload, selected_date=None),
            )
            response.raise_for_status()
            body = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise NaturalLanguageProviderError("自然语言解析服务暂时不可用，请稍后重试") from error

    return parse_provider_response(body)
