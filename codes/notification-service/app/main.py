from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routes.admin import router as admin_router
from app.routes.inbox import router as inbox_router
from app.routes.internal import router as internal_router
from app.routes.notifications import router as notifications_router

app = FastAPI(title="Timia Notification Service")

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
app.include_router(internal_router)


@app.get("/health")
def health():
    return {"ok": True}
