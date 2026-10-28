"""Merge two user accounts. The earlier created_at survives.

Edge cases are documented in docs/technical-solution/ios-multi-provider-auth.md.
Raw SQL is used so every users.id foreign key is moved, including tables owned
by file-service and notification-service in the same database.
"""

from __future__ import annotations

import logging
import re
import uuid

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.models._mixins import utcnow
from app.models.mobile_auth import MobileSession
from app.models.user import User
from app.models.web_auth import WebSession

logger = logging.getLogger(__name__)

_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_SKIP_MOVE = {
    ("mobile_sessions", "user_id"),
    ("web_sessions", "user_id"),
    ("asset_code_counters", "owner_user_id"),
}

_FK_SQL = text(
    """
    SELECT rel.relname AS table_name, att.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN LATERAL unnest(con.conkey, con.confkey) AS cols(src_attnum, dst_attnum) ON true
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.src_attnum
    JOIN pg_class frel ON frel.oid = con.confrelid
    JOIN pg_attribute fatt ON fatt.attrelid = frel.oid AND fatt.attnum = cols.dst_attnum
    WHERE con.contype = 'f'
      AND nsp.nspname = 'public'
      AND frel.relname = 'users'
      AND fatt.attname = 'id'
      AND rel.relname <> 'users'
    """
)

_INDEX_SQL = text(
    """
    SELECT array_agg(att.attname ORDER BY cols.ord) AS columns
    FROM pg_index idx
    JOIN pg_class rel ON rel.oid = idx.indrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS cols(attnum, ord) ON true
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.attnum
    WHERE nsp.nspname = 'public'
      AND rel.relname = :table_name
      AND idx.indisunique
      AND NOT (0 = ANY (idx.indkey))
    GROUP BY idx.indexrelid
    """
)

_ARRAY_SQL = text(
    """
    SELECT c.relname AS table_name, a.attname AS column_name
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'public'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND t.typname = '_uuid'
      AND a.attname LIKE '%user_id%'
    """
)


class AccountMergeError(RuntimeError):
    def __init__(self, detail: str, status_code: int = 409):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def pick_survivor(left: User, right: User) -> tuple[User, User]:
    """Return (survivor, loser). Earlier created_at wins; id breaks ties."""
    left_key = (left.created_at, str(left.id))
    right_key = (right.created_at, str(right.id))
    if left_key <= right_key:
        return left, right
    return right, left


def resolve_active_user(db: Session, user: User) -> User:
    seen: set[uuid.UUID] = set()
    current = user
    while current.status == "merged" and current.merged_into_user_id:
        if current.id in seen:
            raise AccountMergeError("merge_cycle")
        seen.add(current.id)
        nxt = db.get(User, current.merged_into_user_id)
        if nxt is None:
            break
        current = nxt
    return current


def merge_accounts(db: Session, left: User, right: User) -> User:
    """Move the later account onto the earlier one. Idempotent if already merged."""
    for _ in range(3):
        left = resolve_active_user(db, left)
        right = resolve_active_user(db, right)
        if left.id == right.id:
            return left
        pair = sorted([left.id, right.id], key=str)
        rows = list(
            db.scalars(
                select(User).where(User.id.in_(pair)).order_by(User.id).with_for_update()
            ).all()
        )
        locked = {row.id: row for row in rows}
        left = resolve_active_user(db, locked[left.id])
        right = resolve_active_user(db, locked[right.id])
        if left.id == right.id:
            return left
        if {left.id, right.id} == set(pair):
            break
    else:
        raise AccountMergeError("merge_conflict")

    survivor, loser = pick_survivor(left, right)
    survivor_id = survivor.id
    loser_id = loser.id
    _upgrade_overlapping_memberships(db, loser_id, survivor_id)
    _merge_asset_code_counters(db, loser_id, survivor_id)
    _move_foreign_keys(db, loser_id, survivor_id)
    _rewrite_user_id_arrays(db, loser_id, survivor_id)
    db.execute(
        update(User)
        .where(User.merged_into_user_id == loser_id)
        .values(merged_into_user_id=survivor_id)
    )
    _revoke_sessions(db, loser_id)
    _transfer_login_secrets(db, survivor, loser)
    loser.status = "merged"
    loser.merged_into_user_id = survivor_id
    db.flush()
    db.expire_all()
    logger.info("merged user %s into %s", loser_id, survivor_id)
    merged = db.get(User, survivor_id)
    if merged is None:
        raise AccountMergeError("merge_conflict")
    return merged


def _q(name: str) -> str:
    if not _IDENT.match(name):
        raise AccountMergeError("unsafe_identifier")
    return f'"{name}"'


def _upgrade_overlapping_memberships(
    db: Session, loser_id: uuid.UUID, survivor_id: uuid.UUID
) -> None:
    _upgrade_membership(
        db,
        table="workspace_members",
        scope="workspace_id",
        loser_id=loser_id,
        survivor_id=survivor_id,
        favorite=True,
    )
    _upgrade_membership(
        db,
        table="project_members",
        scope="project_id",
        loser_id=loser_id,
        survivor_id=survivor_id,
        favorite=False,
    )


def _upgrade_membership(
    db: Session,
    *,
    table: str,
    scope: str,
    loser_id: uuid.UUID,
    survivor_id: uuid.UUID,
    favorite: bool,
) -> None:
    if not _table_exists(db, table):
        return
    extra = ""
    if favorite:
        extra = """,
            is_favorite = survivor.is_favorite OR loser.is_favorite,
            last_active_at = CASE
                WHEN survivor.last_active_at IS NULL THEN loser.last_active_at
                WHEN loser.last_active_at IS NULL THEN survivor.last_active_at
                ELSE GREATEST(survivor.last_active_at, loser.last_active_at)
            END
        """
    db.execute(
        text(
            f"""
            UPDATE {_q(table)} AS survivor
            SET role = CASE
                    WHEN survivor.role = 'owner' OR loser.role = 'owner' THEN 'owner'
                    ELSE survivor.role
                END,
                status = CASE
                    WHEN survivor.status = 'active' OR loser.status = 'active' THEN 'active'
                    ELSE survivor.status
                END
                {extra}
            FROM {_q(table)} AS loser
            WHERE survivor.user_id = :survivor_id
              AND loser.user_id = :loser_id
              AND survivor.{_q(scope)} = loser.{_q(scope)}
            """
        ),
        {"loser_id": loser_id, "survivor_id": survivor_id},
    )


def _merge_asset_code_counters(db: Session, loser_id: uuid.UUID, survivor_id: uuid.UUID) -> None:
    if not _table_exists(db, "asset_code_counters"):
        return
    db.execute(
        text(
            """
            INSERT INTO asset_code_counters (owner_user_id, next_value)
            SELECT :survivor_id, next_value
            FROM asset_code_counters
            WHERE owner_user_id = :loser_id
            ON CONFLICT (owner_user_id) DO UPDATE
            SET next_value = GREATEST(asset_code_counters.next_value, EXCLUDED.next_value)
            """
        ),
        {"loser_id": loser_id, "survivor_id": survivor_id},
    )
    db.execute(
        text("DELETE FROM asset_code_counters WHERE owner_user_id = :loser_id"),
        {"loser_id": loser_id},
    )


def _move_foreign_keys(db: Session, loser_id: uuid.UUID, survivor_id: uuid.UUID) -> None:
    rows = db.execute(_FK_SQL).all()
    seen: set[tuple[str, str]] = set()
    for table_name, column_name in rows:
        key = (table_name, column_name)
        if key in seen or key in _SKIP_MOVE:
            continue
        seen.add(key)
        if not _IDENT.match(table_name) or not _IDENT.match(column_name):
            raise AccountMergeError("unsafe_identifier")
        _delete_unique_conflicts(db, table_name, column_name, loser_id, survivor_id)
        db.execute(
            text(
                f"""
                UPDATE {_q(table_name)}
                SET {_q(column_name)} = :survivor_id
                WHERE {_q(column_name)} = :loser_id
                """
            ),
            {"loser_id": loser_id, "survivor_id": survivor_id},
        )


def _delete_unique_conflicts(
    db: Session,
    table_name: str,
    column_name: str,
    loser_id: uuid.UUID,
    survivor_id: uuid.UUID,
) -> None:
    indexes = db.execute(_INDEX_SQL, {"table_name": table_name}).all()
    for (columns,) in indexes:
        cols = _index_columns(columns)
        if column_name not in cols:
            continue
        others = [col for col in cols if col != column_name]
        params = {"loser_id": loser_id, "survivor_id": survivor_id}
        if not others:
            db.execute(
                text(
                    f"""
                    DELETE FROM {_q(table_name)} AS loser
                    WHERE loser.{_q(column_name)} = :loser_id
                      AND EXISTS (
                        SELECT 1 FROM {_q(table_name)} AS survivor
                        WHERE survivor.{_q(column_name)} = :survivor_id
                      )
                    """
                ),
                params,
            )
            continue
        match = " AND ".join(
            f"loser.{_q(col)} IS NOT DISTINCT FROM survivor.{_q(col)}" for col in others
        )
        db.execute(
            text(
                f"""
                DELETE FROM {_q(table_name)} AS loser
                USING {_q(table_name)} AS survivor
                WHERE loser.{_q(column_name)} = :loser_id
                  AND survivor.{_q(column_name)} = :survivor_id
                  AND loser.ctid <> survivor.ctid
                  AND {match}
                """
            ),
            params,
        )


def _rewrite_user_id_arrays(db: Session, loser_id: uuid.UUID, survivor_id: uuid.UUID) -> None:
    for table_name, column_name in db.execute(_ARRAY_SQL).all():
        if not _IDENT.match(table_name) or not _IDENT.match(column_name):
            raise AccountMergeError("unsafe_identifier")
        db.execute(
            text(
                f"""
                UPDATE {_q(table_name)}
                SET {_q(column_name)} = (
                    SELECT COALESCE(
                        array_agg(DISTINCT CASE
                            WHEN x = :loser_id THEN :survivor_id
                            ELSE x
                        END),
                        '{{}}'::uuid[]
                    )
                    FROM unnest({_q(column_name)}) AS x
                )
                WHERE :loser_id = ANY ({_q(column_name)})
                """
            ),
            {"loser_id": loser_id, "survivor_id": survivor_id},
        )


def _revoke_sessions(db: Session, loser_id: uuid.UUID) -> None:
    now = utcnow()
    db.execute(
        update(MobileSession)
        .where(MobileSession.user_id == loser_id, MobileSession.revoked_at.is_(None))
        .values(revoked_at=now, revoke_reason="account_merged")
    )
    db.execute(
        update(WebSession)
        .where(WebSession.user_id == loser_id, WebSession.revoked_at.is_(None))
        .values(revoked_at=now, revoke_reason="account_merged")
    )


def _index_columns(columns: object) -> list[str]:
    if columns is None:
        return []
    if isinstance(columns, str):
        inner = columns.strip().strip("{}")
        return [part.strip().strip('"') for part in inner.split(",") if part.strip()]
    return [str(part) for part in columns]


def _transfer_login_secrets(db: Session, survivor: User, loser: User) -> None:
    """Keep the survivor's email and password when both accounts have them.

    The absorbed email stops working for password login. Its provider identities
    still move. If the survivor has no email, the loser's email and password
    are copied across so password login keeps working.
    """
    moved_email = None
    moved_password = None
    if not survivor.email and loser.email:
        moved_email = loser.email
        moved_password = loser.password_hash
    loser.email = None
    loser.password_hash = None
    db.flush()
    if moved_email:
        survivor.email = moved_email
        if not survivor.password_hash:
            survivor.password_hash = moved_password


def _table_exists(db: Session, name: str) -> bool:
    found = db.scalar(text("SELECT to_regclass(:qualified)"), {"qualified": f"public.{name}"})
    return found is not None
