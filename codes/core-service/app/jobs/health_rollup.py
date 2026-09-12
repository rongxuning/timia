from __future__ import annotations

import logging

from app.db.session import SessionLocal
from app.services.health_api import run_health_rollup

logger = logging.getLogger(__name__)


def main() -> None:
    db = SessionLocal()
    try:
        result = run_health_rollup(db)
        db.commit()
        logger.info("health_rollup rolled=%s", result["rolled"])
    finally:
        db.close()


if __name__ == "__main__":
    main()
