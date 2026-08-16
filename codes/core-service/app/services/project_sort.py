from __future__ import annotations

import uuid
from typing import TypeVar

T = TypeVar("T")


def sort_projects_favorite_then_created(projects: list[T], favorite_ids: set[uuid.UUID]) -> list[T]:
    return sorted(
        projects,
        key=lambda project: (
            project.id in favorite_ids,
            project.created_at,
            str(project.id),
        ),
        reverse=True,
    )
