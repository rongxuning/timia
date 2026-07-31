from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.schemas.views.schedule import NaturalLanguageParseRequest
from app.services.natural_language_schedule import (
    build_minimax_request,
    parse_provider_response,
)


def _request() -> NaturalLanguageParseRequest:
    timezone = ZoneInfo("Asia/Shanghai")
    return NaturalLanguageParseRequest(
        text="明天下午3点开产品会议，持续1小时",
        timezone="Asia/Shanghai",
        reference_time=datetime(2026, 7, 30, 11, 0, tzinfo=timezone),
        selected_date=date(2026, 7, 30),
    )


def test_build_minimax_request_uses_chat_completions():
    body = build_minimax_request(_request())
    assert body["messages"][1]["content"] == "明天下午3点开产品会议，持续1小时"
    assert body["model"] == "MiniMax-M2.7"
    assert body["reasoning_split"] is True
    assert '"draft"' in body["messages"][0]["content"]


def test_parse_provider_response_validates_task_draft():
    response = {
        "choices": [
            {
                "message": {
                    "content": """
                        <think>Need to produce the required JSON.</think>
                        ```json
                        {
                          "draft": {
                            "title": "产品会议",
                            "body": null,
                            "start_at": "2026-07-31T15:00:00+08:00",
                            "end_at": "2026-07-31T16:00:00+08:00",
                            "all_day": false,
                            "status": "todo",
                            "priority": "1",
                            "location": null,
                            "workspace_name": null,
                            "project_name": null,
                            "assignee_name": null,
                            "participant_names": [],
                            "recurrence_text": null
                          },
                          "confidence": 0.96,
                          "assumptions": [],
                          "missing_fields": ["workspace_name", "project_name"],
                          "ambiguities": []
                        }
                        ```
                        """
                },
            }
        ]
    }
    parsed = parse_provider_response(response)
    assert parsed.draft.title == "产品会议"
    assert parsed.draft.start_at is not None
    assert parsed.draft.start_at.hour == 15
    assert parsed.confidence == 0.96
