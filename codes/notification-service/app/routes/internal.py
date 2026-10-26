from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_internal_token
from app.db.deps import get_db
from app.services.push import pending_push_count

router = APIRouter(
    prefix="/internal",
    tags=["internal"],
    dependencies=[Depends(require_internal_token)],
    include_in_schema=False,
)


@router.post("/push/dispatch")
def dispatch_push(db: Session = Depends(get_db)):
    """P0 stub. P1 delivers pending rows to APNs."""
    return {
        "ok": False,
        "detail": "push_not_configured",
        "pending": pending_push_count(db),
    }
