from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.auth import router as auth_router
from app.routes.comments import router as comments_router
from app.routes.items import router as items_router
from app.routes.members import router as members_router
from app.routes.projects import router as projects_router
from app.routes.users import router as users_router
from app.routes.workspaces import router as workspaces_router
from app.core.config import settings
from app.routes.dev_db_tables import router as dev_db_tables_router
from app.routes.views.schedule import router as views_schedule_router
from app.routes.views.workspace import router as views_workspace_router
from app.routes.views.project import router as views_project_router
from app.routes.views.users import router as views_users_router
from app.routes.views.task import router as views_task_router
from app.routes.views.analytics import router as views_analytics_router


app = FastAPI(title="Timia API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(workspaces_router)
app.include_router(members_router)
app.include_router(users_router)
app.include_router(projects_router)
app.include_router(items_router)
app.include_router(comments_router)
app.include_router(dev_db_tables_router)
app.include_router(views_schedule_router)
app.include_router(views_workspace_router)
app.include_router(views_project_router)
app.include_router(views_users_router)
app.include_router(views_task_router)
app.include_router(views_analytics_router)


@app.get("/health")
def health():
    return {"ok": True}

