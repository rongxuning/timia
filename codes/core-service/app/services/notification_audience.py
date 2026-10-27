"""Pure recipient selection for notification scenarios."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field


@dataclass
class NotificationIntent:
    scenario_key: str
    sender_user_id: uuid.UUID
    user_ids: list[uuid.UUID]
    link: str
    variables: dict[str, str] = field(default_factory=dict)


def dedupe_user_ids(
    user_ids: list[uuid.UUID],
    *,
    exclude: set[uuid.UUID] | None = None,
) -> list[uuid.UUID]:
    skip = exclude or set()
    seen: set[uuid.UUID] = set()
    out: list[uuid.UUID] = []
    for uid in user_ids:
        if uid in skip or uid in seen:
            continue
        seen.add(uid)
        out.append(uid)
    return out


def coerce_user_ids(values) -> list[uuid.UUID]:
    out: list[uuid.UUID] = []
    for value in values or []:
        if isinstance(value, uuid.UUID):
            out.append(value)
        else:
            out.append(uuid.UUID(str(value)))
    return out


def added_participant_ids(
    before: list[uuid.UUID],
    after: list[uuid.UUID],
) -> list[uuid.UUID]:
    previous = set(before)
    return dedupe_user_ids([uid for uid in after if uid not in previous])


def plan_participant_changes(
    *,
    actor_id: uuid.UUID,
    actor_name: str,
    task_title: str,
    link: str,
    assignee_id: uuid.UUID | None,
    creator_id: uuid.UUID | None,
    before_participant_ids: list[uuid.UUID],
    after_participant_ids: list[uuid.UUID],
) -> list[NotificationIntent]:
    added = added_participant_ids(before_participant_ids, after_participant_ids)
    intents: list[NotificationIntent] = []
    if actor_id in added:
        recipient = assignee_id or creator_id
        if recipient is not None and recipient != actor_id:
            intents.append(
                NotificationIntent(
                    scenario_key="task_self_join",
                    sender_user_id=actor_id,
                    user_ids=[recipient],
                    link=link,
                    variables={"actor_name": actor_name, "task_title": task_title},
                )
            )
    others = dedupe_user_ids(added, exclude={actor_id})
    if others:
        intents.append(
            NotificationIntent(
                scenario_key="task_member_added",
                sender_user_id=actor_id,
                user_ids=others,
                link=link,
                variables={"actor_name": actor_name, "task_title": task_title},
            )
        )
    return intents


def plan_task_created(
    *,
    actor_id: uuid.UUID,
    actor_name: str,
    task_title: str,
    project_name: str,
    link: str,
    project_member_ids: list[uuid.UUID],
    participant_ids: list[uuid.UUID],
    assignee_id: uuid.UUID | None,
    creator_id: uuid.UUID | None,
) -> list[NotificationIntent]:
    intents: list[NotificationIntent] = []
    members = dedupe_user_ids(project_member_ids, exclude={actor_id})
    if members:
        intents.append(
            NotificationIntent(
                scenario_key="task_created_in_project",
                sender_user_id=actor_id,
                user_ids=members,
                link=link,
                variables={
                    "actor_name": actor_name,
                    "task_title": task_title,
                    "project_name": project_name,
                },
            )
        )
    intents.extend(
        plan_participant_changes(
            actor_id=actor_id,
            actor_name=actor_name,
            task_title=task_title,
            link=link,
            assignee_id=assignee_id,
            creator_id=creator_id,
            before_participant_ids=[],
            after_participant_ids=participant_ids,
        )
    )
    return intents


_COMMENT_EXCERPT_LIMIT = 80


def comment_excerpt(body: str, *, limit: int = _COMMENT_EXCERPT_LIMIT) -> str:
    text = (body or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit] + "…"


def plan_task_commented(
    *,
    actor_id: uuid.UUID,
    actor_name: str,
    task_title: str,
    comment_body: str,
    link: str,
    assignee_id: uuid.UUID | None,
) -> list[NotificationIntent]:
    if assignee_id is None or assignee_id == actor_id:
        return []
    return [
        NotificationIntent(
            scenario_key="task_commented",
            sender_user_id=actor_id,
            user_ids=[assignee_id],
            link=link,
            variables={
                "actor_name": actor_name,
                "task_title": task_title,
                "comment_excerpt": comment_excerpt(comment_body),
            },
        )
    ]


def plan_membership_added(
    *,
    scenario_key: str,
    actor_id: uuid.UUID,
    actor_name: str,
    target_user_id: uuid.UUID,
    link: str,
    variables: dict[str, str],
) -> NotificationIntent | None:
    if target_user_id == actor_id:
        return None
    return NotificationIntent(
        scenario_key=scenario_key,
        sender_user_id=actor_id,
        user_ids=[target_user_id],
        link=link,
        variables=variables,
    )
