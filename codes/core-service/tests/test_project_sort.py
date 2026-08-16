from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.services.project_sort import sort_projects_favorite_then_created


def _p(name: str, created_at: datetime, pid=None):
    return SimpleNamespace(id=pid or uuid4(), name=name, created_at=created_at)


def test_favorites_before_non_favorites():
    older = datetime(2026, 1, 1, tzinfo=timezone.utc)
    newer = datetime(2026, 8, 1, tzinfo=timezone.utc)
    fav = _p("fav", older)
    plain = _p("plain", newer)
    out = sort_projects_favorite_then_created([plain, fav], {fav.id})
    assert [p.name for p in out] == ["fav", "plain"]


def test_same_favorite_flag_newer_created_at_first():
    older = datetime(2026, 1, 1, tzinfo=timezone.utc)
    newer = datetime(2026, 8, 1, tzinfo=timezone.utc)
    a = _p("old", older)
    b = _p("new", newer)
    out = sort_projects_favorite_then_created([a, b], set())
    assert [p.name for p in out] == ["new", "old"]
