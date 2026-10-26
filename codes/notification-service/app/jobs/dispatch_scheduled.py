"""One-shot scan for due delay/scheduled notifications.

The service also runs this on a timer (see ``notification_dispatch_interval_seconds``).
Use the module when that loop is disabled:

    python -m app.jobs.dispatch_scheduled
"""

from __future__ import annotations

import logging

from app.db.session import SessionLocal
from app.services.dispatch import dispatch_due_notifications
from app.services.push import flush_pending_pushes

logger = logging.getLogger(__name__)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    db = SessionLocal()
    try:
        result = dispatch_due_notifications(db)
        flushed = flush_pending_pushes(db)
        logger.info(
            "dispatch_scheduled delivered=%s skipped=%s delivery_count=%s push_sent=%s",
            result["delivered"],
            result["skipped"],
            result["delivery_count"],
            flushed.get("sent", 0),
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
