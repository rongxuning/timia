import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.session import SessionLocal
from app.routes.admin import router as admin_router
from app.routes.devices import router as devices_router
from app.routes.inbox import router as inbox_router
from app.routes.internal import router as internal_router
from app.routes.notifications import router as notifications_router
from app.services.dispatch import dispatch_due_notifications
from app.services.push import flush_pending_pushes

logger = logging.getLogger(__name__)


def run_dispatch_once() -> dict[str, int]:
    db = SessionLocal()
    try:
        result = dispatch_due_notifications(db)
        flushed = flush_pending_pushes(db)
        if flushed.get("sent") or flushed.get("failed") or flushed.get("skipped"):
            logger.info("pending push flush %s", flushed)
        return result
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def _dispatch_loop(stop: asyncio.Event, interval: int) -> None:
    while not stop.is_set():
        try:
            result = await asyncio.to_thread(run_dispatch_once)
            if result["delivered"] or result["skipped"]:
                logger.info("notification dispatch %s", result)
        except Exception:
            logger.exception("notification dispatch failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except TimeoutError:
            continue
        else:
            return


@asynccontextmanager
async def lifespan(_app: FastAPI):
    stop = asyncio.Event()
    task: asyncio.Task | None = None
    interval = settings.notification_dispatch_interval_seconds
    if interval > 0:
        task = asyncio.create_task(_dispatch_loop(stop, interval))
    yield
    stop.set()
    if task is not None:
        await task


app = FastAPI(title="Timia Notification Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(notifications_router)
app.include_router(inbox_router)
app.include_router(admin_router)
app.include_router(devices_router)
app.include_router(internal_router)


@app.get("/health")
def health():
    return {"ok": True}
