from app.routes.admin import router as admin_router
from app.routes.devices import router as devices_router
from app.routes.inbox import router as inbox_router
from app.routes.internal import router as internal_router
from app.routes.notifications import router as notifications_router

__all__ = [
    "admin_router",
    "devices_router",
    "inbox_router",
    "internal_router",
    "notifications_router",
]
